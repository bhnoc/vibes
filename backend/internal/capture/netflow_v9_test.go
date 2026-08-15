package capture

import (
	"encoding/binary"
	"net"
	"testing"
)

func buildMinimalNF9Packet(t *testing.T, templateID uint16, src, dst net.IP, sport, dport uint16, proto byte, bytes uint32) []byte {
	t.Helper()
	// Template FlowSet: fields SRC, DST, SPORT, DPORT, PROTO, IN_BYTES
	fields := []nfFieldDef{
		{Type: nfIPV4_SRC_ADDR, Length: 4},
		{Type: nfIPV4_DST_ADDR, Length: 4},
		{Type: nfL4_SRC_PORT, Length: 2},
		{Type: nfL4_DST_PORT, Length: 2},
		{Type: nfPROTOCOL, Length: 1},
		{Type: nfIN_BYTES, Length: 4},
	}

	tmplBody := make([]byte, 0, 4+len(fields)*4)
	tb := make([]byte, 4)
	binary.BigEndian.PutUint16(tb[0:2], templateID)
	binary.BigEndian.PutUint16(tb[2:4], uint16(len(fields)))
	tmplBody = append(tmplBody, tb...)
	for _, f := range fields {
		fb := make([]byte, 4)
		binary.BigEndian.PutUint16(fb[0:2], f.Type)
		binary.BigEndian.PutUint16(fb[2:4], f.Length)
		tmplBody = append(tmplBody, fb...)
	}
	// Pad template set to 4-byte boundary
	for len(tmplBody)%4 != 0 {
		tmplBody = append(tmplBody, 0)
	}

	dataRec := make([]byte, 0, 17)
	dataRec = append(dataRec, src.To4()...)
	dataRec = append(dataRec, dst.To4()...)
	pb := make([]byte, 2)
	binary.BigEndian.PutUint16(pb, sport)
	dataRec = append(dataRec, pb...)
	binary.BigEndian.PutUint16(pb, dport)
	dataRec = append(dataRec, pb...)
	dataRec = append(dataRec, proto)
	bb := make([]byte, 4)
	binary.BigEndian.PutUint32(bb, bytes)
	dataRec = append(dataRec, bb...)
	for len(dataRec)%4 != 0 {
		dataRec = append(dataRec, 0)
	}

	// Header (20) + tmpl set + data set
	tmplSetLen := 4 + len(tmplBody)
	dataSetLen := 4 + len(dataRec)
	pkt := make([]byte, 20+tmplSetLen+dataSetLen)

	binary.BigEndian.PutUint16(pkt[0:2], 9)          // version
	binary.BigEndian.PutUint16(pkt[2:4], 2)          // count (flowsets)
	binary.BigEndian.PutUint32(pkt[8:12], 1700000000) // unix secs
	binary.BigEndian.PutUint32(pkt[16:20], 1)         // source id

	off := 20
	binary.BigEndian.PutUint16(pkt[off:off+2], 0) // template set
	binary.BigEndian.PutUint16(pkt[off+2:off+4], uint16(tmplSetLen))
	copy(pkt[off+4:], tmplBody)
	off += tmplSetLen

	binary.BigEndian.PutUint16(pkt[off:off+2], templateID)
	binary.BigEndian.PutUint16(pkt[off+2:off+4], uint16(dataSetLen))
	copy(pkt[off+4:], dataRec)

	return pkt
}

func TestNetflowDecoder_BasicFlow(t *testing.T) {
	d := newNetflowDecoder()
	src := net.ParseIP("10.1.2.3")
	dst := net.ParseIP("8.8.8.8")
	pkt := buildMinimalNF9Packet(t, 256, src, dst, 54321, 443, 6, 1500)

	out, err := d.decodePacket(net.ParseIP("192.168.1.1"), pkt)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(out) != 1 {
		t.Fatalf("want 1 packet, got %d", len(out))
	}
	p := out[0]
	if p.Src != "10.1.2.3" || p.Dst != "8.8.8.8" {
		t.Fatalf("addrs: %s -> %s", p.Src, p.Dst)
	}
	if p.SrcPort != 54321 || p.DstPort != 443 {
		t.Fatalf("ports: %d -> %d", p.SrcPort, p.DstPort)
	}
	if p.Protocol != ProtocolTCP {
		t.Fatalf("protocol: %s", p.Protocol)
	}
	if p.Size != 1500 {
		t.Fatalf("size: %d", p.Size)
	}
	if p.Source != "netflow" {
		t.Fatalf("source: %s", p.Source)
	}
	if d.templateCount() != 1 {
		t.Fatalf("templates: %d", d.templateCount())
	}
}

func TestNetflowDecoder_RejectsNonV9(t *testing.T) {
	d := newNetflowDecoder()
	payload := make([]byte, 20)
	binary.BigEndian.PutUint16(payload[0:2], 5)
	_, err := d.decodePacket(net.IPv4(1, 2, 3, 4), payload)
	if err == nil {
		t.Fatal("expected error for v5")
	}
}

func TestListHostAddresses_IncludesWildcard(t *testing.T) {
	addrs, err := ListHostAddresses()
	if err != nil {
		t.Fatal(err)
	}
	if len(addrs) == 0 || addrs[0].IP != "0.0.0.0" {
		t.Fatalf("expected 0.0.0.0 first, got %#v", addrs)
	}
}
