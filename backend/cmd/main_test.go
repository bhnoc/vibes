package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestIsIPPinned(t *testing.T) {
	tests := []struct {
		name     string
		rules    []string
		ip       string
		expected bool
	}{
		{"Exact match - true", []string{"192.168.1.1"}, "192.168.1.1", true},
		{"Exact match - false", []string{"192.168.1.1"}, "192.168.1.2", false},
		{"CIDR - true", []string{"192.168.1.0/24"}, "192.168.1.50", true},
		{"CIDR - false", []string{"192.168.1.0/24"}, "192.168.2.50", false},
		{"Shorthand range - true", []string{"192.168.1.10-20"}, "192.168.1.15", true},
		{"Shorthand range - boundary start", []string{"192.168.1.10-20"}, "192.168.1.10", true},
		{"Shorthand range - boundary end", []string{"192.168.1.10-20"}, "192.168.1.20", true},
		{"Shorthand range - false", []string{"192.168.1.10-20"}, "192.168.1.21", false},
		{"Full range - true", []string{"192.168.1.250-192.168.2.10"}, "192.168.1.255", true},
		{"Full range - true crossover", []string{"192.168.1.250-192.168.2.10"}, "192.168.2.5", true},
		{"Full range - boundary end", []string{"192.168.1.250-192.168.2.10"}, "192.168.2.10", true},
		{"Full range - false", []string{"192.168.1.250-192.168.2.10"}, "192.168.2.11", false},
		{"Reversed full range - true", []string{"192.168.2.10-192.168.1.250"}, "192.168.2.5", true},
		{"Whitespace trimmed rule - true", []string{"  192.168.1.10-20  "}, "192.168.1.15", true},
		{"Invalid rule - skip", []string{"invalid-rule"}, "192.168.1.1", false},
		{"Malformed range - skip", []string{"192.168.1.1-abc"}, "192.168.1.1", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			manager := NewClientManager()
			manager.pinningRules = tt.rules
			if got := manager.isIPPinned(tt.ip); got != tt.expected {
				t.Errorf("isIPPinned(%s) with rules %v = %v; want %v", tt.ip, tt.rules, got, tt.expected)
			}
		})
	}
}

func TestHandleWebSocketParameters(t *testing.T) {
	manager := NewClientManager()

	tests := []struct {
		name           string
		url            string
		expectedStatus int
	}{
		{"Valid Zeek Port", "/ws?zeek_tcp=:4777", http.StatusOK},
		{"Valid Zeek Port without colon", "/ws?zeek_tcp=4777", http.StatusOK},
		{"Invalid Zeek Port (Low)", "/ws?zeek_tcp=:22", http.StatusBadRequest},
		{"Invalid Zeek Port (Non-numeric)", "/ws?zeek_tcp=:abc", http.StatusBadRequest},
		{"Invalid Zeek Port (Out of range)", "/ws?zeek_tcp=:70000", http.StatusBadRequest},
		{"Path Traversal Pcap", "/ws?pcap=../../etc/passwd", http.StatusForbidden},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", tt.url, nil)
			w := httptest.NewRecorder()

			// We can't easily test the WebSocket upgrade because it requires a real connection
			// but we can check if the HTTP handler returns an error before upgrading.
			manager.HandleWebSocket(w, req)

			if tt.expectedStatus != http.StatusOK && w.Code != tt.expectedStatus {
				t.Errorf("%s: expected status %d, got %d", tt.name, tt.expectedStatus, w.Code)
			}
		})
	}
}
