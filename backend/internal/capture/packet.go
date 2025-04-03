package capture

import (
	"encoding/json"
	"fmt"
	"log"
	"time"
	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
	"github.com/google/gopacket/pcap"
)

// Protocol types
const (
	ProtocolTCP = "TCP"
	ProtocolUDP = "UDP"
	ProtocolICMP = "ICMP"
	ProtocolOther = "OTHER"
)

// Packet represents a network packet
type Packet struct {
	Type      string `json:"type"`
	Src       string `json:"src"`
	Dst       string `json:"dst"`
	Size      int    `json:"size"`
	Protocol  string `json:"protocol"`
	Timestamp int64  `json:"timestamp"`
	Source    string `json:"source"` // "real" or "simulated"
}

// ToJSON converts a packet to JSON
func (p *Packet) ToJSON() ([]byte, error) {
	return json.Marshal(p)
}

// NewPacket creates a new packet
func NewPacket(src, dst string, size int, protocol string) *Packet {
	return &Packet{
		Type:      "packet",
		Src:       src,
		Dst:       dst,
		Size:      size,
		Protocol:  protocol,
		Timestamp: time.Now().Unix(),
		Source:    "simulated", // Default to simulated
	}
}

// PacketCapture interface for packet capture implementations
type PacketCapture interface {
	Start() error
	Stop() error
	GetPacketChannel() <-chan *Packet
}

// SimulatedCapture provides simulated network traffic for testing
type SimulatedCapture struct {
	packetChan chan *Packet
	stopChan   chan bool
	running    bool
}

// NewSimulatedCapture creates a new simulated capture
func NewSimulatedCapture() *SimulatedCapture {
	return &SimulatedCapture{
		packetChan: make(chan *Packet, 100),
		stopChan:   make(chan bool),
		running:    false,
	}
}

// Start begins the simulated packet capture
func (s *SimulatedCapture) Start() error {
	if s.running {
		return fmt.Errorf("capture already running")
	}

	s.running = true
	go s.generatePackets()
	return nil
}

// Stop stops the simulated packet capture
func (s *SimulatedCapture) Stop() error {
	if !s.running {
		return fmt.Errorf("capture not running")
	}

	s.running = false
	s.stopChan <- true
	return nil
}

// GetPacketChannel returns the channel to receive packets
func (s *SimulatedCapture) GetPacketChannel() <-chan *Packet {
	return s.packetChan
}

// generatePackets simulates network traffic
func (s *SimulatedCapture) generatePackets() {
	// Create packet at different rates
	fastTicker := time.NewTicker(100 * time.Millisecond) // Common traffic
	slowTicker := time.NewTicker(3 * time.Second)        // Occasional traffic
	burstTicker := time.NewTicker(10 * time.Second)      // Burst traffic
	
	defer fastTicker.Stop()
	defer slowTicker.Stop()
	defer burstTicker.Stop()

	// Simulated network topology (replace client/server names with IP addresses)
	// Use realistic private IP addresses for the simulation
	localNetwork := []string{
		"192.168.1.10", "192.168.1.11", "192.168.1.12", "192.168.1.13", "192.168.1.14",
		"192.168.1.15", "192.168.1.16", "192.168.1.17", "192.168.1.18", "192.168.1.19",
	}
	
	servers := []string{
		"10.0.0.10", "10.0.0.11", "10.0.0.20", "10.0.0.30", "10.0.0.40",
	}
	
	gateway := "192.168.1.1"
	internet := []string{
		"8.8.8.8", "1.1.1.1", "172.217.10.14", "151.101.0.223", "13.107.42.12", // Public DNS and major websites
	}
	
	// Track consistent connections between specific hosts
	clientServerPairs := []struct {
		client string
		server string
		protocol string
	}{
		{localNetwork[0], servers[0], ProtocolTCP},
		{localNetwork[1], servers[1], ProtocolTCP},
		{localNetwork[2], servers[2], ProtocolTCP},
		{localNetwork[3], servers[3], ProtocolUDP},
		{localNetwork[4], servers[4], ProtocolTCP},
	}

	log.Println("Starting enhanced simulated packet capture with IP addresses")

	for {
		select {
		case <-s.stopChan:
			log.Println("Stopping simulated packet capture")
			return
			
		// Regular traffic
		case <-fastTicker.C:
			// Local to gateway traffic (common)
			clientIndex := time.Now().UnixNano() % int64(len(localNetwork))
			protocol := ProtocolTCP
			if clientIndex % 3 == 0 {
				protocol = ProtocolUDP
			}
			
			// Send from client to gateway
			s.sendPacket(localNetwork[clientIndex], gateway, 100+int(time.Now().UnixNano()%900), protocol)
			
			// Sometimes respond from gateway to client
			if time.Now().UnixNano() % 2 == 0 {
				s.sendPacket(gateway, localNetwork[clientIndex], 100+int(time.Now().UnixNano()%400), protocol)
			}
		
		// Occasional server traffic
		case <-slowTicker.C:
			// Predefined client-server communications
			pairIndex := time.Now().UnixNano() % int64(len(clientServerPairs))
			pair := clientServerPairs[pairIndex]
			
			// Send a request and response
			s.sendPacket(pair.client, pair.server, 200+int(time.Now().UnixNano()%1300), pair.protocol)
			
			// Server always responds
			time.Sleep(50 * time.Millisecond)
			s.sendPacket(pair.server, pair.client, 300+int(time.Now().UnixNano()%2000), pair.protocol)
			
			// Sometimes ping traffic
			if time.Now().UnixNano() % 5 == 0 {
				randomClient := localNetwork[time.Now().UnixNano()%int64(len(localNetwork))]
				s.sendPacket(randomClient, gateway, 64, ProtocolICMP)
				time.Sleep(20 * time.Millisecond)
				s.sendPacket(gateway, randomClient, 64, ProtocolICMP)
			}
		
		// Burst traffic
		case <-burstTicker.C:
			// External traffic burst
			serverIndex := time.Now().UnixNano() % int64(len(servers))
			server := servers[serverIndex]
			
			externalIndex := time.Now().UnixNano() % int64(len(internet))
			externalIP := internet[externalIndex]
			
			// Internet to gateway
			s.sendPacket(externalIP, gateway, 1200+int(time.Now().UnixNano()%300), ProtocolTCP)
			time.Sleep(20 * time.Millisecond)
			
			// Gateway to server (multiple packets)
			for i := 0; i < 5; i++ {
				s.sendPacket(gateway, server, 800+int(time.Now().UnixNano()%700), ProtocolTCP)
				time.Sleep(10 * time.Millisecond)
			}
			
			// Server to gateway
			time.Sleep(50 * time.Millisecond)
			s.sendPacket(server, gateway, 1400, ProtocolTCP)
			
			// Gateway to internet
			time.Sleep(20 * time.Millisecond)
			s.sendPacket(gateway, externalIP, 900, ProtocolTCP)
		}
	}
}

// sendPacket creates and sends a packet
func (s *SimulatedCapture) sendPacket(src, dst string, size int, protocol string) {
	packet := NewPacket(
		src,
		dst,
		size,
		protocol,
	)
	
	select {
	case s.packetChan <- packet:
		// Successfully sent packet
	default:
		// Channel full, discard packet
		log.Println("Packet channel full, discarding packet")
	}
}

// RealCapture implements real packet capture using gopacket
type RealCapture struct {
	packetChan chan *Packet
	stopChan   chan bool
	running    bool
	handle     *pcap.Handle
	iface      string
}

// NewRealCapture creates a new real packet capture instance
func NewRealCapture(iface string) *RealCapture {
	return &RealCapture{
		packetChan: make(chan *Packet, 100),
		stopChan:   make(chan bool),
		running:    false,
		iface:      iface,
	}
}

// Start begins the real packet capture
func (r *RealCapture) Start() error {
	if r.running {
		return fmt.Errorf("capture already running")
	}

	log.Printf("Starting real packet capture on interface '%s'", r.iface)

	// Open device
	var err error
	var inactiveHandle *pcap.InactiveHandle
	
	// First try to create an inactive handle
	inactiveHandle, err = pcap.NewInactiveHandle(r.iface)
	if err != nil {
		log.Printf("Error creating inactive handle: %v", err)
		return fmt.Errorf("error creating inactive handle for %s: %v", r.iface, err)
	}
	defer inactiveHandle.CleanUp()
	
	// Set options
	if err = inactiveHandle.SetSnapLen(1600); err != nil {
		log.Printf("Error setting snap length: %v", err)
		return err
	}
	if err = inactiveHandle.SetPromisc(true); err != nil {
		log.Printf("Error setting promiscuous mode: %v", err)
		return err
	}
	if err = inactiveHandle.SetTimeout(pcap.BlockForever); err != nil {
		log.Printf("Error setting timeout: %v", err)
		return err
	}
	
	// Try with root privileges first
	r.handle, err = inactiveHandle.Activate()
	if err != nil {
		log.Printf("Failed to activate capture with normal privileges: %v", err)
		log.Printf("This may be a permissions issue. Real capture usually requires root/admin privileges.")
		return fmt.Errorf("error activating capture on device %s: %v (may need root)", r.iface, err)
	}
	
	// Set a filter to only capture IP packets
	err = r.handle.SetBPFFilter("ip")
	if err != nil {
		log.Printf("Warning: couldn't set BPF filter: %v", err)
	}

	log.Printf("Successfully started real packet capture on interface '%s'", r.iface)
	
	// Start packet processing
	r.running = true
	go r.capturePackets()
	return nil
}

// Stop stops the real packet capture
func (r *RealCapture) Stop() error {
	if !r.running {
		return fmt.Errorf("capture not running")
	}

	r.running = false
	r.stopChan <- true
	if r.handle != nil {
		r.handle.Close()
	}
	return nil
}

// GetPacketChannel returns the channel to receive packets
func (r *RealCapture) GetPacketChannel() <-chan *Packet {
	return r.packetChan
}

// capturePackets processes real network packets
func (r *RealCapture) capturePackets() {
	packetSource := gopacket.NewPacketSource(r.handle, r.handle.LinkType())
	
	log.Printf("Starting real packet processing on interface %s", r.iface)
	
	packetCount := 0
	startTime := time.Now()

	for {
		select {
		case <-r.stopChan:
			log.Println("Stopping real packet capture")
			return
		default:
			packet, err := packetSource.NextPacket()
			if err != nil {
				log.Printf("Error reading packet: %v", err)
				continue
			}

			// Process network layer
			networkLayer := packet.NetworkLayer()
			if networkLayer == nil {
				continue
			}

			// Get IP layer info
			ipLayer := packet.Layer(layers.LayerTypeIPv4)
			if ipLayer == nil {
				continue
			}
			
			ip, _ := ipLayer.(*layers.IPv4)
			
			// Determine protocol and build port info
			var protocol string
			var srcLabel, dstLabel string
			srcLabel = ip.SrcIP.String()
			dstLabel = ip.DstIP.String()
			
			// Check TCP layer
			if tcpLayer := packet.Layer(layers.LayerTypeTCP); tcpLayer != nil {
				tcp, _ := tcpLayer.(*layers.TCP)
				protocol = ProtocolTCP
				
				// Add port info for web services
				if tcp.DstPort == 80 || tcp.DstPort == 443 {
					dstLabel = fmt.Sprintf("%s:%d", dstLabel, tcp.DstPort)
				}
				if tcp.SrcPort == 80 || tcp.SrcPort == 443 {
					srcLabel = fmt.Sprintf("%s:%d", srcLabel, tcp.SrcPort)
				}
			} else if udpLayer := packet.Layer(layers.LayerTypeUDP); udpLayer != nil {
				udp, _ := udpLayer.(*layers.UDP)
				protocol = ProtocolUDP
				
				// Add port info for DNS or common UDP services
				if udp.DstPort == 53 || udp.DstPort == 123 {
					dstLabel = fmt.Sprintf("%s:%d", dstLabel, udp.DstPort)
				}
				if udp.SrcPort == 53 || udp.SrcPort == 123 {
					srcLabel = fmt.Sprintf("%s:%d", srcLabel, udp.SrcPort)
				}
			} else if packet.Layer(layers.LayerTypeICMPv4) != nil {
				protocol = ProtocolICMP
			} else {
				protocol = ProtocolOther
			}

			// Create packet
			p := NewPacket(
				srcLabel,
				dstLabel,
				len(packet.Data()),
				protocol,
			)
			
			// Mark this packet as real (not simulated)
			p.Source = "real"

			select {
			case r.packetChan <- p:
				// Successfully sent packet
				packetCount++
				
				// Log occasional stats
				if packetCount % 100 == 0 {
					elapsed := time.Since(startTime).Seconds()
					rate := float64(packetCount) / elapsed
					log.Printf("Captured %d real packets (%.2f packets/sec) on interface %s", 
						packetCount, rate, r.iface)
				}
			default:
				// Channel full, discard packet
				log.Println("Packet channel full, discarding packet")
			}
		}
	}
}

// ListInterfaces returns a list of available network interfaces
func ListInterfaces() ([]pcap.Interface, error) {
	return pcap.FindAllDevs()
}

// TODO: Implement real packet capture using libpcap/gopacket
// PCAPCapture implements real packet capture
// type PCAPCapture struct {
//     // Implementation details
// } 