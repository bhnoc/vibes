package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"vibes-network-visualizer/internal/capture"
)

const (
	// Time allowed to write a message to the peer
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer
	pongWait = 60 * time.Second

	// Send pings to peer with this period. Must be less than pongWait
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer
	maxMessageSize = 512
)

var (
	addr     = flag.String("addr", ":8080", "http service address")
	iface    = flag.String("iface", "", "network interface to capture (empty for simulated data)")
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true // Allow all origins for development
		},
	}
)

// Client represents a connected WebSocket client
type Client struct {
	conn         *websocket.Conn
	send         chan []byte
	disconnected chan struct{} // Channel to signal client disconnection
	stopForwarder chan struct{} // Channel to signal packet forwarder to stop
}

// ClientManager handles multiple client connections
type ClientManager struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
}

// NewClientManager creates a new client manager
func NewClientManager() *ClientManager {
	return &ClientManager{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

// NewClient creates a new client
func NewClient(conn *websocket.Conn) *Client {
	return &Client{
		conn:         conn,
		send:         make(chan []byte, 256),
		disconnected: make(chan struct{}), // Initialize the disconnected channel
		stopForwarder: make(chan struct{}), // Initialize the stop forwarder channel
	}
}

// Start begins the client manager process
func (manager *ClientManager) Start() {
	for {
		select {
		case client := <-manager.register:
			manager.clients[client] = true
			log.Printf("Client connected. Total clients: %d", len(manager.clients))
		case client := <-manager.unregister:
			if _, ok := manager.clients[client]; ok {
				delete(manager.clients, client)
				// Signal the packet forwarder to stop first
				close(client.stopForwarder)
				// Give a brief moment for the forwarder to stop, then close send channel
				go func() {
					time.Sleep(50 * time.Millisecond) // Brief delay to let forwarder exit
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

// Broadcast sends a message to all connected clients
func (manager *ClientManager) Broadcast(message []byte) {
	manager.broadcast <- message
}

// HandleWebSocket handles WebSocket connections
func (manager *ClientManager) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Get interface parameter from URL
	ifaceName := r.URL.Query().Get("interface")
	
	log.Printf("WebSocket connection request - interface parameter: '%s'", ifaceName)
	
	// Create appropriate capture system
	var captureSystem capture.PacketCapture
	var isRealCapture bool = false
	var captureFailed bool = false
	var captureErrorMsg string = ""
	
	if ifaceName != "" {
		log.Printf("Client requested real capture on interface: %s", ifaceName)
		captureSystem = capture.NewRealCapture(ifaceName)
		isRealCapture = true
	} else {
		log.Printf("Client using simulated capture")
		captureSystem = capture.NewSimulatedCapture()
	}

	// Start the capture
	if err := captureSystem.Start(); err != nil {
		log.Printf("Failed to start capture: %v", err)
		
		if isRealCapture {
			// For real capture failures, we'll set flags to notify the client
			log.Printf("Real capture failed, will notify client via WS")
			captureFailed = true
			captureErrorMsg = err.Error()
			
			// Since real capture failed, fall back to simulation
			log.Printf("Falling back to simulated capture")
			captureSystem = capture.NewSimulatedCapture()
			if err := captureSystem.Start(); err != nil {
				// If even simulation fails, return error
				http.Error(w, "Failed to start capture: "+err.Error(), http.StatusInternalServerError)
				return
			}
			
			// Real capture failed, but we continue with simulation
			log.Printf("*** FALLBACK TO SIMULATION (real capture failed) ***")
		} else {
			// For simulated mode, fail if even that doesn't work
			http.Error(w, "Failed to start capture: "+err.Error(), http.StatusInternalServerError)
			return
		}
	} else {
		// Log capture system type
		if isRealCapture {
			log.Printf("*** REAL CAPTURE ACTIVE on interface %s ***", ifaceName)
		} else {
			log.Printf("*** SIMULATION ACTIVE (not real traffic) ***")
		}
	}
	
	// Upgrade HTTP connection to WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		captureSystem.Stop() // Stop the capture if we can't establish WebSocket
		return
	}

	client := NewClient(conn)
	manager.register <- client

	// Tell client what mode we're using (real or simulated)
	var modeMessage []byte
	
	if captureFailed {
		// If real capture failed, send clear error message
		modeMessage, _ = json.Marshal(map[string]interface{}{
			"type": "mode",
			"mode": "simulated",
			"interface": ifaceName,
			"error": true,
			"errorMsg": captureErrorMsg,
			"requestedMode": "real",
		})
	} else {
		// Normal mode message
		modeMessage, _ = json.Marshal(map[string]interface{}{
			"type": "mode",
			"mode": map[bool]string{true: "real", false: "simulated"}[isRealCapture],
			"interface": ifaceName,
		})
	}
	client.send <- modeMessage

	// Start packet forwarding for this client
	packetForwarder := make(chan bool)
	packetCount := 0
	startTime := time.Now()
	
	go func() {
		defer log.Printf("Packet forwarder exiting for %s", client.conn.RemoteAddr())
		defer func() {
			if r := recover(); r != nil {
				log.Printf("Packet forwarder recovered from panic for %s: %v", client.conn.RemoteAddr(), r)
			}
		}()
		
		for packet := range captureSystem.GetPacketChannel() {
			// Check if we should stop *before* trying to process/send
			select {
			case <-client.stopForwarder:
				log.Printf("Packet forwarder received stop signal before processing packet for %s.", client.conn.RemoteAddr())
				return
			case <-packetForwarder:
				log.Printf("Packet forwarder received manual stop signal before processing packet for %s.", client.conn.RemoteAddr())
				return
			default:
				// Proceed
			}

			if packetJSON, err := packet.ToJSON(); err == nil {
				// Try to send, but also listen for the stop signal concurrently
				select {
				case client.send <- packetJSON: // Attempt send
					packetCount++
					// Log packet info occasionally
					if packetCount%100 == 0 {
						elapsed := time.Since(startTime).Seconds()
						rate := float64(packetCount) / elapsed
						log.Printf("Forwarded %d packets (%.2f packets/sec) to %s - Last: %s->%s (%s)",
							packetCount, rate, client.conn.RemoteAddr(), packet.Src, packet.Dst, packet.Protocol)
					}
				case <-client.stopForwarder:
					log.Printf("Packet forwarder received stop signal while attempting to send to %s. Exiting.", client.conn.RemoteAddr())
					return
				case <-packetForwarder:
					log.Printf("Packet forwarder received manual stop signal while attempting to send to %s. Exiting.", client.conn.RemoteAddr())
					return
				}
			} else {
				log.Printf("Error converting packet to JSON for client %s: %v", client.conn.RemoteAddr(), err)
			}
		}
		log.Printf("Capture system channel closed for client %s.", client.conn.RemoteAddr())
	}()

	// Start client read/write pumps
	go client.writePump(manager)
	go client.readPump(manager)

	// Wait for client to disconnect
	<-client.disconnected
	log.Printf("Client %s disconnected signal received in HandleWebSocket.", client.conn.RemoteAddr()) // Add log
	close(packetForwarder)
	log.Printf("Packet forwarder channel closed for %s.", client.conn.RemoteAddr()) // Add log
	
	// Stop the capture for this client
	defer captureSystem.Stop()
}

// writePump pumps messages from the hub to the websocket connection
func (c *Client) writePump(manager *ClientManager) {
	ticker := time.NewTicker(time.Second * 30)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			if !ok {
				// The manager closed the channel
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			// Send the message
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				log.Printf("Error writing message: %v", err)
				return
			}

			// Process any additional messages in the queue
			n := len(c.send)
			for i := 0; i < n; i++ {
				// Send each message separately
				if err := c.conn.WriteMessage(websocket.TextMessage, <-c.send); err != nil {
					log.Printf("Error writing queued message: %v", err)
					return
				}
			}
		case <-ticker.C:
			// Send ping to keep connection alive
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// readPump pumps messages from the WebSocket connection to the hub.
func (c *Client) readPump(manager *ClientManager) {
	defer func() {
		manager.unregister <- c
		c.conn.Close()
		close(c.disconnected) // Signal that the client has disconnected
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}
	}
}

func main() {
	flag.Parse()

	manager := NewClientManager()
	go manager.Start()

	// List available interfaces
	interfaces, err := capture.ListInterfaces()
	if err != nil {
		log.Printf("Warning: Could not list network interfaces: %v", err)
	} else {
		log.Println("Available network interfaces:")
		for _, iface := range interfaces {
			log.Printf("- %s: %s", iface.Name, iface.Description)
		}
	}

	// Set up HTTP handlers
	http.HandleFunc("/ws", manager.HandleWebSocket)
	
	// Add endpoint to list network interfaces
	http.HandleFunc("/api/interfaces", func(w http.ResponseWriter, r *http.Request) {
		// Add CORS headers
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		
		// Handle preflight OPTIONS request
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		
		interfaces, err := capture.ListInterfaces()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(interfaces)
	})

	// Debug endpoint to show raw captured packets
	http.HandleFunc("/debug/capture", handleDebugCapture)

	// Serve static files
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "public/index.html")
	})

	log.Printf("Starting server on %s", *addr)
	if err := http.ListenAndServe(*addr, nil); err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}

// handleDebugCapture captures and displays raw packets from a specified interface
func handleDebugCapture(w http.ResponseWriter, r *http.Request) {
	// Get interface parameter from URL
	ifaceName := r.URL.Query().Get("interface")
	
	if ifaceName == "" {
		http.Error(w, "Please specify an interface with ?interface=<name>", http.StatusBadRequest)
		return
	}
	
	// Set headers for HTML response
	w.Header().Set("Content-Type", "text/html")
	
	// Start HTML output
	fmt.Fprintf(w, `
		<!DOCTYPE html>
		<html>
		<head>
			<title>Debug Capture - %s</title>
			<style>
				body { font-family: monospace; background: #000; color: #0f0; padding: 20px; }
				h1 { color: #0f0; }
				.packet { margin-bottom: 10px; border-bottom: 1px solid #0f0; padding-bottom: 10px; }
				.tcp { color: #0f0; }
				.udp { color: #f0f; }
				.icmp { color: #0ff; }
				.error { color: #f00; }
			</style>
		</head>
		<body>
			<h1>Raw Packet Capture on Interface: %s</h1>
			<div id="status">Starting capture...</div>
			<div id="packets"></div>
	`, ifaceName, ifaceName)
	
	// Create a flush function to ensure content gets to the browser
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}
	
	// Start the real capture
	realCapture := capture.NewRealCapture(ifaceName)
	
	// Handle errors in starting capture
	if err := realCapture.Start(); err != nil {
		fmt.Fprintf(w, `<div class="error">ERROR: %s</div>`, err.Error())
		fmt.Fprintf(w, `<div class="error">Real capture requires administrator/root privileges.</div>`)
		fmt.Fprintf(w, `<div>Falling back to simulated capture for demonstration...</div>`)
		
		// Close the real capture if it was started
		realCapture.Stop()
		
		// For debugging, show some simulated packets
		simCapture := capture.NewSimulatedCapture()
		simCapture.Start()
		
		// Show simulated packets
		fmt.Fprintf(w, `<div style="background: #500; padding: 10px; margin: 10px 0; border: 1px solid #f00;">
			<strong>⚠️ SHOWING SIMULATED DATA - NOT REAL NETWORK TRAFFIC ⚠️</strong>
		</div>`)
		
		flusher.Flush()
		
		// Collect packets
		packetCount := 0
		packetChan := simCapture.GetPacketChannel()
		
		fmt.Fprintf(w, `<div id="packets">`)
		for packetCount < 100 {
			select {
			case packet := <-packetChan:
				packetJSON, _ := json.Marshal(packet)
				
				protocolClass := "other"
				switch packet.Protocol {
				case "TCP":
					protocolClass = "tcp"
				case "UDP":
					protocolClass = "udp"
				case "ICMP":
					protocolClass = "icmp"
				}
				
				fmt.Fprintf(w, `<div class="packet %s">
					<div>Source: %s → Destination: %s</div>
					<div>Protocol: %s, Size: %d bytes</div>
					<div>Time: %s</div>
					<pre>%s</pre>
				</div>`,
				protocolClass,
				packet.Src, packet.Dst,
				packet.Protocol, packet.Size,
				time.Unix(packet.Timestamp, 0).Format("15:04:05.000"),
				string(packetJSON))
				
				flusher.Flush()
				packetCount++
				
			case <-time.After(5 * time.Second):
				fmt.Fprintf(w, `<div class="error">Timeout waiting for packets</div>`)
				flusher.Flush()
				goto EndCapture
			}
		}
		
	EndCapture:
		fmt.Fprintf(w, `</div>`)
		simCapture.Stop()
		
		// End HTML
		fmt.Fprintf(w, `
			</body>
			</html>
		`)
		return
	}
	
	// Successfully started REAL capture
	fmt.Fprintf(w, `<div id="status" style="color: #0f0; background: #050; padding: 10px; margin: 10px 0;">
		✅ REAL CAPTURE ACTIVE - Showing actual network packets from %s
	</div>`, ifaceName)
	flusher.Flush()
	
	// Collect packets
	packetCount := 0
	packetChan := realCapture.GetPacketChannel()
	
	fmt.Fprintf(w, `<div id="packets">`)
	for packetCount < 100 {
		select {
		case packet := <-packetChan:
			packetJSON, _ := json.Marshal(packet)
			
			protocolClass := "other"
			switch packet.Protocol {
			case "TCP":
				protocolClass = "tcp"
			case "UDP":
				protocolClass = "udp"
			case "ICMP":
				protocolClass = "icmp"
			}
			
			fmt.Fprintf(w, `<div class="packet %s">
				<div>Source: %s → Destination: %s</div>
				<div>Protocol: %s, Size: %d bytes</div>
				<div>Time: %s</div>
				<pre>%s</pre>
			</div>`,
			protocolClass,
			packet.Src, packet.Dst,
			packet.Protocol, packet.Size,
			time.Unix(packet.Timestamp, 0).Format("15:04:05.000"),
			string(packetJSON))
			
			flusher.Flush()
			packetCount++
			
		case <-time.After(10 * time.Second):
			if packetCount == 0 {
				fmt.Fprintf(w, `<div class="error">No packets received after 10 seconds. Your interface may be inactive or filtering packets.</div>`)
			} else {
				fmt.Fprintf(w, `<div>Capture complete: received %d packets</div>`, packetCount)
			}
			flusher.Flush()
			goto EndRealCapture
		}
	}
	
EndRealCapture:
	fmt.Fprintf(w, `</div>`)
	realCapture.Stop()
	
	// End HTML
	fmt.Fprintf(w, `
		</body>
		</html>
	`)
} 

