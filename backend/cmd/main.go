package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/c-robinson/iplib"
	"github.com/gorilla/websocket"
	"vibes-network-visualizer/internal/capture"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512
)

var (
	addr        = flag.String("addr", ":8080", "http service address")
	iface       = flag.String("iface", "", "network interface to capture (empty for simulated data)")
	pcapFile    = flag.String("pcap", "", "path to PCAP file for replay mode")
	replaySpeed = flag.Float64("speed", 1.0, "replay speed multiplier (1.0 = real-time, 2.0 = 2x speed)")
	storageDir  = flag.String("storage", "/data/pcaps", "directory containing PCAP archives for time window playback")
	useDumpcap  = flag.Bool("dumpcap", false, "use external dumpcap for high-performance capture (requires dumpcap to be running)")
	dumpcapDir  = flag.String("dumpcap-dir", "/data/pcaps", "directory where dumpcap writes PCAP files")
	launchDumpcap = flag.Bool("launch-dumpcap", false, "automatically launch dumpcap process if not running")
	upgrader    = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true // Allow all origins
		},
	}
)

type Client struct {
	conn          *websocket.Conn
	send          chan []byte
	disconnected  chan struct{}
	stopForwarder chan struct{}
}

type ClientManager struct {
	clients            map[*Client]bool
	broadcast          chan []byte
	register           chan *Client
	unregister         chan *Client
	pinningRules       []string
	rulesMutex         sync.RWMutex
	timeWindowProcessor *capture.TimeWindowProcessor
	currentCaptureMode  string
	originalCapture     capture.PacketCapture
}

func NewClientManager() *ClientManager {
	return &ClientManager{
		clients:      make(map[*Client]bool),
		broadcast:    make(chan []byte),
		register:     make(chan *Client),
		unregister:   make(chan *Client),
		pinningRules: make([]string, 0),
	}
}

func NewClient(conn *websocket.Conn) *Client {
	return &Client{
		conn:          conn,
		send:          make(chan []byte, 256),
		disconnected:  make(chan struct{}),
		stopForwarder: make(chan struct{}),
	}
}

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
		// Check dumpcap status and optionally launch it
		if err := handleDumpcapSetup(selectedInterface, *dumpcapDir); err != nil {
			log.Printf("❌ Dumpcap setup failed: %v", err)
			// Fall back to real capture if available
			if selectedInterface != "" {
				log.Printf("⚠️ Falling back to real capture mode")
				captureSystem = capture.NewRealCapture(selectedInterface)
				captureMode = "real"
			} else {
				log.Printf("⚠️ Falling back to simulation mode")
				captureSystem = capture.NewSimulatedCapture()
				captureMode = "simulated"
			}
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

	// Try to start the capture with fallback handling
	captureFailed := false
	captureErrorMsg := ""
	originalMode := captureMode
	
	if err := captureSystem.Start(); err != nil {
		log.Printf("Failed to start %s capture: %v", captureMode, err)
		captureFailed = true
		captureErrorMsg = err.Error()
		
		// Fall back to simulation
		log.Printf("Falling back to simulated capture")
		captureSystem = capture.NewSimulatedCapture()
		if err := captureSystem.Start(); err != nil {
			http.Error(w, "Failed to start capture: "+err.Error(), http.StatusInternalServerError)
			return
		}
		captureMode = "simulated"
		log.Printf("*** FALLBACK TO SIMULATION (%s failed) ***", originalMode)
	} else {
		// Log success based on mode
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
	
	// Store original capture for live mode switching
	manager.originalCapture = captureSystem
	manager.currentCaptureMode = captureMode

	// Send mode information to the client
	var modeMessage []byte
	if captureFailed {
		// Send error message with fallback info
		modeMessage, _ = json.Marshal(map[string]interface{}{
			"type": "mode",
			"mode": captureMode,
			"interface": selectedInterface,
			"pcapFile": selectedPcapFile,
			"replaySpeed": selectedReplaySpeed,
			"error": true,
			"errorMsg": captureErrorMsg,
			"requestedMode": originalMode,
		})
	} else {
		// Normal mode message
		modeMessage, _ = json.Marshal(map[string]interface{}{
			"type": "mode",
			"mode": captureMode,
			"interface": selectedInterface,
			"pcapFile": selectedPcapFile,
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
			
			// Check if we're in time window mode
			if manager.timeWindowProcessor != nil && manager.currentCaptureMode == "time_window" {
				select {
				case packet = <-manager.timeWindowProcessor.GetPacketChannel():
					packetReceived = true
				case <-client.stopForwarder:
					return
				case <-time.After(1 * time.Millisecond):
					// No packet available from time window, continue
				}
			} else {
				// Normal live capture mode
				select {
				case packet = <-captureSystem.GetPacketChannel():
					packetReceived = true
				case <-client.stopForwarder:
					return
				case <-time.After(1 * time.Millisecond):
					// No packet available, continue
				}
			}
			
			if packetReceived && packet != nil {
				if manager.isIPPinned(packet.Src) || manager.isIPPinned(packet.Dst) || rand.Intn(10) < 9 { // Send 90% of packets instead of 50%
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
		c.conn.SetReadDeadline(time.Now().Add(pongWait)); 
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
			manager.rulesMutex.Unlock() // Unlock before time window operations
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
	
	// Create time window processor
	config := capture.TimeWindowConfig{
		StorageDir:   *storageDir,
		StartTime:    startTime,
		EndTime:      endTime,
		ReplaySpeed:  replaySpeed,
		SamplingRate: 10, // Default sampling rate
	}
	processor := capture.NewTimeWindowProcessor(config)
	
	// Stop current capture if running
	if manager.originalCapture != nil {
		manager.originalCapture.Stop()
	}
	
	// Start time window playback
	if err := processor.Start(); err != nil {
		log.Printf("Failed to start time window playback: %v", err)
		response, _ := json.Marshal(map[string]interface{}{
			"type": "time_window_error",
			"error": err.Error(),
		})
		client.send <- response
		return
	}
	
	manager.timeWindowProcessor = processor
	manager.currentCaptureMode = "time_window"
	
	// Send success response
	response, _ := json.Marshal(map[string]interface{}{
		"type": "time_window_active",
		"start_time": startTimeStr,
		"end_time": endTimeStr,
		"speed": replaySpeed,
	})
	client.send <- response
	
	log.Printf("⚡ Time window playback activated!")
}

func (manager *ClientManager) handleSwitchToLive(client *Client) {
	log.Printf("🔄 Switching back to live mode...")
	
	// Stop time window processor
	if manager.timeWindowProcessor != nil {
		manager.timeWindowProcessor.Stop()
		manager.timeWindowProcessor = nil
	}
	
	// Restart original capture
	if manager.originalCapture != nil {
		if err := manager.originalCapture.Start(); err != nil {
			log.Printf("Failed to restart live capture: %v", err)
			response, _ := json.Marshal(map[string]interface{}{
				"type": "switch_to_live_error",
				"error": err.Error(),
			})
			client.send <- response
			return
		}
	}
	
	manager.currentCaptureMode = "live"
	
	// Send success response
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
			"type": "seek_error",
			"error": "No time window active",
		})
		client.send <- response
		return
	}
	
	log.Printf("⏰ Seeking to time: %s", seekTime.Format("15:04:05"))
	
	if err := manager.timeWindowProcessor.SeekToTime(seekTime); err != nil {
		log.Printf("Failed to seek to time: %v", err)
		response, _ := json.Marshal(map[string]interface{}{
			"type": "seek_error",
			"error": err.Error(),
		})
		client.send <- response
		return
	}
	
	// Send success response
	response, _ := json.Marshal(map[string]interface{}{
		"type": "seek_complete",
		"time": timeStr,
	})
	client.send <- response
	
	log.Printf("🎯 Seek complete!")
}

// checkDumpcapRunning checks if dumpcap is already running
func checkDumpcapRunning() bool {
	cmd := exec.Command("pgrep", "-f", "dumpcap")
	err := cmd.Run()
	return err == nil
}

// checkDumpcapInstalled checks if dumpcap is installed and available
func checkDumpcapInstalled() bool {
	cmd := exec.Command("which", "dumpcap")
	err := cmd.Run()
	return err == nil
}

// launchDumpcapProcess starts dumpcap with the specified interface and output directory
func launchDumpcapProcess(iface string, outputDir string) error {
	if !checkDumpcapInstalled() {
		return fmt.Errorf("dumpcap not found in PATH - please install Wireshark/dumpcap")
	}

	// Create output directory if it doesn't exist
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return fmt.Errorf("failed to create dumpcap output directory: %v", err)
	}

	// Generate output filename with timestamp
	timestamp := time.Now().Format("2006-01-02_15-04-05")
	outputFile := filepath.Join(outputDir, fmt.Sprintf("dumpcap_%s_%s.pcap", iface, timestamp))

	// Build dumpcap command
	args := []string{
		"-i", iface,
		"-w", outputFile,
		"-b", "duration:3600", // Rotate every hour
		"-b", "filesize:1000000", // Rotate at 1GB
	}

	log.Printf("🚀 Launching dumpcap: dumpcap %s", strings.Join(args, " "))
	
	cmd := exec.Command("dumpcap", args...)
	
	// Start dumpcap in background
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start dumpcap: %v", err)
	}

	log.Printf("✅ Dumpcap process started with PID %d", cmd.Process.Pid)
	log.Printf("📁 Writing to: %s", outputFile)
	
	// Give dumpcap a moment to start writing
	time.Sleep(2 * time.Second)
	
	return nil
}

// handleDumpcapSetup checks dumpcap status and optionally launches it
func handleDumpcapSetup(iface string, outputDir string) error {
	log.Printf("🔍 Checking dumpcap status...")
	
	// Check if dumpcap is installed
	if !checkDumpcapInstalled() {
		return fmt.Errorf("dumpcap not installed - please install Wireshark or dumpcap")
	}
	log.Printf("✅ Dumpcap is installed")
	
	// Check if dumpcap is already running
	if checkDumpcapRunning() {
		log.Printf("✅ Dumpcap process is already running")
		
		// Check if output directory has recent PCAP files
		if hasRecentPcapFiles(outputDir) {
			log.Printf("✅ Found recent PCAP files in %s", outputDir)
			return nil
		} else {
			log.Printf("⚠️ Dumpcap is running but no recent PCAP files found")
			log.Printf("💡 Check that dumpcap is writing to: %s", outputDir)
		}
	} else {
		log.Printf("❌ Dumpcap is not running")
		
		if *launchDumpcap {
			log.Printf("🚀 Auto-launching dumpcap...")
			if err := launchDumpcapProcess(iface, outputDir); err != nil {
				return fmt.Errorf("failed to auto-launch dumpcap: %v", err)
			}
		} else {
			return fmt.Errorf("dumpcap is not running. Options:\n" +
				"  1. Start dumpcap manually: dumpcap -i %s -w %s/capture.pcap\n" +
				"  2. Use auto-launch: add -launch-dumpcap flag", iface, outputDir)
		}
	}
	
	return nil
}

// hasRecentPcapFiles checks if there are PCAP files modified in the last 5 minutes
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

	// Show usage information if help is requested
	if len(flag.Args()) > 0 && (flag.Args()[0] == "help" || flag.Args()[0] == "-help" || flag.Args()[0] == "--help") {
		fmt.Println("VIBES Network Visualizer Backend")
		fmt.Println("================================")
		fmt.Println()
		fmt.Println("Usage examples:")
		fmt.Println("  Simulated mode:     go run main.go")
		fmt.Println("  Real capture:       sudo go run main.go -iface eth0")
		fmt.Println("  Dumpcap mode:       go run main.go -dumpcap -dumpcap-dir /data/pcaps -iface en1")
		fmt.Println("  Auto-launch:        go run main.go -dumpcap -launch-dumpcap -iface en1")
		fmt.Println("  PCAP replay:        go run main.go -pcap /path/to/file.pcap")
		fmt.Println("  PCAP replay 2x:     go run main.go -pcap /path/to/file.pcap -speed 2.0")
		fmt.Println("  Custom port:        go run main.go -addr :9090")
		fmt.Println("  Time windows:       go run main.go -storage /data/pcaps")
		fmt.Println()
		fmt.Println("URL Parameters (override command line):")
		fmt.Println("  ws://localhost:8080/ws?pcap=/path/file.pcap&speed=2.0")
		fmt.Println("  ws://localhost:8080/ws?interface=eth0")
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
	
	// Log the current configuration
	if *pcapFile != "" {
		log.Printf("📼 PCAP Replay Mode: %s (speed: %.2fx)", *pcapFile, *replaySpeed)
	} else if *useDumpcap {
		log.Printf("🚀 Dumpcap Monitor Mode: %s (interface: %s)", *dumpcapDir, *iface)
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

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "public/index.html")
	})

	log.Printf("Starting server on %s", *addr)
	if err := http.ListenAndServe(*addr, nil); err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}
