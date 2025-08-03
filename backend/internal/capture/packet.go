package capture

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
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
	SrcPort   int    `json:"src_port"`   // Source port number
	DstPort   int    `json:"dst_port"`   // Destination port number
	Size      int    `json:"size"`
	Protocol  string `json:"protocol"`
	Timestamp int64  `json:"timestamp"`
	Source    string `json:"source"` // "real", "simulated", or "pcap_replay"
}

// ToJSON converts a packet to JSON
func (p *Packet) ToJSON() ([]byte, error) {
	return json.Marshal(p)
}

// NewPacket creates a new packet
func NewPacket(src, dst string, srcPort, dstPort, size int, protocol string) *Packet {
	return &Packet{
		Type:      "packet",
		Src:       src,
		Dst:       dst,
		SrcPort:   srcPort,
		DstPort:   dstPort,
		Size:      size,
		Protocol:  protocol,
		Timestamp: time.Now().UnixMilli(), // Use millisecond precision for better timestamp resolution
		Source:    "simulated", // Default to simulated
	}
}

// NewPacketWithPorts creates a packet with explicit port numbers (convenience function)
func NewPacketWithPorts(src, dst string, srcPort, dstPort, size int, protocol string) *Packet {
	return NewPacket(src, dst, srcPort, dstPort, size, protocol)
}

// generateRealisticPorts creates realistic source and destination ports based on protocol
func generateRealisticPorts(protocol string) (srcPort, dstPort int) {
	switch protocol {
	case ProtocolTCP:
		// Common TCP services
		commonTCPPorts := []int{80, 443, 22, 21, 25, 53, 993, 995, 110, 143, 465, 587, 8080, 8443, 3306, 5432, 6379}
		
		if rand.Float32() < 0.6 { // 60% chance of well-known service
			dstPort = commonTCPPorts[rand.Intn(len(commonTCPPorts))]
			srcPort = 32768 + rand.Intn(32767) // Ephemeral port range
		} else { // 40% chance of random high ports (P2P, custom services)
			srcPort = 1024 + rand.Intn(64511)
			dstPort = 1024 + rand.Intn(64511)
		}
		
	case ProtocolUDP:
		// Common UDP services  
		commonUDPPorts := []int{53, 67, 68, 123, 161, 162, 514, 1194, 1701, 4500, 5060}
		
		if rand.Float32() < 0.5 { // 50% chance of well-known service
			dstPort = commonUDPPorts[rand.Intn(len(commonUDPPorts))]
			srcPort = 32768 + rand.Intn(32767) // Ephemeral port range
		} else { // 50% chance of random high ports (games, streaming, etc.)
			srcPort = 1024 + rand.Intn(64511)
			dstPort = 1024 + rand.Intn(64511)
		}
		
	case ProtocolICMP:
		// ICMP doesn't use ports, but we can use type/code in port fields for visualization
		srcPort = rand.Intn(256) // ICMP type (0-255)
		dstPort = rand.Intn(256) // ICMP code (0-255)
		
	default:
		// For other protocols, use random ports
		srcPort = rand.Intn(65536)
		dstPort = rand.Intn(65536)
	}
	
	return srcPort, dstPort
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
		packetChan: make(chan *Packet, 1000), // Increased buffer for busy network simulation
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

// generatePackets simulates realistic busy network traffic
func (s *SimulatedCapture) generatePackets() {
	// Much higher packet rates for busy network simulation
	loudTalkerTicker := time.NewTicker(5 * time.Millisecond) // Every 5ms - 200 packets/second for loud talkers
	ultraFastTicker := time.NewTicker(2 * time.Millisecond)   // Every 2ms - 500 packets/second
	fastTicker := time.NewTicker(10 * time.Millisecond)       // Every 10ms - 100 packets/second  
	mediumTicker := time.NewTicker(50 * time.Millisecond)     // Every 50ms - 20 packets/second
	burstTicker := time.NewTicker(200 * time.Millisecond)     // Every 200ms - burst traffic
	
	defer loudTalkerTicker.Stop()
	defer ultraFastTicker.Stop()
	defer fastTicker.Stop()
	defer mediumTicker.Stop()
	defer burstTicker.Stop()

	// Expanded network topology (500+ nodes across multiple subnets)
	loudTalkers := []string{
		"203.0.113.1", "203.0.113.2", "203.0.113.3", "203.0.113.4", "203.0.113.5",
		"203.0.113.6", "203.0.113.7", "203.0.113.8", "203.0.113.9", "203.0.113.10",
	}
	localNetwork := []string{
		// 192.168.1.x subnet (250 nodes)
		"192.168.1.10", "192.168.1.11", "192.168.1.12", "192.168.1.13", "192.168.1.14", "192.168.1.15", "192.168.1.16", "192.168.1.17", "192.168.1.18", "192.168.1.19",
		"192.168.1.20", "192.168.1.21", "192.168.1.22", "192.168.1.23", "192.168.1.24", "192.168.1.25", "192.168.1.26", "192.168.1.27", "192.168.1.28", "192.168.1.29",
		"192.168.1.30", "192.168.1.31", "192.168.1.32", "192.168.1.33", "192.168.1.34", "192.168.1.35", "192.168.1.36", "192.168.1.37", "192.168.1.38", "192.168.1.39",
		"192.168.1.40", "192.168.1.41", "192.168.1.42", "192.168.1.43", "192.168.1.44", "192.168.1.45", "192.168.1.46", "192.168.1.47", "192.168.1.48", "192.168.1.49",
		"192.168.1.50", "192.168.1.51", "192.168.1.52", "192.168.1.53", "192.168.1.54", "192.168.1.55", "192.168.1.56", "192.168.1.57", "192.168.1.58", "192.168.1.59",
		"192.168.1.60", "192.168.1.61", "192.168.1.62", "192.168.1.63", "192.168.1.64", "192.168.1.65", "192.168.1.66", "192.168.1.67", "192.168.1.68", "192.168.1.69",
		"192.168.1.70", "192.168.1.71", "192.168.1.72", "192.168.1.73", "192.168.1.74", "192.168.1.75", "192.168.1.76", "192.168.1.77", "192.168.1.78", "192.168.1.79",
		"192.168.1.80", "192.168.1.81", "192.168.1.82", "192.168.1.83", "192.168.1.84", "192.168.1.85", "192.168.1.86", "192.168.1.87", "192.168.1.88", "192.168.1.89",
		"192.168.1.90", "192.168.1.91", "192.168.1.92", "192.168.1.93", "192.168.1.94", "192.168.1.95", "192.168.1.96", "192.168.1.97", "192.168.1.98", "192.168.1.99",
		"192.168.1.100", "192.168.1.101", "192.168.1.102", "192.168.1.103", "192.168.1.104", "192.168.1.105", "192.168.1.106", "192.168.1.107", "192.168.1.108", "192.168.1.109",
		"192.168.1.110", "192.168.1.111", "192.168.1.112", "192.168.1.113", "192.168.1.114", "192.168.1.115", "192.168.1.116", "192.168.1.117", "192.168.1.118", "192.168.1.119",
		"192.168.1.120", "192.168.1.121", "192.168.1.122", "192.168.1.123", "192.168.1.124", "192.168.1.125", "192.168.1.126", "192.168.1.127", "192.168.1.128", "192.168.1.129",
		"192.168.1.130", "192.168.1.131", "192.168.1.132", "192.168.1.133", "192.168.1.134", "192.168.1.135", "192.168.1.136", "192.168.1.137", "192.168.1.138", "192.168.1.139",
		"192.168.1.140", "192.168.1.141", "192.168.1.142", "192.168.1.143", "192.168.1.144", "192.168.1.145", "192.168.1.146", "192.168.1.147", "192.168.1.148", "192.168.1.149",
		"192.168.1.150", "192.168.1.151", "192.168.1.152", "192.168.1.153", "192.168.1.154", "192.168.1.155", "192.168.1.156", "192.168.1.157", "192.168.1.158", "192.168.1.159",
		"192.168.1.160", "192.168.1.161", "192.168.1.162", "192.168.1.163", "192.168.1.164", "192.168.1.165", "192.168.1.166", "192.168.1.167", "192.168.1.168", "192.168.1.169",
		"192.168.1.170", "192.168.1.171", "192.168.1.172", "192.168.1.173", "192.168.1.174", "192.168.1.175", "192.168.1.176", "192.168.1.177", "192.168.1.178", "192.168.1.179",
		"192.168.1.180", "192.168.1.181", "192.168.1.182", "192.168.1.183", "192.168.1.184", "192.168.1.185", "192.168.1.186", "192.168.1.187", "192.168.1.188", "192.168.1.189",
		"192.168.1.190", "192.168.1.191", "192.168.1.192", "192.168.1.193", "192.168.1.194", "192.168.1.195", "192.168.1.196", "192.168.1.197", "192.168.1.198", "192.168.1.199",
		"192.168.1.200", "192.168.1.201", "192.168.1.202", "192.168.1.203", "192.168.1.204", "192.168.1.205", "192.168.1.206", "192.168.1.207", "192.168.1.208", "192.168.1.209",
		"192.168.1.210", "192.168.1.211", "192.168.1.212", "192.168.1.213", "192.168.1.214", "192.168.1.215", "192.168.1.216", "192.168.1.217", "192.168.1.218", "192.168.1.219",
		"192.168.1.220", "192.168.1.221", "192.168.1.222", "192.168.1.223", "192.168.1.224", "192.168.1.225", "192.168.1.226", "192.168.1.227", "192.168.1.228", "192.168.1.229",
		"192.168.1.230", "192.168.1.231", "192.168.1.232", "192.168.1.233", "192.168.1.234", "192.168.1.235", "192.168.1.236", "192.168.1.237", "192.168.1.238", "192.168.1.239",
		"192.168.1.240", "192.168.1.241", "192.168.1.242", "192.168.1.243", "192.168.1.244", "192.168.1.245", "192.168.1.246", "192.168.1.247", "192.168.1.248", "192.168.1.249",
		"192.168.1.250",

		// 192.168.2.x subnet (250 nodes) 
		"192.168.2.10", "192.168.2.11", "192.168.2.12", "192.168.2.13", "192.168.2.14", "192.168.2.15", "192.168.2.16", "192.168.2.17", "192.168.2.18", "192.168.2.19",
		"192.168.2.20", "192.168.2.21", "192.168.2.22", "192.168.2.23", "192.168.2.24", "192.168.2.25", "192.168.2.26", "192.168.2.27", "192.168.2.28", "192.168.2.29",
		"192.168.2.30", "192.168.2.31", "192.168.2.32", "192.168.2.33", "192.168.2.34", "192.168.2.35", "192.168.2.36", "192.168.2.37", "192.168.2.38", "192.168.2.39",
		"192.168.2.40", "192.168.2.41", "192.168.2.42", "192.168.2.43", "192.168.2.44", "192.168.2.45", "192.168.2.46", "192.168.2.47", "192.168.2.48", "192.168.2.49",
		"192.168.2.50", "192.168.2.51", "192.168.2.52", "192.168.2.53", "192.168.2.54", "192.168.2.55", "192.168.2.56", "192.168.2.57", "192.168.2.58", "192.168.2.59",
		"192.168.2.60", "192.168.2.61", "192.168.2.62", "192.168.2.63", "192.168.2.64", "192.168.2.65", "192.168.2.66", "192.168.2.67", "192.168.2.68", "192.168.2.69",
		"192.168.2.70", "192.168.2.71", "192.168.2.72", "192.168.2.73", "192.168.2.74", "192.168.2.75", "192.168.2.76", "192.168.2.77", "192.168.2.78", "192.168.2.79",
		"192.168.2.80", "192.168.2.81", "192.168.2.82", "192.168.2.83", "192.168.2.84", "192.168.2.85", "192.168.2.86", "192.168.2.87", "192.168.2.88", "192.168.2.89",
		"192.168.2.90", "192.168.2.91", "192.168.2.92", "192.168.2.93", "192.168.2.94", "192.168.2.95", "192.168.2.96", "192.168.2.97", "192.168.2.98", "192.168.2.99",
		"192.168.2.100", "192.168.2.101", "192.168.2.102", "192.168.2.103", "192.168.2.104", "192.168.2.105", "192.168.2.106", "192.168.2.107", "192.168.2.108", "192.168.2.109",
		"192.168.2.110", "192.168.2.111", "192.168.2.112", "192.168.2.113", "192.168.2.114", "192.168.2.115", "192.168.2.116", "192.168.2.117", "192.168.2.118", "192.168.2.119",
		"192.168.2.120", "192.168.2.121", "192.168.2.122", "192.168.2.123", "192.168.2.124", "192.168.2.125", "192.168.2.126", "192.168.2.127", "192.168.2.128", "192.168.2.129",
		"192.168.2.130", "192.168.2.131", "192.168.2.132", "192.168.2.133", "192.168.2.134", "192.168.2.135", "192.168.2.136", "192.168.2.137", "192.168.2.138", "192.168.2.139",
		"192.168.2.140", "192.168.2.141", "192.168.2.142", "192.168.2.143", "192.168.2.144", "192.168.2.145", "192.168.2.146", "192.168.2.147", "192.168.2.148", "192.168.2.149",
		"192.168.2.150", "192.168.2.151", "192.168.2.152", "192.168.2.153", "192.168.2.154", "192.168.2.155", "192.168.2.156", "192.168.2.157", "192.168.2.158", "192.168.2.159",
		"192.168.2.160", "192.168.2.161", "192.168.2.162", "192.168.2.163", "192.168.2.164", "192.168.2.165", "192.168.2.166", "192.168.2.167", "192.168.2.168", "192.168.2.169",
		"192.168.2.170", "192.168.2.171", "192.168.2.172", "192.168.2.173", "192.168.2.174", "192.168.2.175", "192.168.2.176", "192.168.2.177", "192.168.2.178", "192.168.2.179",
		"192.168.2.180", "192.168.2.181", "192.168.2.182", "192.168.2.183", "192.168.2.184", "192.168.2.185", "192.168.2.186", "192.168.2.187", "192.168.2.188", "192.168.2.189",
		"192.168.2.190", "192.168.2.191", "192.168.2.192", "192.168.2.193", "192.168.2.194", "192.168.2.195", "192.168.2.196", "192.168.2.197", "192.168.2.198", "192.168.2.199",
		"192.168.2.200", "192.168.2.201", "192.168.2.202", "192.168.2.203", "192.168.2.204", "192.168.2.205", "192.168.2.206", "192.168.2.207", "192.168.2.208", "192.168.2.209",
		"192.168.2.210", "192.168.2.211", "192.168.2.212", "192.168.2.213", "192.168.2.214", "192.168.2.215", "192.168.2.216", "192.168.2.217", "192.168.2.218", "192.168.2.219",
		"192.168.2.220", "192.168.2.221", "192.168.2.222", "192.168.2.223", "192.168.2.224", "192.168.2.225", "192.168.2.226", "192.168.2.227", "192.168.2.228", "192.168.2.229",
		"192.168.2.230", "192.168.2.231", "192.168.2.232", "192.168.2.233", "192.168.2.234", "192.168.2.235", "192.168.2.236", "192.168.2.237", "192.168.2.238", "192.168.2.239",
		"192.168.2.240", "192.168.2.241", "192.168.2.242", "192.168.2.243", "192.168.2.244", "192.168.2.245", "192.168.2.246", "192.168.2.247", "192.168.2.248", "192.168.2.249",
		"192.168.2.250",
	}
	
	servers := []string{
		"10.0.0.10", "10.0.0.11", "10.0.0.12", "10.0.0.13", "10.0.0.14", "10.0.0.15", "10.0.0.16", "10.0.0.17", "10.0.0.18", "10.0.0.19",
		"10.0.0.20", "10.0.0.21", "10.0.0.22", "10.0.0.23", "10.0.0.24", "10.0.0.25", "10.0.0.26", "10.0.0.27", "10.0.0.28", "10.0.0.29",
		"10.0.0.30", "10.0.0.31", "10.0.0.32", "10.0.0.33", "10.0.0.34", "10.0.0.35", "10.0.0.36", "10.0.0.37", "10.0.0.38", "10.0.0.39",
		"10.0.0.40", "10.0.0.41", "10.0.0.42", "10.0.0.43", "10.0.0.44", "10.0.0.45", "10.0.0.46", "10.0.0.47", "10.0.0.48", "10.0.0.49",
		"10.0.0.50", "10.0.0.51", "10.0.0.52", "10.0.0.53", "10.0.0.54", "10.0.0.55", "10.0.0.56", "10.0.0.57", "10.0.0.58", "10.0.0.59",
	}
	
	// Multiple gateways
	gateways := []string{"192.168.1.1", "192.168.2.1", "192.168.3.1"}
	
	internet := []string{
		// Major cloud providers and CDNs (AWS, GCP, Azure, Cloudflare, etc)
		"13.32.0.1", "13.33.0.1", "13.35.0.1", "13.48.0.1", "13.49.0.1", "13.51.0.1", "13.53.0.1", "13.54.0.1", "13.55.0.1", "13.56.0.1",
		"34.192.0.1", "34.193.0.1", "34.194.0.1", "34.195.0.1", "34.196.0.1", "34.197.0.1", "34.198.0.1", "34.199.0.1", "34.200.0.1", "34.201.0.1",
		"35.160.0.1", "35.161.0.1", "35.162.0.1", "35.163.0.1", "35.164.0.1", "35.165.0.1", "35.166.0.1", "35.167.0.1", "35.168.0.1", "35.169.0.1",
		"52.0.0.1", "52.1.0.1", "52.2.0.1", "52.3.0.1", "52.4.0.1", "52.5.0.1", "52.6.0.1", "52.7.0.1", "52.8.0.1", "52.9.0.1",
		"104.16.0.1", "104.17.0.1", "104.18.0.1", "104.19.0.1", "104.20.0.1", "104.21.0.1", "104.22.0.1", "104.23.0.1", "104.24.0.1", "104.25.0.1",
		"172.64.0.1", "172.65.0.1", "172.66.0.1", "172.67.0.1", "172.68.0.1", "172.69.0.1", "172.70.0.1", "172.71.0.1", "172.72.0.1", "172.73.0.1",
		"35.184.0.1", "35.185.0.1", "35.186.0.1", "35.187.0.1", "35.188.0.1", "35.189.0.1", "35.190.0.1", "35.191.0.1", "35.192.0.1", "35.193.0.1",
		"35.194.0.1", "35.195.0.1", "35.196.0.1", "35.197.0.1", "35.198.0.1", "35.199.0.1", "35.200.0.1", "35.201.0.1", "35.202.0.1", "35.203.0.1",
		"40.64.0.1", "40.65.0.1", "40.66.0.1", "40.67.0.1", "40.68.0.1", "40.69.0.1", "40.70.0.1", "40.71.0.1", "40.72.0.1", "40.73.0.1",
		"40.74.0.1", "40.75.0.1", "40.76.0.1", "40.77.0.1", "40.78.0.1", "40.79.0.1", "40.80.0.1", "40.81.0.1", "40.82.0.1", "40.83.0.1",

		// Major websites and services
		"151.101.0.1", "151.101.64.1", "151.101.128.1", "151.101.192.1", "151.101.0.2", "151.101.64.2", "151.101.128.2", "151.101.192.2", "151.101.0.3", "151.101.64.3",
		"157.240.0.1", "157.240.1.1", "157.240.2.1", "157.240.3.1", "157.240.4.1", "157.240.5.1", "157.240.6.1", "157.240.7.1", "157.240.8.1", "157.240.9.1",
		"199.232.0.1", "199.232.1.1", "199.232.2.1", "199.232.3.1", "199.232.4.1", "199.232.5.1", "199.232.6.1", "199.232.7.1", "199.232.8.1", "199.232.9.1",
		"140.82.112.1", "140.82.113.1", "140.82.114.1", "140.82.115.1", "140.82.116.1", "140.82.117.1", "140.82.118.1", "140.82.119.1", "140.82.120.1", "140.82.121.1",
		"185.199.108.1", "185.199.109.1", "185.199.110.1", "185.199.111.1", "185.199.108.2", "185.199.109.2", "185.199.110.2", "185.199.111.2", "185.199.108.3", "185.199.109.3",

		// Content delivery networks
		"23.32.0.1", "23.33.0.1", "23.34.0.1", "23.35.0.1", "23.36.0.1", "23.37.0.1", "23.38.0.1", "23.39.0.1", "23.40.0.1", "23.41.0.1",
		"23.42.0.1", "23.43.0.1", "23.44.0.1", "23.45.0.1", "23.46.0.1", "23.47.0.1", "23.48.0.1", "23.49.0.1", "23.50.0.1", "23.51.0.1",
		"23.52.0.1", "23.53.0.1", "23.54.0.1", "23.55.0.1", "23.56.0.1", "23.57.0.1", "23.58.0.1", "23.59.0.1", "23.60.0.1", "23.61.0.1",
		"23.62.0.1", "23.63.0.1", "23.64.0.1", "23.65.0.1", "23.66.0.1", "23.67.0.1", "23.68.0.1", "23.69.0.1", "23.70.0.1", "23.71.0.1",
		"23.72.0.1", "23.73.0.1", "23.74.0.1", "23.75.0.1", "23.76.0.1", "23.77.0.1", "23.78.0.1", "23.79.0.1", "23.80.0.1", "23.81.0.1",

		// DNS servers and infrastructure
		"8.8.8.8", "8.8.4.4", "1.1.1.1", "1.0.0.1", "9.9.9.9", "149.112.112.112", "208.67.222.222", "208.67.220.220", "8.26.56.26", "8.20.247.20",
		"64.6.64.6", "64.6.65.6", "156.154.70.1", "156.154.71.1", "199.85.126.10", "199.85.127.10", "198.101.242.72", "23.253.163.53", "84.200.69.80", "84.200.70.40",
		"37.235.1.174", "37.235.1.177", "77.88.8.8", "77.88.8.1", "91.239.100.100", "89.233.43.71", "74.82.42.42", "109.69.8.51", "216.146.35.35", "216.146.36.36",

		// Common internet services
		"172.217.0.1", "172.217.1.1", "172.217.2.1", "172.217.3.1", "172.217.4.1", "172.217.5.1", "172.217.6.1", "172.217.7.1", "172.217.8.1", "172.217.9.1",
		"173.194.0.1", "173.194.1.1", "173.194.2.1", "173.194.3.1", "173.194.4.1", "173.194.5.1", "173.194.6.1", "173.194.7.1", "173.194.8.1", "173.194.9.1",
		"74.125.0.1", "74.125.1.1", "74.125.2.1", "74.125.3.1", "74.125.4.1", "74.125.5.1", "74.125.6.1", "74.125.7.1", "74.125.8.1", "74.125.9.1",
		"142.250.0.1", "142.250.1.1", "142.250.2.1", "142.250.3.1", "142.250.4.1", "142.250.5.1", "142.250.6.1", "142.250.7.1", "142.250.8.1", "142.250.9.1",
		"216.58.192.1", "216.58.193.1", "216.58.194.1", "216.58.195.1", "216.58.196.1", "216.58.197.1", "216.58.198.1", "216.58.199.1", "216.58.200.1", "216.58.201.1",

		// Additional cloud and CDN ranges
		"204.79.197.1", "204.79.198.1", "204.79.199.1", "204.79.200.1", "204.79.201.1", "204.79.202.1", "204.79.203.1", "204.79.204.1", "204.79.205.1", "204.79.206.1",
		"13.107.0.1", "13.107.1.1", "13.107.2.1", "13.107.3.1", "13.107.4.1", "13.107.5.1", "13.107.6.1", "13.107.7.1", "13.107.8.1", "13.107.9.1",
		"104.244.40.1", "104.244.41.1", "104.244.42.1", "104.244.43.1", "104.244.44.1", "104.244.45.1", "104.244.46.1", "104.244.47.1", "104.244.48.1", "104.244.49.1",
		"192.0.64.1", "192.0.65.1", "192.0.66.1", "192.0.67.1", "192.0.68.1", "192.0.69.1", "192.0.70.1", "192.0.71.1", "192.0.72.1", "192.0.73.1",
		"198.35.26.1", "198.35.27.1", "198.35.28.1", "198.35.29.1", "198.35.30.1", "198.35.31.1", "198.35.32.1", "198.35.33.1", "198.35.34.1", "198.35.35.1",

		// Additional service ranges
		"44.212.0.1", "44.212.1.1", "44.212.2.1", "44.212.3.1", "44.212.4.1", "44.212.5.1", "44.212.6.1", "44.212.7.1", "44.212.8.1", "44.212.9.1",
		"52.84.0.1", "52.84.1.1", "52.84.2.1", "52.84.3.1", "52.84.4.1", "52.84.5.1", "52.84.6.1", "52.84.7.1", "52.84.8.1", "52.84.9.1",
		"99.84.0.1", "99.84.1.1", "99.84.2.1", "99.84.3.1", "99.84.4.1", "99.84.5.1", "99.84.6.1", "99.84.7.1", "99.84.8.1", "99.84.9.1",
		"108.156.0.1", "108.156.1.1", "108.156.2.1", "108.156.3.1", "108.156.4.1", "108.156.5.1", "108.156.6.1", "108.156.7.1", "108.156.8.1", "108.156.9.1",
		"205.251.192.1", "205.251.193.1", "205.251.194.1", "205.251.195.1", "205.251.196.1", "205.251.197.1", "205.251.198.1", "205.251.199.1", "205.251.200.1", "205.251.201.1",
	}
	
	// Define traffic patterns for simulation
	clientServerPairs := []struct {
		client string
		server string
		protocol string
	}{}

	// Local to local traffic (30% of connections)
	for i := 0; i < 6; i++ {
		srcIndex := rand.Intn(len(localNetwork))
		dstIndex := rand.Intn(len(localNetwork))
		for dstIndex == srcIndex { // Ensure different source and destination
			dstIndex = rand.Intn(len(localNetwork))
		}
		protocol := ProtocolTCP
		if rand.Intn(10) < 3 {
			protocol = ProtocolUDP
		}
		clientServerPairs = append(clientServerPairs, struct{
			client string
			server string
			protocol string
		}{localNetwork[srcIndex], localNetwork[dstIndex], protocol})
	}

	// Local to gateway traffic (20% of connections)
	for i := 0; i < 4; i++ {
		srcIndex := rand.Intn(len(localNetwork))
		gwIndex := rand.Intn(len(gateways))
		protocol := ProtocolTCP
		if rand.Intn(10) < 2 {
			protocol = ProtocolICMP
		}
		clientServerPairs = append(clientServerPairs, struct{
			client string
			server string
			protocol string
		}{localNetwork[srcIndex], gateways[gwIndex], protocol})
	}

	// Local to server traffic (25% of connections)
	for i := 0; i < 5; i++ {
		srcIndex := rand.Intn(len(localNetwork))
		srvIndex := rand.Intn(len(servers))
		protocol := ProtocolTCP
		if rand.Intn(10) < 3 {
			protocol = ProtocolUDP
		}
		clientServerPairs = append(clientServerPairs, struct{
			client string
			server string
			protocol string
		}{localNetwork[srcIndex], servers[srvIndex], protocol})
	}

	// Local to internet traffic (15% of connections)
	for i := 0; i < 3; i++ {
		srcIndex := rand.Intn(len(localNetwork))
		intIndex := rand.Intn(len(internet))
		protocol := ProtocolTCP
		if rand.Intn(10) < 2 {
			protocol = ProtocolUDP
		}
		clientServerPairs = append(clientServerPairs, struct{
			client string
			server string
			protocol string
		}{localNetwork[srcIndex], internet[intIndex], protocol})
	}

	// Internet to local traffic (10% of connections)
	for i := 0; i < 2; i++ {
		intIndex := rand.Intn(len(internet))
		dstIndex := rand.Intn(len(localNetwork))
		protocol := ProtocolTCP
		if rand.Intn(10) < 2 {
			protocol = ProtocolUDP
		}
		clientServerPairs = append(clientServerPairs, struct{
			client string
			server string
			protocol string
		}{internet[intIndex], localNetwork[dstIndex], protocol})
	}

	log.Println("Starting BUSY network simulation with high packet rates and diverse connections")
	log.Println("Generating 600+ packets/second with realistic randomization...")

	// Seed random number generator for better diversity
	rand.Seed(time.Now().UnixNano())

	for {
		select {
		case <-s.stopChan:
			log.Println("Stopping simulated packet capture")
			return
		
		case <-loudTalkerTicker.C:
			src := loudTalkers[rand.Intn(len(loudTalkers))]
			var dst string
			destType := rand.Intn(3)
			if destType == 0 {
				dst = localNetwork[rand.Intn(len(localNetwork))]
			} else if destType == 1 {
				dst = servers[rand.Intn(len(servers))]
			} else {
				dst = internet[rand.Intn(len(internet))]
			}
			
			packetSize := 64 + rand.Intn(1436)
			protocols := []string{ProtocolTCP, ProtocolUDP}
			protocol := protocols[rand.Intn(len(protocols))]
			s.sendPacket(src, dst, packetSize, protocol)
			
		// Ultra-fast traffic - high-volume local traffic
		case <-ultraFastTicker.C:
			// Truly random selection for diverse connections
			clientIndex := rand.Intn(len(localNetwork))
			serverIndex := rand.Intn(len(servers))
			
			// Random protocol distribution
			protocols := []string{ProtocolTCP, ProtocolTCP, ProtocolTCP, ProtocolUDP, ProtocolICMP}
			protocol := protocols[rand.Intn(len(protocols))]
			
			// Varied packet sizes for realism
			packetSize := 64 + rand.Intn(1436) // 64-1500 bytes
			s.sendPacket(localNetwork[clientIndex], servers[serverIndex], packetSize, protocol)
			
			// Random bidirectional traffic (40% chance of response)
			if rand.Float32() < 0.4 {
				responseSize := 64 + rand.Intn(800) // Smaller responses
				go func() {
					time.Sleep(time.Duration(1 + rand.Intn(10)) * time.Millisecond) // 1-10ms delay
					s.sendPacket(servers[serverIndex], localNetwork[clientIndex], responseSize, protocol)
				}()
			}
			
		// Fast traffic - gateway/internet traffic  
		case <-fastTicker.C:
			// Random external to internal traffic
			internetIndex := rand.Intn(len(internet))
			localIndex := rand.Intn(len(localNetwork))
			gatewayIndex := rand.Intn(len(gateways))
			
			protocol := ProtocolTCP
			if rand.Float32() < 0.3 {  // 30% UDP traffic
				protocol = ProtocolUDP
			}
			
			packetSize := 200 + rand.Intn(1300) // 200-1500 bytes
			
			// Internet -> Gateway -> Local (common web traffic pattern)
			s.sendPacket(internet[internetIndex], gateways[gatewayIndex], packetSize, protocol)
			
			// Forward to local with slight delay
			go func() {
				time.Sleep(time.Duration(2 + rand.Intn(8)) * time.Millisecond) // 2-10ms delay
				s.sendPacket(gateways[gatewayIndex], localNetwork[localIndex], packetSize-20, protocol)
			}()
		
		// Medium frequency traffic - server communications
		case <-mediumTicker.C:
			// Random client-server communications for diversity
			pairIndex := rand.Intn(len(clientServerPairs))
			pair := clientServerPairs[pairIndex]
			
			// Send a request with realistic size
			requestSize := 200 + rand.Intn(1300) // 200-1500 bytes
			s.sendPacket(pair.client, pair.server, requestSize, pair.protocol)
			
			// Server responds asynchronously with realistic delay
			go func() {
				responseDelay := time.Duration(10 + rand.Intn(40)) * time.Millisecond // 10-50ms
				time.Sleep(responseDelay)
				responseSize := 300 + rand.Intn(1700) // 300-2000 bytes
				s.sendPacket(pair.server, pair.client, responseSize, pair.protocol)
			}()
			
			// Random ping traffic (20% chance)
			if rand.Float32() < 0.2 {
				randomClientIndex := rand.Intn(len(localNetwork))
				randomGatewayIndex := rand.Intn(len(gateways))
				randomClient := localNetwork[randomClientIndex]
				randomGateway := gateways[randomGatewayIndex]
				
				// Send ping
				s.sendPacket(randomClient, randomGateway, 64, ProtocolICMP)
				
				// Ping response after realistic delay
				go func() {
					time.Sleep(time.Duration(5 + rand.Intn(15)) * time.Millisecond) // 5-20ms ping time
					s.sendPacket(randomGateway, randomClient, 64, ProtocolICMP)
				}()
			}
		
		// Burst traffic - high volume data flows
		case <-burstTicker.C:
			// Random high-volume data transfer burst
			serverIndex := rand.Intn(len(servers))
			server := servers[serverIndex]
			
			externalIndex := rand.Intn(len(internet))
			externalIP := internet[externalIndex]
			
			gatewayIndex := rand.Intn(len(gateways))
			gateway := gateways[gatewayIndex]
			
			// Multiple concurrent bursts for busy network simulation
			go s.simulateDataBurst(externalIP, gateway, server)
			
			// Additional random bursts (30% chance of multiple simultaneous transfers)
			if rand.Float32() < 0.3 {
				go s.simulateDataBurst(
					internet[rand.Intn(len(internet))], 
					gateways[rand.Intn(len(gateways))], 
					servers[rand.Intn(len(servers))])
			}
			
			// Random local-to-local high volume transfer (20% chance)
			if rand.Float32() < 0.2 {
				go s.simulateLocalDataBurst(
					localNetwork[rand.Intn(len(localNetwork))],
					localNetwork[rand.Intn(len(localNetwork))])
			}
		}
	}
}

// sendPacket creates and sends a packet
func (s *SimulatedCapture) sendPacket(src, dst string, size int, protocol string) {
	// Generate realistic ports based on protocol
	srcPort, dstPort := generateRealisticPorts(protocol)
	
	packet := NewPacket(
		src,
		dst,
		srcPort,
		dstPort,
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

// simulateDataBurst creates a realistic high-volume data transfer
func (s *SimulatedCapture) simulateDataBurst(external, gateway, server string) {
	// Initial request from external source
	initialSize := 1200 + rand.Intn(300) // 1200-1500 bytes
	s.sendPacket(external, gateway, initialSize, ProtocolTCP)
	
	time.Sleep(time.Duration(10 + rand.Intn(20)) * time.Millisecond) // 10-30ms
	
	// Gateway forwards to server
	s.sendPacket(gateway, server, initialSize-20, ProtocolTCP)
	
	time.Sleep(time.Duration(15 + rand.Intn(25)) * time.Millisecond) // 15-40ms
	
	// Server responds with burst of data packets (5-15 packets)
	burstSize := 5 + rand.Intn(10)
	for i := 0; i < burstSize; i++ {
		packetSize := 800 + rand.Intn(700) // 800-1500 bytes
		s.sendPacket(server, gateway, packetSize, ProtocolTCP)
		time.Sleep(time.Duration(3 + rand.Intn(10)) * time.Millisecond) // 3-13ms between packets
	}
	
	time.Sleep(time.Duration(20 + rand.Intn(30)) * time.Millisecond) // 20-50ms
	
	// Gateway forwards responses back to external
	for i := 0; i < burstSize/2; i++ {
		responseSize := 1200 + rand.Intn(300) // 1200-1500 bytes
		s.sendPacket(gateway, external, responseSize, ProtocolTCP)
		time.Sleep(time.Duration(5 + rand.Intn(15)) * time.Millisecond) // 5-20ms
	}
	
	// Final acknowledgments
	time.Sleep(time.Duration(10 + rand.Intn(20)) * time.Millisecond)
	s.sendPacket(external, gateway, 60+rand.Intn(40), ProtocolTCP) // Small ACK
}

// simulateLocalDataBurst creates high-volume local network traffic
func (s *SimulatedCapture) simulateLocalDataBurst(src, dst string) {
	// Don't create a burst to self
	if src == dst {
		return
	}
	
	// Initial handshake
	s.sendPacket(src, dst, 100+rand.Intn(200), ProtocolTCP)
	time.Sleep(time.Duration(5 + rand.Intn(10)) * time.Millisecond)
	
	// Response handshake
	s.sendPacket(dst, src, 80+rand.Intn(120), ProtocolTCP)
	time.Sleep(time.Duration(5 + rand.Intn(10)) * time.Millisecond)
	
	// Data transfer burst (10-30 packets)
	burstSize := 10 + rand.Intn(20)
	for i := 0; i < burstSize; i++ {
		packetSize := 500 + rand.Intn(1000) // 500-1500 bytes
		s.sendPacket(src, dst, packetSize, ProtocolTCP)
		
		// Random acknowledgments (30% chance)
		if rand.Float32() < 0.3 {
			go func() {
				time.Sleep(time.Duration(2 + rand.Intn(8)) * time.Millisecond)
				s.sendPacket(dst, src, 64+rand.Intn(100), ProtocolTCP) // Small ACK
			}()
		}
		
		time.Sleep(time.Duration(2 + rand.Intn(8)) * time.Millisecond) // 2-10ms between packets
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
			
			// Extract IP addresses
			srcIP := ip.SrcIP.String()
			dstIP := ip.DstIP.String()
			
			// Extract protocol and port information
			var protocol string
			var srcPort, dstPort int
			
			// Check TCP layer
			if tcpLayer := packet.Layer(layers.LayerTypeTCP); tcpLayer != nil {
				tcp, _ := tcpLayer.(*layers.TCP)
				protocol = ProtocolTCP
				srcPort = int(tcp.SrcPort)
				dstPort = int(tcp.DstPort)
				
			} else if udpLayer := packet.Layer(layers.LayerTypeUDP); udpLayer != nil {
				udp, _ := udpLayer.(*layers.UDP)
				protocol = ProtocolUDP
				srcPort = int(udp.SrcPort)
				dstPort = int(udp.DstPort)
				
			} else if icmpLayer := packet.Layer(layers.LayerTypeICMPv4); icmpLayer != nil {
				icmp, _ := icmpLayer.(*layers.ICMPv4)
				protocol = ProtocolICMP
				// For ICMP, use type and code as "port" values for visualization
				srcPort = int(icmp.TypeCode.Type())
				dstPort = int(icmp.TypeCode.Code())
				
			} else {
				protocol = ProtocolOther
				srcPort = 0
				dstPort = 0
			}

			// Create packet with extracted port information
			p := NewPacket(
				srcIP,
				dstIP,
				srcPort,
				dstPort,
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

// PCAPReplayCapture implements PCAP file replay functionality
type PCAPReplayCapture struct {
	packetChan      chan *Packet
	stopChan        chan bool
	running         bool
	pcapFile        string
	replaySpeed     float64 // 1.0 = real-time, 2.0 = 2x speed, 0.5 = half speed
	startTime       time.Time
	endTime         time.Time
	useTimeRange    bool
	currentPacketTime time.Time
	replayStartTime   time.Time
}

// PCAPReplayConfig holds configuration for PCAP replay
type PCAPReplayConfig struct {
	FilePath    string    // Path to PCAP file
	ReplaySpeed float64   // Speed multiplier (1.0 = real-time)
	StartTime   time.Time // Optional: start replay from this time
	EndTime     time.Time // Optional: end replay at this time
}

// NewPCAPReplayCapture creates a new PCAP replay capture instance
func NewPCAPReplayCapture(config PCAPReplayConfig) *PCAPReplayCapture {
	replay := &PCAPReplayCapture{
		packetChan:   make(chan *Packet, 1000),
		stopChan:     make(chan bool),
		running:      false,
		pcapFile:     config.FilePath,
		replaySpeed:  config.ReplaySpeed,
		useTimeRange: false,
	}
	
	// Set default replay speed if not specified
	if replay.replaySpeed <= 0 {
		replay.replaySpeed = 1.0
	}
	
	// Set time range if specified
	if !config.StartTime.IsZero() || !config.EndTime.IsZero() {
		replay.useTimeRange = true
		replay.startTime = config.StartTime
		replay.endTime = config.EndTime
	}
	
	return replay
}

// Start begins the PCAP replay
func (p *PCAPReplayCapture) Start() error {
	if p.running {
		return fmt.Errorf("PCAP replay already running")
	}

	log.Printf("Starting PCAP replay from file: %s (speed: %.2fx)", p.pcapFile, p.replaySpeed)
	
	if p.useTimeRange {
		log.Printf("Time range: %s to %s", p.startTime.Format("15:04:05"), p.endTime.Format("15:04:05"))
	}

	// Open PCAP file
	handle, err := pcap.OpenOffline(p.pcapFile)
	if err != nil {
		return fmt.Errorf("error opening PCAP file %s: %v", p.pcapFile, err)
	}

	log.Printf("Successfully opened PCAP file: %s", p.pcapFile)
	
	p.running = true
	p.replayStartTime = time.Now()
	
	// Start replay processing in goroutine
	go p.replayPackets(handle)
	return nil
}

// Stop stops the PCAP replay
func (p *PCAPReplayCapture) Stop() error {
	if !p.running {
		return fmt.Errorf("PCAP replay not running")
	}

	p.running = false
	p.stopChan <- true
	return nil
}

// GetPacketChannel returns the channel to receive packets
func (p *PCAPReplayCapture) GetPacketChannel() <-chan *Packet {
	return p.packetChan
}

// replayPackets processes and replays packets from the PCAP file
func (p *PCAPReplayCapture) replayPackets(handle *pcap.Handle) {
	defer handle.Close()
	
	packetSource := gopacket.NewPacketSource(handle, handle.LinkType())
	
	log.Printf("Starting PCAP packet replay processing")
	
	packetCount := 0
	skippedCount := 0
	var firstPacketTime time.Time
	var lastPacketTimestamp time.Time
	
	for {
		select {
		case <-p.stopChan:
			log.Printf("Stopping PCAP replay - processed %d packets, skipped %d", packetCount, skippedCount)
			return
		default:
			packet, err := packetSource.NextPacket()
			if err != nil {
				if err.Error() == "EOF" {
					log.Printf("PCAP replay completed - processed %d packets total", packetCount)
					// Send completion signal or loop if desired
					return
				}
				log.Printf("Error reading PCAP packet: %v", err)
				continue
			}

			// Get packet timestamp
			packetTimestamp := packet.Metadata().Timestamp
			
			// Initialize first packet time for relative timing
			if packetCount == 0 {
				firstPacketTime = packetTimestamp
				p.currentPacketTime = firstPacketTime
			}
			
			// Check if packet is within time range (if specified)
			if p.useTimeRange {
				if !p.startTime.IsZero() && packetTimestamp.Before(p.startTime) {
					skippedCount++
					continue
				}
				if !p.endTime.IsZero() && packetTimestamp.After(p.endTime) {
					log.Printf("Reached end time, stopping replay")
					return
				}
			}

			// Calculate timing for realistic replay
			if packetCount > 0 && p.replaySpeed > 0 {
				// Calculate time difference from previous packet
				timeDiff := packetTimestamp.Sub(lastPacketTimestamp)
				
				// Apply replay speed multiplier
				adjustedDelay := time.Duration(float64(timeDiff) / p.replaySpeed)
				
				// Don't sleep for negative or very small delays
				if adjustedDelay > time.Microsecond {
					time.Sleep(adjustedDelay)
				}
			}
			
			lastPacketTimestamp = packetTimestamp

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
			
			// Extract IP addresses  
			srcIP := ip.SrcIP.String()
			dstIP := ip.DstIP.String()
			
			// Extract protocol and port information
			var protocol string
			var srcPort, dstPort int
			
			// Parse protocol and port information
			if tcpLayer := packet.Layer(layers.LayerTypeTCP); tcpLayer != nil {
				tcp, _ := tcpLayer.(*layers.TCP)
				protocol = ProtocolTCP
				srcPort = int(tcp.SrcPort)
				dstPort = int(tcp.DstPort)
				
			} else if udpLayer := packet.Layer(layers.LayerTypeUDP); udpLayer != nil {
				udp, _ := udpLayer.(*layers.UDP)
				protocol = ProtocolUDP
				srcPort = int(udp.SrcPort)
				dstPort = int(udp.DstPort)
				
			} else if icmpLayer := packet.Layer(layers.LayerTypeICMPv4); icmpLayer != nil {
				icmp, _ := icmpLayer.(*layers.ICMPv4)
				protocol = ProtocolICMP
				// For ICMP, use type and code as "port" values for visualization
				srcPort = int(icmp.TypeCode.Type())
				dstPort = int(icmp.TypeCode.Code())
				
			} else {
				protocol = ProtocolOther
				srcPort = 0
				dstPort = 0
			}

			// Create packet with extracted port information
			replayPacket := &Packet{
				Type:      "packet",
				Src:       srcIP,
				Dst:       dstIP,
				SrcPort:   srcPort,
				DstPort:   dstPort,
				Size:      len(packet.Data()),
				Protocol:  protocol,
				Timestamp: time.Now().UnixMilli(), // Use current time for frontend synchronization
				Source:    "pcap_replay",
			}

			select {
			case p.packetChan <- replayPacket:
				packetCount++
				
				// Log progress for epic PCAP moments
				if packetCount%1000 == 0 {
					elapsed := time.Since(p.replayStartTime).Seconds()
					rate := float64(packetCount) / elapsed
					relativeTime := packetTimestamp.Sub(firstPacketTime)
					log.Printf("🔥 PCAP REPLAY: %d packets replayed (%.1f pps) - at %s in original capture", 
						packetCount, rate, relativeTime)
				}
			default:
				// Channel full, discard packet but continue
				log.Println("Packet channel full during PCAP replay, discarding packet")
			}
		}
	}
} 