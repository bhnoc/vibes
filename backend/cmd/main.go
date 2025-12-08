package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	// "math/rand"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/c-robinson/iplib"
	"github.com/gorilla/websocket"
	"vibes-network-visualizer/internal/capture"
	"vibes-network-visualizer/internal/storage"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512
	flowTimeout    = 60 * time.Second
)

var (
	addr          = flag.String("addr", ":8080", "http service address")
	iface         = flag.String("iface", "", "network interface to capture (empty for simulated data)")
	pcapFile      = flag.String("pcap", "", "path to PCAP file for replay mode")
	replaySpeed   = flag.Float64("speed", 1.0, "replay speed multiplier (1.0 = real-time, 2.0 = 2x speed)")
	storageDir    = flag.String("storage", "/data/pcaps", "directory containing PCAP archives for time window playback")
	useDumpcap    = flag.Bool("dumpcap", false, "use external dumpcap for high-performance capture (requires dumpcap to be running)")
	dumpcapDir    = flag.String("dumpcap-dir", "/data/pcaps", "directory where dumpcap writes PCAP files")
	launchDumpcap = flag.Bool("launch-dumpcap", false, "automatically launch dumpcap process if not running")

	// Storage management flags
	maxStorageGB     = flag.Int64("max-storage-gb", 600, "maximum storage size in GB for PCAP files")
	fileRotationMB   = flag.Int64("file-rotation-mb", 1000, "rotate PCAP files after this many MB")
	fileRotationMins = flag.Int("file-rotation-mins", 60, "rotate PCAP files after this many minutes")
	ringBufferFiles  = flag.Int("ring-buffer-files", 0, "safety net: max files to keep (0 = auto-calculate from max-storage-gb)")

	// Global storage manager instance
	storageManager *storage.Manager

	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true // Allow all origins
		},
	}
)

// Flow represents a network flow
type Flow struct {
	lastSeen    time.Time
	packetCount int
	sampleCount int
}

// FlowTracker manages active network flows
type FlowTracker struct {
	flows  map[string]*Flow
	mutex  sync.Mutex
	ticker *time.Ticker
}

// NewFlowTracker creates a new FlowTracker
func NewFlowTracker() *FlowTracker {
	ft := &FlowTracker{
		flows:  make(map[string]*Flow),
		ticker: time.NewTicker(10 * time.Second),
	}
	go ft.cleanupExpiredFlows()
	return ft
}

// cleanupExpiredFlows removes flows that have not seen packets for a while
func (ft *FlowTracker) cleanupExpiredFlows() {
	for range ft.ticker.C {
		ft.mutex.Lock()
		for key, flow := range ft.flows {
			if time.Since(flow.lastSeen) > flowTimeout {
				delete(ft.flows, key)
			}
		}
		ft.mutex.Unlock()
	}
}

// Client represents a single WebSocket client
type Client struct {
	conn          *websocket.Conn
	send          chan []byte
	disconnected  chan struct{}
	stopForwarder chan struct{}
}

// ClientManager manages all connected clients
type ClientManager struct {
	clients             map[*Client]bool
	broadcast           chan []byte
	register            chan *Client
	unregister          chan *Client
	pinningRules        []string
	rulesMutex          sync.RWMutex
	timeWindowProcessor *capture.TimeWindowProcessor
	currentCaptureMode  string
	originalCapture     capture.PacketCapture
	flowTracker         *FlowTracker
}

// NewClientManager creates a new ClientManager
func NewClientManager() *ClientManager {
	return &ClientManager{
		clients:      make(map[*Client]bool),
		broadcast:    make(chan []byte),
		register:     make(chan *Client),
		unregister:   make(chan *Client),
		pinningRules: make([]string, 0),
		flowTracker:  NewFlowTracker(),
	}
}

// NewClient creates a new Client
func NewClient(conn *websocket.Conn) *Client {
	return &Client{
		conn:          conn,
		send:          make(chan []byte, 256),
		disconnected:  make(chan struct{}),
		stopForwarder: make(chan struct{}),
	}
}

// isIPPinned checks if an IP address is pinned
func (manager *ClientManager) isIPPinned(ipStr string) bool {
	manager.rulesMutex.RLock()
	defer manager.rulesMutex.RUnlock()

	ip := net.ParseIP(ipStr)
	if ip == nil {
		return false
	}

	for _, rule := range manager.pinningRules {
		if strings.Contains(rule, "/") { // CIDR
			_, ipnet, err := net.ParseCIDR(rule)
			if err == nil && ipnet.Contains(ip) {
				return true
			}
		} else if strings.Contains(rule, "-") { // Range
			parts := strings.Split(rule, "-")
			startIPStr := parts[0]
			endOctetStr := parts[1]

			startIP := net.ParseIP(startIPStr)
			if startIP == nil {
				continue
			}

			baseIPParts := strings.Split(startIPStr, ".")
			if len(baseIPParts) != 4 {
				continue
			}

			endIPStr := fmt.Sprintf("%s.%s.%s.%s", baseIPParts[0], baseIPParts[1], baseIPParts[2], endOctetStr)
			endIP := net.ParseIP(endIPStr)
			if endIP == nil {
				continue
			}

			if iplib.CompareIPs(ip, startIP) >= 0 && iplib.CompareIPs(ip, endIP) <= 0 {
				return true
			}
		} else { // Exact match
			if ipStr == rule {
				return true
			}
		}
	}
	return false
}

// Packet send statistics
var (
	packetsSentTotal     int64
	packetsDroppedTotal  int64
	lastPacketStatLog    time.Time
	packetStatMutex      sync.Mutex
)

// shouldSendPacket implements intelligent flow-based sampling
func (manager *ClientManager) shouldSendPacket(packet *capture.Packet) bool {
	shouldSend := false

	if manager.isIPPinned(packet.Src) || manager.isIPPinned(packet.Dst) {
		shouldSend = true
	} else {
		flowKey := fmt.Sprintf("%s:%d-%s:%d", packet.Src, packet.SrcPort, packet.Dst, packet.DstPort)
		manager.flowTracker.mutex.Lock()

		flow, exists := manager.flowTracker.flows[flowKey]
		if !exists {
			manager.flowTracker.flows[flowKey] = &Flow{
				lastSeen:    time.Now(),
				packetCount: 1,
				sampleCount: 1,
			}
			shouldSend = true
		} else {
			flow.lastSeen = time.Now()
			flow.packetCount++

			// Simple dynamic sampling: send 1 in every N packets for a given flow
			// Reduced sampling to send more packets for better visualization
			if flow.packetCount%2 == 0 {
				flow.sampleCount++
				shouldSend = true
			}
		}
		manager.flowTracker.mutex.Unlock()
	}

	// Update stats
	packetStatMutex.Lock()
	if shouldSend {
		packetsSentTotal++
	} else {
		packetsDroppedTotal++
	}

	// Log every 5 seconds
	if time.Since(lastPacketStatLog) > 5*time.Second {
		log.Printf("📤 Packet stats: sent=%d, dropped=%d (sampling ratio: %.1f%%)",
			packetsSentTotal, packetsDroppedTotal,
			float64(packetsSentTotal)/float64(packetsSentTotal+packetsDroppedTotal)*100)
		lastPacketStatLog = time.Now()
	}
	packetStatMutex.Unlock()

	return shouldSend
}

// Start begins the client manager's event loop
func (manager *ClientManager) Start() {
	for {
		select {
		case client := <-manager.register:
			manager.clients[client] = true
			log.Printf("Client connected. Total clients: %d", len(manager.clients))
		case client := <-manager.unregister:
			if _, ok := manager.clients[client]; ok {
				delete(manager.clients, client)
				close(client.stopForwarder)
				go func() {
					time.Sleep(50 * time.Millisecond)
					close(client.send)
				}()
				log.Printf("Client disconnected. Total clients: %d", len(manager.clients))
			}
		case message := <-manager.broadcast:
			for client := range manager.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(manager.clients, client)
				}
			}
		}
	}
}

// HandleWebSocket handles incoming WebSocket connections
func (manager *ClientManager) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	ifaceName := r.URL.Query().Get("interface")
	pcapParam := r.URL.Query().Get("pcap")
	speedParam := r.URL.Query().Get("speed")

	var captureSystem capture.PacketCapture
	captureMode := "simulated"

	selectedPcapFile := *pcapFile
	selectedReplaySpeed := *replaySpeed
	selectedInterface := *iface

	if pcapParam != "" {
		selectedPcapFile = pcapParam
	}
	if speedParam != "" {
		if speed, err := strconv.ParseFloat(speedParam, 64); err == nil && speed > 0 {
			selectedReplaySpeed = speed
		}
	}
	if ifaceName != "" {
		selectedInterface = ifaceName
	}

	if selectedPcapFile != "" {
		config := capture.PCAPReplayConfig{
			FilePath:    selectedPcapFile,
			ReplaySpeed: selectedReplaySpeed,
		}
		captureSystem = capture.NewPCAPReplayCapture(config)
		captureMode = "pcap_replay"
	} else if *useDumpcap {
		if err := handleDumpcapSetup(selectedInterface, *dumpcapDir); err != nil {
			log.Printf("❌ Dumpcap setup failed: %v", err)

			// Send error to frontend via WebSocket - don't silently fall back
			conn, upgradeErr := upgrader.Upgrade(w, r, nil)
			if upgradeErr != nil {
				log.Printf("WebSocket upgrade failed: %v", upgradeErr)
				return
			}

			hint := "Install dumpcap: sudo apt install wireshark-common"
			if strings.Contains(err.Error(), "not running") {
				hint = "Start dumpcap manually or use -launch-dumpcap flag"
			} else if strings.Contains(err.Error(), "auto-launch") {
				hint = "Check interface name is correct and you have capture permissions (may need sudo)"
			}

			errorMsg, _ := json.Marshal(map[string]interface{}{
				"type":          "capture_error",
				"error":         true,
				"requestedMode": "dumpcap",
				"errorMsg":      fmt.Sprintf("Dumpcap setup failed: %v", err),
				"hint":          hint,
				"interface":     selectedInterface,
			})
			conn.WriteMessage(websocket.TextMessage, errorMsg)
			conn.Close()
			return
		} else {
			captureSystem = capture.NewDumpcapCapture(*dumpcapDir, selectedInterface)
			captureMode = "dumpcap"
		}
	} else if selectedInterface != "" {
		captureSystem = capture.NewRealCapture(selectedInterface)
		captureMode = "real"
	} else {
		captureSystem = capture.NewSimulatedCapture()
		captureMode = "simulated"
	}

	captureFailed := false
	captureErrorMsg := ""
	originalMode := captureMode

	if err := captureSystem.Start(); err != nil {
		log.Printf("Failed to start %s capture: %v", captureMode, err)
		captureFailed = true
		captureErrorMsg = err.Error()

		// Only fall back to simulation if we weren't explicitly configured for a specific mode
		// When dumpcap or real capture is explicitly requested, don't silently fall back to simulation
		if *useDumpcap || *iface != "" || *pcapFile != "" {
			log.Printf("❌ %s mode was explicitly requested but failed to start", originalMode)
			log.Printf("❌ NOT falling back to simulation - sending error to frontend")

			// Send error details to frontend via WebSocket
			conn, upgradeErr := upgrader.Upgrade(w, r, nil)
			if upgradeErr != nil {
				log.Printf("WebSocket upgrade failed: %v", upgradeErr)
				return
			}

			hint := ""
			switch originalMode {
			case "dumpcap":
				hint = "Check that dumpcap is installed, the interface exists, and you have capture permissions (may need sudo)"
			case "real":
				hint = "Check that the interface exists and you have capture permissions (may need sudo)"
			case "pcap_replay":
				hint = "Check that the PCAP file exists and is readable"
			}

			errorMsg, _ := json.Marshal(map[string]interface{}{
				"type":          "capture_error",
				"error":         true,
				"requestedMode": originalMode,
				"errorMsg":      fmt.Sprintf("Failed to start %s capture: %v", originalMode, err),
				"hint":          hint,
				"interface":     selectedInterface,
				"pcapFile":      selectedPcapFile,
			})
			conn.WriteMessage(websocket.TextMessage, errorMsg)
			conn.Close()
			return
		}

		log.Printf("Falling back to simulated capture")
		captureSystem = capture.NewSimulatedCapture()
		if err := captureSystem.Start(); err != nil {
			http.Error(w, "Failed to start capture: "+err.Error(), http.StatusInternalServerError)
			return
		}
		captureMode = "simulated"
		log.Printf("*** FALLBACK TO SIMULATION (%s failed) ***", originalMode)
	} else {
		switch captureMode {
		case "real":
			log.Printf("*** 📡 REAL CAPTURE ACTIVE on interface %s ***", selectedInterface)
		case "dumpcap":
			log.Printf("*** 🚀 DUMPCAP MONITORING ACTIVE: %s (interface: %s) ***", *dumpcapDir, selectedInterface)
		case "pcap_replay":
			log.Printf("*** 🔥 PCAP REPLAY ACTIVE: %s (%.2fx speed) ***", selectedPcapFile, selectedReplaySpeed)
		case "simulated":
			log.Printf("*** 🎮 SIMULATION ACTIVE (synthetic traffic) ***")
		}
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		captureSystem.Stop()
		return
	}

	client := NewClient(conn)
	manager.register <- client

	manager.originalCapture = captureSystem
	manager.currentCaptureMode = captureMode

	var modeMessage []byte
	if captureFailed {
		modeMessage, _ = json.Marshal(map[string]interface{}{
			"type":          "mode",
			"mode":          captureMode,
			"interface":     selectedInterface,
			"pcapFile":      selectedPcapFile,
			"replaySpeed":   selectedReplaySpeed,
			"error":         true,
			"errorMsg":      captureErrorMsg,
			"requestedMode": originalMode,
		})
	} else {
		modeMessage, _ = json.Marshal(map[string]interface{}{
			"type":        "mode",
			"mode":        captureMode,
			"interface":   selectedInterface,
			"pcapFile":    selectedPcapFile,
			"replaySpeed": selectedReplaySpeed,
		})
	}
	client.send <- modeMessage

	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("Packet forwarder recovered from panic: %v", r)
			}
			log.Printf("Packet forwarder exiting for %s", client.conn.RemoteAddr())
		}()

		for {
			select {
			case <-client.stopForwarder:
				return
			default:
			}

			var packet *capture.Packet
			var packetReceived bool

			if manager.timeWindowProcessor != nil && manager.currentCaptureMode == "time_window" {
				select {
				case packet = <-manager.timeWindowProcessor.GetPacketChannel():
					packetReceived = true
				case <-client.stopForwarder:
					return
				case <-time.After(1 * time.Millisecond):
				}
			} else {
				select {
				case packet = <-captureSystem.GetPacketChannel():
					packetReceived = true
				case <-client.stopForwarder:
					return
				case <-time.After(1 * time.Millisecond):
				}
			}

			if packetReceived && packet != nil {
				if manager.shouldSendPacket(packet) {
					if packetJSON, err := packet.ToJSON(); err == nil {
						select {
						case client.send <- packetJSON:
						case <-client.stopForwarder:
							return
						}
					}
				}
			}
		}
	}()

	go client.writePump(manager)
	go client.readPump(manager)

	<-client.disconnected
	captureSystem.Stop()
}

func (c *Client) writePump(manager *ClientManager) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) readPump(manager *ClientManager) {
	defer func() {
		manager.unregister <- c
		c.conn.Close()
		close(c.disconnected)
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			break
		}

		var msg map[string]interface{}
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}

		msgType, ok := msg["type"].(string)
		if !ok {
			continue
		}

		manager.rulesMutex.Lock()
		switch msgType {
		case "pinRule":
			if rule, ok := msg["rule"].(string); ok {
				manager.pinningRules = append(manager.pinningRules, rule)
				log.Printf("Added pinning rule: %s", rule)
			}
		case "unpinRule":
			if rule, ok := msg["rule"].(string); ok {
				var newRules []string
				for _, r := range manager.pinningRules {
					if r != rule {
						newRules = append(newRules, r)
					}
				}
				manager.pinningRules = newRules
				log.Printf("Removed pinning rule: %s", rule)
			}
		case "clearAllPins":
			manager.pinningRules = make([]string, 0)
			log.Printf("Cleared all pinning rules")
		case "select_time_window":
			manager.rulesMutex.Unlock()
			manager.handleTimeWindowCommand(msg, c)
			continue
		case "switch_to_live":
			manager.rulesMutex.Unlock()
			manager.handleSwitchToLive(c)
			continue
		case "seek_to_time":
			manager.rulesMutex.Unlock()
			manager.handleSeekToTime(msg, c)
			continue
		}
		manager.rulesMutex.Unlock()
	}
}

func (manager *ClientManager) handleTimeWindowCommand(msg map[string]interface{}, client *Client) {
	startTimeStr, startOk := msg["start_time"].(string)
	endTimeStr, endOk := msg["end_time"].(string)
	speed, speedOk := msg["speed"].(float64)

	if !startOk || !endOk {
		log.Printf("Invalid time window command: missing start_time or end_time")
		return
	}

	startTime, err := time.Parse(time.RFC3339, startTimeStr)
	if err != nil {
		log.Printf("Invalid start_time format: %v", err)
		return
	}

	endTime, err := time.Parse(time.RFC3339, endTimeStr)
	if err != nil {
		log.Printf("Invalid end_time format: %v", err)
		return
	}

	replaySpeed := 1.0
	if speedOk && speed > 0 {
		replaySpeed = speed
	}

	log.Printf("🕰️ Time Window Request: %s to %s (%.2fx speed)", startTime.Format("15:04:05"), endTime.Format("15:04:05"), replaySpeed)

	config := capture.TimeWindowConfig{
		StorageDir:   *storageDir,
		StartTime:    startTime,
		EndTime:      endTime,
		ReplaySpeed:  replaySpeed,
		SamplingRate: 10, // Default sampling rate
	}
	processor := capture.NewTimeWindowProcessor(config)

	if manager.originalCapture != nil {
		manager.originalCapture.Stop()
	}

	if err := processor.Start(); err != nil {
		log.Printf("Failed to start time window playback: %v", err)
		response, _ := json.Marshal(map[string]interface{}{
			"type":  "time_window_error",
			"error": err.Error(),
		})
		client.send <- response
		return
	}

	manager.timeWindowProcessor = processor
	manager.currentCaptureMode = "time_window"

	response, _ := json.Marshal(map[string]interface{}{
		"type":       "time_window_active",
		"start_time": startTimeStr,
		"end_time":   endTimeStr,
		"speed":      replaySpeed,
	})
	client.send <- response

	log.Printf("⚡ Time window playback activated!")
}

func (manager *ClientManager) handleSwitchToLive(client *Client) {
	log.Printf("🔄 Switching back to live mode...")

	if manager.timeWindowProcessor != nil {
		manager.timeWindowProcessor.Stop()
		manager.timeWindowProcessor = nil
	}

	if manager.originalCapture != nil {
		if err := manager.originalCapture.Start(); err != nil {
			log.Printf("Failed to restart live capture: %v", err)
			response, _ := json.Marshal(map[string]interface{}{
				"type":  "switch_to_live_error",
				"error": err.Error(),
			})
			client.send <- response
			return
		}
	}

	manager.currentCaptureMode = "live"

	response, _ := json.Marshal(map[string]interface{}{
		"type": "live_mode_active",
	})
	client.send <- response

	log.Printf("📡 Live mode reactivated!")
}

func (manager *ClientManager) handleSeekToTime(msg map[string]interface{}, client *Client) {
	timeStr, ok := msg["time"].(string)
	if !ok {
		log.Printf("Invalid seek command: missing time")
		return
	}

	seekTime, err := time.Parse(time.RFC3339, timeStr)
	if err != nil {
		log.Printf("Invalid seek time format: %v", err)
		return
	}

	if manager.timeWindowProcessor == nil {
		log.Printf("No time window processor active for seeking")
		response, _ := json.Marshal(map[string]interface{}{
			"type":  "seek_error",
			"error": "No time window active",
		})
		client.send <- response
		return
	}

	log.Printf("⏰ Seeking to time: %s", seekTime.Format("15:04:05"))

	if err := manager.timeWindowProcessor.SeekToTime(seekTime); err != nil {
		log.Printf("Failed to seek to time: %v", err)
		response, _ := json.Marshal(map[string]interface{}{
			"type":  "seek_error",
			"error": err.Error(),
		})
		client.send <- response
		return
	}

	response, _ := json.Marshal(map[string]interface{}{
		"type": "seek_complete",
		"time": timeStr,
	})
	client.send <- response

	log.Printf("🎯 Seek complete!")
}

func checkDumpcapRunning() bool {
	// Use pgrep -x for exact match on process name, not command line
	// This avoids matching our own process which has "-dumpcap" as a flag
	cmd := exec.Command("pgrep", "-x", "dumpcap")
	err := cmd.Run()
	return err == nil
}

func checkDumpcapInstalled() bool {
	cmd := exec.Command("which", "dumpcap")
	err := cmd.Run()
	return err == nil
}

func killExistingDumpcap() {
	log.Printf("🔪 Killing any existing dumpcap processes...")
	cmd := exec.Command("pkill", "-9", "dumpcap")
	cmd.Run() // Ignore error - it's fine if no dumpcap was running
	time.Sleep(500 * time.Millisecond) // Give it time to die
}

func launchDumpcapProcess(iface string, outputDir string) error {
	if !checkDumpcapInstalled() {
		return fmt.Errorf("dumpcap not found in PATH - please install Wireshark/dumpcap")
	}

	// Kill any existing dumpcap processes first
	killExistingDumpcap()

	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return fmt.Errorf("failed to create dumpcap output directory: %v", err)
	}

	timestamp := time.Now().Format("2006-01-02_15-04-05")
	outputFile := filepath.Join(outputDir, fmt.Sprintf("dumpcap_%s_%s.pcap", iface, timestamp))

	// Calculate ring buffer file count if not specified
	ringFiles := *ringBufferFiles
	if ringFiles == 0 {
		// Auto-calculate: maxStorageGB / fileRotationMB (with some buffer)
		ringFiles = int((*maxStorageGB * 1024) / *fileRotationMB)
		if ringFiles < 10 {
			ringFiles = 10 // Minimum 10 files
		}
	}

	args := []string{
		"-i", iface,
		"-w", outputFile,
		"-b", fmt.Sprintf("duration:%d", *fileRotationMins*60),    // Convert minutes to seconds
		"-b", fmt.Sprintf("filesize:%d", *fileRotationMB*1024),    // Convert MB to KB (dumpcap uses KB)
		"-b", fmt.Sprintf("files:%d", ringFiles),                   // Ring buffer safety net
	}

	log.Printf("🚀 Launching dumpcap: dumpcap %s", strings.Join(args, " "))
	log.Printf("📊 Storage config: max %dGB, rotation %dMB/%dmins, ring buffer %d files",
		*maxStorageGB, *fileRotationMB, *fileRotationMins, ringFiles)

	// Find full path to dumpcap
	dumpcapPath, err := exec.LookPath("dumpcap")
	if err != nil {
		return fmt.Errorf("dumpcap not found in PATH: %v", err)
	}
	log.Printf("📍 Using dumpcap at: %s", dumpcapPath)

	cmd := exec.Command(dumpcapPath, args...)

	// Capture both stdout and stderr
	var stdout, stderr strings.Builder
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	// Set process group so it doesn't die with parent
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setpgid: true,
	}

	log.Printf("🔄 Starting dumpcap process...")
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start dumpcap: %v", err)
	}

	pid := cmd.Process.Pid
	log.Printf("✅ Dumpcap process started with PID %d", pid)
	log.Printf("📁 Writing to: %s", outputFile)

	// Wait a moment for dumpcap to initialize
	time.Sleep(1 * time.Second)

	// Check if process exited early (which would indicate an error)
	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()

	select {
	case waitErr := <-done:
		// Process exited - this is bad, it should still be running
		stderrOutput := stderr.String()
		stdoutOutput := stdout.String()
		return fmt.Errorf("dumpcap exited immediately with: %v\nStderr: %s\nStdout: %s", waitErr, stderrOutput, stdoutOutput)
	case <-time.After(2 * time.Second):
		// Process still running after 2s - good!
		log.Printf("✅ Dumpcap still running after 2s (PID %d)", pid)
	}

	// Double-check with ps
	checkCmd := exec.Command("ps", "-p", fmt.Sprintf("%d", pid), "-o", "pid,comm")
	checkOutput, checkErr := checkCmd.CombinedOutput()
	log.Printf("🔍 Process check: %s (err: %v)", string(checkOutput), checkErr)

	// Verify process is in process list
	if !checkDumpcapRunning() {
		stderrOutput := stderr.String()
		return fmt.Errorf("dumpcap process (PID %d) not found after launch. Stderr: %s", pid, stderrOutput)
	}

	log.Printf("✅ Dumpcap verified running (PID %d)", pid)
	return nil
}

func handleDumpcapSetup(iface string, outputDir string) error {
	log.Printf("🔍 Checking dumpcap status...")

	if !checkDumpcapInstalled() {
		return fmt.Errorf("dumpcap not installed - please install Wireshark or dumpcap")
	}
	log.Printf("✅ Dumpcap is installed")

	if checkDumpcapRunning() {
		log.Printf("✅ Dumpcap process is already running")

		if hasRecentPcapFiles(outputDir) {
			log.Printf("✅ Found recent PCAP files in %s", outputDir)
		} else {
			log.Printf("⚠️ Dumpcap is running but no recent PCAP files found yet")
			log.Printf("💡 Files will appear in: %s", outputDir)
		}
		// Dumpcap is running - that's all we need
		return nil
	}

	// Dumpcap not running - try to launch it
	log.Printf("❌ Dumpcap is not running")

	if *launchDumpcap {
		log.Printf("🚀 Auto-launching dumpcap...")
		if err := launchDumpcapProcess(iface, outputDir); err != nil {
			return fmt.Errorf("failed to auto-launch dumpcap: %v", err)
		}
		return nil
	}

	return fmt.Errorf("dumpcap is not running. Options:\n  1. Start dumpcap manually: dumpcap -i %s -w %s/capture.pcap\n  2. Use auto-launch: add -launch-dumpcap flag", iface, outputDir)
}

func hasRecentPcapFiles(dir string) bool {
	files, err := filepath.Glob(filepath.Join(dir, "*.pcap"))
	if err != nil {
		return false
	}

	cutoff := time.Now().Add(-5 * time.Minute)
	for _, file := range files {
		info, err := os.Stat(file)
		if err != nil {
			continue
		}

		if info.ModTime().After(cutoff) {
			return true
		}
	}

	return false
}

func main() {
	flag.Parse()

	if len(flag.Args()) > 0 && (flag.Args()[0] == "help" || flag.Args()[0] == "-help" || flag.Args()[0] == "--help") {
		fmt.Println("VIBES Network Visualizer Backend")
		fmt.Println("================================")
		fmt.Println()
		fmt.Println("Usage examples:")
		fmt.Println("  Simulated mode:     go run main.go")
		fmt.Println("  Real capture:       sudo go run main.go -iface eth0")
		fmt.Println("  Dumpcap mode:       go run main.go -dumpcap -dumpcap-dir /data/pcaps -iface eth0")
		fmt.Println("  Auto-launch:        go run main.go -dumpcap -launch-dumpcap -iface eth0")
		fmt.Println("  PCAP replay:        go run main.go -pcap /path/to/file.pcap")
		fmt.Println("  PCAP replay 2x:     go run main.go -pcap /path/to/file.pcap -speed 2.0")
		fmt.Println("  Custom port:        go run main.go -addr :9090")
		fmt.Println("  Time windows:       go run main.go -storage /data/pcaps")
		fmt.Println()
		fmt.Println("Storage Management (dumpcap mode):")
		fmt.Println("  Default (600GB):    go run main.go -dumpcap -launch-dumpcap -iface eth0")
		fmt.Println("  Custom limit:       go run main.go -dumpcap -launch-dumpcap -iface eth0 -max-storage-gb 100")
		fmt.Println("  Small files:        go run main.go -dumpcap -launch-dumpcap -iface eth0 -file-rotation-mb 500")
		fmt.Println("  Quick rotation:     go run main.go -dumpcap -launch-dumpcap -iface eth0 -file-rotation-mins 30")
		fmt.Println()
		fmt.Println("URL Parameters (override command line):")
		fmt.Println("  ws://localhost:8080/ws?pcap=/path/file.pcap&speed=2.0")
		fmt.Println("  ws://localhost:8080/ws?interface=eth0")
		fmt.Println()
		fmt.Println("REST API Endpoints:")
		fmt.Println("  GET /api/interfaces  - List available network interfaces")
		fmt.Println("  GET /api/storage     - Get storage manager statistics")
		fmt.Println()
		fmt.Println("WebSocket Commands:")
		fmt.Println("  Time Window: {\"type\":\"select_time_window\",\"start_time\":\"2023-01-01T10:00:00Z\",\"end_time\":\"2023-01-01T11:00:00Z\",\"speed\":2.0}")
		fmt.Println("  Switch Live: {\"type\":\"switch_to_live\"}")
		fmt.Println("  Seek Time:   {\"type\":\"seek_to_time\",\"time\":\"2023-01-01T10:30:00Z\"}")
		fmt.Println()
		fmt.Printf("Available flags:\n")
		flag.PrintDefaults()
		return
	}

	log.Printf("🔥 Starting VIBES Backend Server")

	if *pcapFile != "" {
		log.Printf("📼 PCAP Replay Mode: %s (speed: %.2fx)", *pcapFile, *replaySpeed)
	} else if *useDumpcap {
		log.Printf("🚀 Dumpcap Monitor Mode: %s (interface: %s)", *dumpcapDir, *iface)

		// Validate interface is specified
		if *iface == "" {
			log.Fatalf("❌ Dumpcap mode requires -iface flag to specify network interface")
		}

		// Launch dumpcap at startup if -launch-dumpcap is set
		if *launchDumpcap {
			log.Printf("🔍 Checking dumpcap status at startup...")
			if err := handleDumpcapSetup(*iface, *dumpcapDir); err != nil {
				log.Fatalf("❌ Failed to setup dumpcap: %v", err)
			}
			log.Printf("✅ Dumpcap is running and capturing to %s", *dumpcapDir)
		}

		// Warn if storage and dumpcap directories overlap (could affect historical playback)
		if *storageDir == *dumpcapDir {
			log.Printf("⚠️ WARNING: -storage and -dumpcap-dir point to same directory (%s)", *dumpcapDir)
			log.Printf("⚠️ Historical playback files may be deleted by storage manager!")
			log.Printf("⚠️ Consider using separate directories for live capture and archive")
		}

		// Start storage manager for dumpcap mode
		storageConfig := storage.Config{
			Directory:     *dumpcapDir,
			MaxSizeBytes:  *maxStorageGB * 1024 * 1024 * 1024, // Convert GB to bytes
			LowWaterMark:  0.90,                                // Cleanup to 90% of max
			CheckInterval: 30 * time.Second,
			MinRetention:  5 * time.Minute, // Keep files at least 5 minutes
			FilePattern:   "*.pcap",
		}
		storageManager = storage.NewManager(storageConfig)
		if err := storageManager.Start(); err != nil {
			log.Printf("⚠️ Failed to start storage manager: %v", err)
		}
	} else if *iface != "" {
		log.Printf("📡 Real Capture Mode: interface %s", *iface)
	} else {
		log.Printf("🎮 Simulation Mode: generating synthetic traffic")
	}

	manager := NewClientManager()
	go manager.Start()

	http.HandleFunc("/ws", manager.HandleWebSocket)
	http.HandleFunc("/api/interfaces", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		interfaces, err := capture.ListInterfaces()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(interfaces)
	})

	http.HandleFunc("/api/storage", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Content-Type", "application/json")

		if storageManager == nil {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"enabled": false,
				"message": "Storage manager not active (only available in dumpcap mode)",
			})
			return
		}

		stats := storageManager.GetStats()
		json.NewEncoder(w).Encode(map[string]interface{}{
			"enabled":        true,
			"totalFiles":     stats.TotalFiles,
			"totalSizeBytes": stats.TotalSizeBytes,
			"totalSizeGB":    float64(stats.TotalSizeBytes) / (1024 * 1024 * 1024),
			"maxSizeGB":      *maxStorageGB,
			"usagePercent":   storageManager.GetUsagePercent(),
			"oldestFile":     stats.OldestFile,
			"newestFile":     stats.NewestFile,
			"lastCleanup":    stats.LastCleanup,
			"filesDeleted":   stats.FilesDeleted,
			"bytesFreed":     stats.BytesFreed,
			"bytesFreedGB":   float64(stats.BytesFreed) / (1024 * 1024 * 1024),
		})
	})

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "public/index.html")
	})

	log.Printf("Starting server on %s", *addr)
	if err := http.ListenAndServe(*addr, nil); err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}