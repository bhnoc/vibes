package capture

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"strconv"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

// ZeekConnJSONCapture ingests Zeek conn.log lines as newline-delimited JSON over TCP.
// Multiple WebSocket clients share one listener; each line becomes one Packet for the graph.
type ZeekConnJSONCapture struct {
	listenAddr string
	packetChan chan *Packet
	running    bool
	hub        *zeekHub
	subscribed bool
	mu         sync.Mutex
}

// NewZeekConnJSONCapture creates a subscriber for Zeek JSON conn lines on listenAddr (e.g. ":4777").
func NewZeekConnJSONCapture(listenAddr string) *ZeekConnJSONCapture {
	return &ZeekConnJSONCapture{
		listenAddr: listenAddr,
		packetChan: make(chan *Packet, 8192),
	}
}

func (z *ZeekConnJSONCapture) Start() error {
	z.mu.Lock()
	defer z.mu.Unlock()
	if z.running {
		return fmt.Errorf("zeek capture already running")
	}
	hub := getZeekHub(z.listenAddr)
	if err := hub.subscribe(z.packetChan); err != nil {
		return err
	}
	z.hub = hub
	z.subscribed = true
	z.running = true
	log.Printf("Zeek conn JSON TCP ingest ready on %s (send NDJSON conn lines)", z.listenAddr)
	return nil
}

func (z *ZeekConnJSONCapture) Stop() error {
	z.mu.Lock()
	defer z.mu.Unlock()
	if !z.running {
		return fmt.Errorf("zeek capture not running")
	}
	if z.subscribed && z.hub != nil {
		z.hub.unsubscribe(z.packetChan)
		z.subscribed = false
		z.hub = nil
	}
	z.running = false
	return nil
}

func (z *ZeekConnJSONCapture) GetPacketChannel() <-chan *Packet {
	return z.packetChan
}

// --- shared hub (one listener per address, fan-out to subscribers) ---

var zeekHubRegistry sync.Map // string addr -> *zeekHub

func getZeekHub(addr string) *zeekHub {
	if v, ok := zeekHubRegistry.Load(addr); ok {
		return v.(*zeekHub)
	}
	h := &zeekHub{addr: addr}
	actual, _ := zeekHubRegistry.LoadOrStore(addr, h)
	return actual.(*zeekHub)
}

// EnsureZeekListener binds the TCP ingest address at startup so forwarders can connect before any browser opens.
// Safe to call multiple times; idempotent per address.
func EnsureZeekListener(addr string) error {
	if addr == "" {
		return nil
	}
	h := getZeekHub(addr)
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.subs == nil {
		h.subs = make(map[chan *Packet]struct{})
	}
	if err := h.ensureListenLocked(); err != nil {
		return fmt.Errorf("zeek TCP listen on %s: %w", addr, err)
	}
	log.Printf("🦅 Zeek NDJSON ingest listening on %s (you can nc/forward now; open UI → Zeek mode to visualize)", addr)
	return nil
}

var zeekLinesOK, zeekLinesBad uint64

type zeekHub struct {
	mu       sync.Mutex
	addr     string
	ln       net.Listener
	subs     map[chan *Packet]struct{}
	acceptWG sync.WaitGroup
}

func (h *zeekHub) ensureListenLocked() error {
	if h.ln != nil {
		return nil
	}
	ln, err := net.Listen("tcp", h.addr)
	if err != nil {
		return err
	}
	h.ln = ln
	h.acceptWG.Add(1)
	go h.acceptLoop()
	return nil
}

func (h *zeekHub) subscribe(ch chan *Packet) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.subs == nil {
		h.subs = make(map[chan *Packet]struct{})
	}
	h.subs[ch] = struct{}{}

	if err := h.ensureListenLocked(); err != nil {
		delete(h.subs, ch)
		return fmt.Errorf("zeek TCP listen on %s: %w", h.addr, err)
	}
	return nil
}

func (h *zeekHub) unsubscribe(ch chan *Packet) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.subs, ch)
	// Keep listener open so forwarders can reconnect; closing on last WS caused "connection refused" for nc.
}

func (h *zeekHub) acceptLoop() {
	defer h.acceptWG.Done()
	for {
		h.mu.Lock()
		ln := h.ln
		h.mu.Unlock()
		if ln == nil {
			return
		}
		c, err := ln.Accept()
		if err != nil {
			return
		}
		log.Printf("zeek ingest: TCP client connected from %s", c.RemoteAddr())
		go h.handleConn(c)
	}
}

func (h *zeekHub) handleConn(c net.Conn) {
	defer c.Close()
	if tc, ok := c.(*net.TCPConn); ok {
		_ = tc.SetKeepAlive(true)
	}
	sc := bufio.NewScanner(c)
	buf := make([]byte, 0, 64*1024)
	sc.Buffer(buf, 1024*1024)
	for sc.Scan() {
		line := sc.Bytes()
		if len(line) == 0 {
			continue
		}
		p := parseZeekConnJSONLine(line)
		if p == nil {
			n := atomic.AddUint64(&zeekLinesBad, 1)
			if n == 1 {
				preview := line
				if len(preview) > 120 {
					preview = preview[:120]
				}
				log.Printf("zeek ingest: first line did not parse as conn JSON (check NDJSON + id.orig_h/id.resp_h). Preview: %q", string(preview))
			}
			continue
		}
		atomic.AddUint64(&zeekLinesOK, 1)
		if n := atomic.LoadUint64(&zeekLinesOK); n == 1 || n%5000 == 0 {
			log.Printf("zeek ingest: parsed %d conn lines (parse failures: %d)", n, atomic.LoadUint64(&zeekLinesBad))
		}
		h.broadcast(p)
	}
	if err := sc.Err(); err != nil && !isBenignZeekClientClose(err) {
		log.Printf("zeek TCP read error from %s: %v", c.RemoteAddr(), err)
	}
}

// isBenignZeekClientClose is true when the peer closed the connection (FIN), reset (RST), or broke the pipe—normal for rotating sensors or one-shot nc tests.
func isBenignZeekClientClose(err error) bool {
	if err == nil || errors.Is(err, io.EOF) {
		return true
	}
	if errors.Is(err, syscall.ECONNRESET) || errors.Is(err, syscall.EPIPE) || errors.Is(err, syscall.ECONNABORTED) {
		return true
	}
	var op *net.OpError
	if errors.As(err, &op) {
		return isBenignZeekClientClose(op.Err)
	}
	var se *os.SyscallError
	if errors.As(err, &se) {
		return errors.Is(se.Err, syscall.ECONNRESET) || errors.Is(se.Err, syscall.EPIPE) || errors.Is(se.Err, syscall.ECONNABORTED)
	}
	return false
}

func (h *zeekHub) broadcast(p *Packet) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs {
		select {
		case ch <- p:
		default:
			// drop if client is slow; keeps ingest from blocking
		}
	}
}

// --- Zeek JSON → Packet ---

type zeekConnJSON struct {
	ID struct {
		OrigH string      `json:"orig_h"`
		OrigP interface{} `json:"orig_p"`
		RespH string      `json:"resp_h"`
		RespP interface{} `json:"resp_p"`
	} `json:"id"`
	Proto     string   `json:"proto"`
	OrigBytes *float64 `json:"orig_bytes"`
	RespBytes *float64 `json:"resp_bytes"`
	Ts        float64  `json:"ts"`
	// TsMillis is set when ts is RFC3339 (Humio/Corelight export) instead of Unix float.
	TsMillis int64 `json:"-"`
}

func parseZeekConnJSONLine(line []byte) *Packet {
	var row zeekConnJSON
	if err := json.Unmarshal(line, &row); err == nil && row.ID.OrigH != "" && row.ID.RespH != "" {
		return zeekRowToPacket(&row)
	}
	// Flattened keys (e.g. some forwarders / ECS): "id.orig_h", "id.resp_h", …
	var m map[string]interface{}
	if err := json.Unmarshal(line, &m); err != nil {
		return nil
	}
	src := stringField(m["id.orig_h"])
	dst := stringField(m["id.resp_h"])
	if src == "" || dst == "" {
		return nil
	}
	row2 := zeekConnJSON{}
	row2.ID.OrigH = src
	row2.ID.RespH = dst
	row2.ID.OrigP = m["id.orig_p"]
	row2.ID.RespP = m["id.resp_p"]
	if p, ok := m["proto"].(string); ok {
		row2.Proto = p
	}
	row2.OrigBytes = floatPtr(m["orig_bytes"])
	row2.RespBytes = floatPtr(m["resp_bytes"])
	row2.Ts = floatField(m["ts"])
	row2.TsMillis = unixMilliFromZeekTS(m["ts"])
	return zeekRowToPacket(&row2)
}

func zeekRowToPacket(row *zeekConnJSON) *Packet {
	srcPort := parseZeekPort(row.ID.OrigP)
	dstPort := parseZeekPort(row.ID.RespP)

	proto := normalizeZeekProto(row.Proto)
	size := 64
	if row.OrigBytes != nil || row.RespBytes != nil {
		var sum float64
		if row.OrigBytes != nil {
			sum += *row.OrigBytes
		}
		if row.RespBytes != nil {
			sum += *row.RespBytes
		}
		if sum > 0 {
			if sum > 1e9 {
				size = int(1e9)
			} else {
				size = int(sum)
			}
		}
	}
	if size < 1 {
		size = 1
	}

	ts := time.Now().UnixMilli()
	if row.TsMillis > 0 {
		ts = row.TsMillis
	} else if row.Ts > 0 {
		ts = int64(row.Ts * 1000)
	}

	return &Packet{
		Type:      "packet",
		Src:       row.ID.OrigH,
		Dst:       row.ID.RespH,
		SrcPort:   srcPort,
		DstPort:   dstPort,
		Size:      size,
		Protocol:  proto,
		Timestamp: ts,
		Source:    "zeek",
	}
}

func stringField(v interface{}) string {
	switch x := v.(type) {
	case string:
		return x
	default:
		return ""
	}
}

func floatField(v interface{}) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case json.Number:
		f, _ := x.Float64()
		return f
	default:
		return 0
	}
}

func floatPtr(v interface{}) *float64 {
	switch x := v.(type) {
	case float64:
		return &x
	case json.Number:
		f, err := x.Float64()
		if err != nil {
			return nil
		}
		return &f
	case string:
		f, err := strconv.ParseFloat(x, 64)
		if err != nil {
			return nil
		}
		return &f
	default:
		return nil
	}
}

// unixMilliFromZeekTS handles native Zeek (float epoch seconds) and Humio/Corelight (RFC3339 string).
func unixMilliFromZeekTS(v interface{}) int64 {
	switch x := v.(type) {
	case string:
		if x == "" {
			return 0
		}
		for _, layout := range []string{time.RFC3339Nano, time.RFC3339} {
			t, err := time.Parse(layout, x)
			if err == nil {
				return t.UnixMilli()
			}
		}
		return 0
	case float64:
		if x <= 0 {
			return 0
		}
		return int64(x * 1000)
	case json.Number:
		f, err := x.Float64()
		if err != nil || f <= 0 {
			return 0
		}
		return int64(f * 1000)
	default:
		return 0
	}
}

func parseZeekPort(v interface{}) int {
	switch x := v.(type) {
	case float64:
		return int(x)
	case json.Number:
		n, err := x.Int64()
		if err != nil {
			f, _ := x.Float64()
			return int(f)
		}
		return int(n)
	case string:
		p, err := strconv.Atoi(x)
		if err != nil {
			return 0
		}
		return p
	default:
		return 0
	}
}

func normalizeZeekProto(p string) string {
	switch p {
	case "tcp", "TCP":
		return ProtocolTCP
	case "udp", "UDP":
		return ProtocolUDP
	case "icmp", "ICMP":
		return ProtocolICMP
	default:
		if p == "" {
			return ProtocolTCP
		}
		return ProtocolOther
	}
}
