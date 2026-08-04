package capture

import (
	"testing"
	"time"
)

func TestSimulatedCapture_Lifecycle(t *testing.T) {
	sim := NewSimulatedCapture()
	if sim == nil {
		t.Fatal("NewSimulatedCapture returned nil")
	}

	err := sim.Start()
	if err != nil {
		t.Fatalf("Start() error = %v", err)
	}

	// Verify we receive at least one packet within a short timeout
	select {
	case pkt := <-sim.GetPacketChannel():
		if pkt == nil {
			t.Fatal("Received nil packet")
		}
		if pkt.Src == "" || pkt.Dst == "" {
			t.Errorf("Packet missing src/dst: %+v", pkt)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Timeout waiting for packet from SimulatedCapture")
	}

	// Stop cleanly
	err = sim.Stop()
	if err != nil {
		t.Fatalf("Stop() error = %v", err)
	}

	// Calling Stop again should return an error, but not deadlock or panic
	err = sim.Stop()
	if err == nil {
		t.Error("Expected error calling Stop() on already stopped capture, got nil")
	}
}

func TestPacket_ToJSON(t *testing.T) {
	pkt := NewPacket("192.168.1.10", "10.0.0.1", 12345, 80, 500, ProtocolTCP)
	data, err := pkt.ToJSON()
	if err != nil {
		t.Fatalf("ToJSON() error = %v", err)
	}
	if len(data) == 0 {
		t.Error("ToJSON() returned empty data")
	}
}
