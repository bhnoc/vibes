package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"net"
	"net/http"
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
	clients       map[*Client]bool
	broadcast     chan []byte
	register      chan *Client
	unregister    chan *Client
	pinningRules  []string
	rulesMutex    sync.RWMutex
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
		
		for packet := range captureSystem.GetPacketChannel() {
			select {
			case <-client.stopForwarder:
				return
			default:
			}
			
			if manager.isIPPinned(packet.Src) || manager.isIPPinned(packet.Dst) || rand.Intn(10) == 0 {
				if packetJSON, err := packet.ToJSON(); err == nil {
					select {
					case client.send <- packetJSON:
					case <-client.stopForwarder:
						return
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
		}
		manager.rulesMutex.Unlock()
	}
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
		fmt.Println("  PCAP replay:        go run main.go -pcap /path/to/file.pcap")
		fmt.Println("  PCAP replay 2x:     go run main.go -pcap /path/to/file.pcap -speed 2.0")
		fmt.Println("  Custom port:        go run main.go -addr :9090")
		fmt.Println()
		fmt.Println("URL Parameters (override command line):")
		fmt.Println("  ws://localhost:8080/ws?pcap=/path/file.pcap&speed=2.0")
		fmt.Println("  ws://localhost:8080/ws?interface=eth0")
		fmt.Println()
		fmt.Printf("Available flags:\n")
		flag.PrintDefaults()
		return
	}

	log.Printf("🔥 Starting VIBES Backend Server")
	
	// Log the current configuration
	if *pcapFile != "" {
		log.Printf("📼 PCAP Replay Mode: %s (speed: %.2fx)", *pcapFile, *replaySpeed)
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
