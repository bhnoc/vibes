package capture

import (
	"fmt"
	"log"
	"net"
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

// NetFlowListenerStatus is the public listener state for the UI / API.
type NetFlowListenerStatus struct {
	State         string `json:"state"` // "stopped" | "listening" | "error"
	BindIP        string `json:"bind_ip"`
	Port          int    `json:"port"`
	ListenAddr    string `json:"listen_addr"`
	Templates     int    `json:"templates"`
	DatagramsOK   uint64 `json:"datagrams_ok"`
	DatagramsBad  uint64 `json:"datagrams_bad"`
	FlowsOK       uint64 `json:"flows_ok"`
	LastError     string `json:"last_error,omitempty"`
	LastPacketAt  string `json:"last_packet_at,omitempty"`
	SubscriberCnt int    `json:"subscribers"`
}

// HostAddress is a bindable IPv4/IPv6 address on this machine.
type HostAddress struct {
	IP        string `json:"ip"`
	Interface string `json:"interface"`
	Family    string `json:"family"` // "ipv4" | "ipv6"
}

// NetFlowManager is a process-wide NetFlow v9 UDP collector with Start/Stop control.
type NetFlowManager struct {
	mu         sync.Mutex
	pc         net.PacketConn
	bindIP     string
	port       int
	state      string // stopped | listening | error
	lastError  string
	lastPacket time.Time
	decoder    *netflowDecoder
	subs       map[chan *Packet]struct{}
	stopCh     chan struct{}
	readDone   chan struct{}

	datagramsOK  atomic.Uint64
	datagramsBad atomic.Uint64
	flowsOK      atomic.Uint64
}

var globalNetFlow = &NetFlowManager{
	state:   "stopped",
	decoder: newNetflowDecoder(),
	subs:    make(map[chan *Packet]struct{}),
}

// GetNetFlowManager returns the process-wide NetFlow collector.
func GetNetFlowManager() *NetFlowManager {
	return globalNetFlow
}

// ListHostAddresses returns non-loopback and loopback IPs available for binding,
// plus the wildcard 0.0.0.0 entry for "all interfaces".
func ListHostAddresses() ([]HostAddress, error) {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil, err
	}

	out := []HostAddress{{
		IP:        "0.0.0.0",
		Interface: "*",
		Family:    "ipv4",
	}}

	seen := map[string]bool{"0.0.0.0": true}
	for _, iface := range ifaces {
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, a := range addrs {
			var ip net.IP
			switch v := a.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip == nil {
				continue
			}
			// Prefer IPv4 for NetFlow exporters; skip link-local IPv6 noise.
			if ip4 := ip.To4(); ip4 != nil {
				s := ip4.String()
				if seen[s] {
					continue
				}
				seen[s] = true
				out = append(out, HostAddress{IP: s, Interface: iface.Name, Family: "ipv4"})
			}
		}
	}

	sort.SliceStable(out, func(i, j int) bool {
		// Keep 0.0.0.0 first, then non-loopback, then loopback.
		rank := func(a HostAddress) int {
			if a.IP == "0.0.0.0" {
				return 0
			}
			if a.IP == "127.0.0.1" {
				return 2
			}
			return 1
		}
		ri, rj := rank(out[i]), rank(out[j])
		if ri != rj {
			return ri < rj
		}
		return out[i].IP < out[j].IP
	})
	return out, nil
}

// Status returns a snapshot of the listener.
func (m *NetFlowManager) Status() NetFlowListenerStatus {
	m.mu.Lock()
	defer m.mu.Unlock()
	st := NetFlowListenerStatus{
		State:         m.state,
		BindIP:        m.bindIP,
		Port:          m.port,
		Templates:     m.decoder.templateCount(),
		DatagramsOK:   m.datagramsOK.Load(),
		DatagramsBad:  m.datagramsBad.Load(),
		FlowsOK:       m.flowsOK.Load(),
		LastError:     m.lastError,
		SubscriberCnt: len(m.subs),
	}
	if m.bindIP != "" && m.port > 0 {
		st.ListenAddr = fmt.Sprintf("%s:%d", m.bindIP, m.port)
	}
	if !m.lastPacket.IsZero() {
		st.LastPacketAt = m.lastPacket.UTC().Format(time.RFC3339)
	}
	return st
}

// Start binds a UDP NetFlow v9 listener on bindIP:port.
// bindIP may be "0.0.0.0" for all interfaces. Port must be 1024–65535.
func (m *NetFlowManager) Start(bindIP string, port int) error {
	if bindIP == "" {
		bindIP = "0.0.0.0"
	}
	if port < 1024 || port > 65535 {
		return fmt.Errorf("port must be between 1024 and 65535")
	}
	ip := net.ParseIP(bindIP)
	if ip == nil {
		return fmt.Errorf("invalid bind IP %q", bindIP)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if m.pc != nil {
		return fmt.Errorf("netflow listener already running on %s:%d — stop it first", m.bindIP, m.port)
	}

	addr := &net.UDPAddr{IP: ip, Port: port}
	pc, err := net.ListenUDP("udp", addr)
	if err != nil {
		m.state = "error"
		m.lastError = err.Error()
		return fmt.Errorf("listen udp %s: %w", addr.String(), err)
	}
	_ = pc.SetReadBuffer(4 * 1024 * 1024)

	m.pc = pc
	m.bindIP = bindIP
	m.port = port
	m.state = "listening"
	m.lastError = ""
	m.stopCh = make(chan struct{})
	m.readDone = make(chan struct{})

	go m.readLoop(pc, m.stopCh, m.readDone)
	log.Printf("🌊 NetFlow v9 UDP listening on %s (point exporters here)", addr.String())
	return nil
}

// Stop closes the UDP listener. Subscribers stay attached so WS clients can wait for a restart.
func (m *NetFlowManager) Stop() error {
	m.mu.Lock()
	pc := m.pc
	stopCh := m.stopCh
	readDone := m.readDone
	m.pc = nil
	m.state = "stopped"
	m.stopCh = nil
	m.readDone = nil
	m.mu.Unlock()

	if pc == nil {
		return nil
	}
	if stopCh != nil {
		close(stopCh)
	}
	_ = pc.Close()
	if readDone != nil {
		<-readDone
	}
	log.Printf("🌊 NetFlow v9 UDP listener stopped")
	return nil
}

func (m *NetFlowManager) readLoop(pc net.PacketConn, stopCh <-chan struct{}, done chan<- struct{}) {
	defer close(done)
	buf := make([]byte, 65535)
	for {
		select {
		case <-stopCh:
			return
		default:
		}

		_ = pc.SetReadDeadline(time.Now().Add(2 * time.Second))
		n, addr, err := pc.ReadFrom(buf)
		if err != nil {
			if ne, ok := err.(net.Error); ok && ne.Timeout() {
				continue
			}
			select {
			case <-stopCh:
				return
			default:
			}
			m.mu.Lock()
			if m.pc == pc {
				m.state = "error"
				m.lastError = err.Error()
			}
			m.mu.Unlock()
			log.Printf("netflow read error: %v", err)
			return
		}
		if n == 0 {
			continue
		}

		var exporter net.IP
		if ua, ok := addr.(*net.UDPAddr); ok {
			exporter = ua.IP
		} else {
			exporter = net.IPv4zero
		}

		pkts, err := m.decoder.decodePacket(exporter, buf[:n])
		if err != nil {
			bad := m.datagramsBad.Add(1)
			if bad == 1 || bad%1000 == 0 {
				log.Printf("netflow: decode failures=%d last=%v from %s", bad, err, addr)
			}
			continue
		}
		m.datagramsOK.Add(1)
		m.mu.Lock()
		m.lastPacket = time.Now()
		m.mu.Unlock()

		for _, p := range pkts {
			m.flowsOK.Add(1)
			m.broadcast(p)
		}
	}
}

func (m *NetFlowManager) broadcast(p *Packet) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for ch := range m.subs {
		select {
		case ch <- p:
		default:
			// Drop if subscriber is slow — never block the UDP reader.
		}
	}
}

func (m *NetFlowManager) subscribe(ch chan *Packet) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.subs == nil {
		m.subs = make(map[chan *Packet]struct{})
	}
	m.subs[ch] = struct{}{}
}

func (m *NetFlowManager) unsubscribe(ch chan *Packet) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.subs, ch)
}

// IsListening reports whether the UDP socket is currently bound.
func (m *NetFlowManager) IsListening() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.pc != nil && m.state == "listening"
}

// --- PacketCapture adapter (one per WebSocket client) ---

// NetFlowV9Capture fans in packets from the process-wide NetFlowManager.
type NetFlowV9Capture struct {
	packetChan chan *Packet
	running    bool
	mu         sync.Mutex
}

// NewNetFlowV9Capture creates a subscriber capture for NetFlow v9 mode.
func NewNetFlowV9Capture() *NetFlowV9Capture {
	return &NetFlowV9Capture{
		packetChan: make(chan *Packet, 8192),
	}
}

func (n *NetFlowV9Capture) Start() error {
	n.mu.Lock()
	defer n.mu.Unlock()
	if n.running {
		return fmt.Errorf("netflow capture already running")
	}
	GetNetFlowManager().subscribe(n.packetChan)
	n.running = true
	st := GetNetFlowManager().Status()
	if st.State != "listening" {
		log.Printf("🌊 NetFlow capture subscribed (listener is %s — start it from the UI)", st.State)
	} else {
		log.Printf("🌊 NetFlow capture subscribed to listener on %s", st.ListenAddr)
	}
	return nil
}

func (n *NetFlowV9Capture) Stop() error {
	n.mu.Lock()
	defer n.mu.Unlock()
	if !n.running {
		return fmt.Errorf("netflow capture not running")
	}
	GetNetFlowManager().unsubscribe(n.packetChan)
	n.running = false
	return nil
}

func (n *NetFlowV9Capture) GetPacketChannel() <-chan *Packet {
	return n.packetChan
}
