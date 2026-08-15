package capture

import (
	"encoding/binary"
	"fmt"
	"net"
	"sync"
	"time"
)

// NetFlow v9 field type IDs (RFC 3954 / Cisco common set).
const (
	nfIN_BYTES       uint16 = 1
	nfIN_PKTS        uint16 = 2
	nfPROTOCOL       uint16 = 4
	nfL4_SRC_PORT    uint16 = 7
	nfIPV4_SRC_ADDR  uint16 = 8
	nfL4_DST_PORT    uint16 = 11
	nfIPV4_DST_ADDR  uint16 = 12
	nfLAST_SWITCHED  uint16 = 21
	nfFIRST_SWITCHED uint16 = 22
	nfOUT_BYTES      uint16 = 23
	nfIPV6_SRC_ADDR  uint16 = 27
	nfIPV6_DST_ADDR  uint16 = 28
)

type nfFieldDef struct {
	Type   uint16
	Length uint16
}

type nfTemplate struct {
	ID     uint16
	Fields []nfFieldDef
}

type nfTemplateKey struct {
	Exporter string
	SourceID uint32
	ID       uint16
}

// netflowDecoder keeps per-exporter templates and turns NetFlow v9 UDP payloads into Packets.
type netflowDecoder struct {
	mu        sync.RWMutex
	templates map[nfTemplateKey]*nfTemplate
}

func newNetflowDecoder() *netflowDecoder {
	return &netflowDecoder{templates: make(map[nfTemplateKey]*nfTemplate)}
}

func (d *netflowDecoder) templateCount() int {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return len(d.templates)
}

// decodePacket parses one NetFlow v9 UDP datagram from exporter into zero or more Packets.
func (d *netflowDecoder) decodePacket(exporter net.IP, payload []byte) ([]*Packet, error) {
	if len(payload) < 20 {
		return nil, fmt.Errorf("packet too short: %d", len(payload))
	}
	version := binary.BigEndian.Uint16(payload[0:2])
	if version != 9 {
		return nil, fmt.Errorf("unsupported netflow version %d", version)
	}
	count := binary.BigEndian.Uint16(payload[2:4])
	unixSecs := binary.BigEndian.Uint32(payload[8:12])
	sourceID := binary.BigEndian.Uint32(payload[16:20])
	exporterKey := exporter.String()

	offset := 20
	var out []*Packet
	setsSeen := 0

	for offset+4 <= len(payload) && setsSeen < int(count)+64 {
		setsSeen++
		setID := binary.BigEndian.Uint16(payload[offset : offset+2])
		setLen := int(binary.BigEndian.Uint16(payload[offset+2 : offset+4]))
		if setLen < 4 || offset+setLen > len(payload) {
			break
		}
		body := payload[offset+4 : offset+setLen]
		offset += setLen

		switch {
		case setID == 0: // Template FlowSet
			d.parseTemplates(exporterKey, sourceID, body)
		case setID == 1: // Options Template FlowSet — ignore for viz
			continue
		case setID >= 256: // Data FlowSet
			pkts := d.parseDataFlowSet(exporterKey, sourceID, setID, body, unixSecs)
			out = append(out, pkts...)
		default:
			// Options data / reserved — skip
		}
	}
	return out, nil
}

func (d *netflowDecoder) parseTemplates(exporter string, sourceID uint32, body []byte) {
	pos := 0
	for pos+4 <= len(body) {
		templateID := binary.BigEndian.Uint16(body[pos : pos+2])
		fieldCount := int(binary.BigEndian.Uint16(body[pos+2 : pos+4]))
		pos += 4
		need := fieldCount * 4
		if pos+need > len(body) {
			return
		}
		fields := make([]nfFieldDef, 0, fieldCount)
		for i := 0; i < fieldCount; i++ {
			fields = append(fields, nfFieldDef{
				Type:   binary.BigEndian.Uint16(body[pos : pos+2]),
				Length: binary.BigEndian.Uint16(body[pos+2 : pos+4]),
			})
			pos += 4
		}
		key := nfTemplateKey{Exporter: exporter, SourceID: sourceID, ID: templateID}
		d.mu.Lock()
		d.templates[key] = &nfTemplate{ID: templateID, Fields: fields}
		d.mu.Unlock()
	}
}

func (d *netflowDecoder) parseDataFlowSet(exporter string, sourceID uint32, templateID uint16, body []byte, unixSecs uint32) []*Packet {
	key := nfTemplateKey{Exporter: exporter, SourceID: sourceID, ID: templateID}
	d.mu.RLock()
	tmpl := d.templates[key]
	d.mu.RUnlock()
	if tmpl == nil || len(tmpl.Fields) == 0 {
		return nil
	}

	recordLen := 0
	for _, f := range tmpl.Fields {
		recordLen += int(f.Length)
	}
	if recordLen <= 0 {
		return nil
	}

	var out []*Packet
	pos := 0
	for pos+recordLen <= len(body) {
		rec := body[pos : pos+recordLen]
		pos += recordLen
		if p := packetFromNFRecord(tmpl.Fields, rec, unixSecs); p != nil {
			out = append(out, p)
		}
	}
	return out
}

func packetFromNFRecord(fields []nfFieldDef, rec []byte, unixSecs uint32) *Packet {
	var (
		src, dst       string
		srcPort, dstPort int
		size           int
		protoNum       int = -1
		haveSrc, haveDst bool
	)

	off := 0
	for _, f := range fields {
		if off+int(f.Length) > len(rec) {
			return nil
		}
		val := rec[off : off+int(f.Length)]
		off += int(f.Length)

		switch f.Type {
		case nfIPV4_SRC_ADDR:
			if len(val) >= 4 {
				src = net.IP(val[:4]).String()
				haveSrc = true
			}
		case nfIPV4_DST_ADDR:
			if len(val) >= 4 {
				dst = net.IP(val[:4]).String()
				haveDst = true
			}
		case nfIPV6_SRC_ADDR:
			if len(val) >= 16 && !haveSrc {
				src = net.IP(val[:16]).String()
				haveSrc = true
			}
		case nfIPV6_DST_ADDR:
			if len(val) >= 16 && !haveDst {
				dst = net.IP(val[:16]).String()
				haveDst = true
			}
		case nfL4_SRC_PORT:
			srcPort = int(readUintBE(val))
		case nfL4_DST_PORT:
			dstPort = int(readUintBE(val))
		case nfPROTOCOL:
			protoNum = int(readUintBE(val))
		case nfIN_BYTES, nfOUT_BYTES:
			if n := int(readUintBE(val)); n > size {
				size = n
			}
		}
	}

	if !haveSrc || !haveDst || src == "" || dst == "" {
		return nil
	}
	if size <= 0 {
		size = 1
	}

	proto := ProtocolOther
	switch protoNum {
	case 6:
		proto = ProtocolTCP
	case 17:
		proto = ProtocolUDP
	case 1, 58:
		proto = ProtocolICMP
	}

	ts := time.Now().UnixMilli()
	if unixSecs > 0 {
		ts = int64(unixSecs) * 1000
	}

	return &Packet{
		Type:      "packet",
		Src:       src,
		Dst:       dst,
		SrcPort:   srcPort,
		DstPort:   dstPort,
		Size:      size,
		Protocol:  proto,
		Timestamp: ts,
		Source:    "netflow",
	}
}

func readUintBE(b []byte) uint64 {
	var n uint64
	for _, v := range b {
		n = (n << 8) | uint64(v)
	}
	return n
}
