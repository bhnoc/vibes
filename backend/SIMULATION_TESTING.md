# Backend Simulation Testing Guide

This guide explains how to verify that the backend is properly simulating packet data in simulation mode.

## Overview

The backend provides two modes of operation:
1. **Real Capture Mode**: Captures actual network packets from a specified interface
2. **Simulation Mode**: Generates realistic simulated network traffic for testing/demo purposes

## Quick Verification

### Method 1: Manual Browser Check
1. Start the backend: `cd backend && go run cmd/main.go`
2. Open: http://localhost:8080/debug/capture?interface=nonexistent
3. You should see: **"⚠️ SHOWING SIMULATED DATA - NOT REAL NETWORK TRAFFIC ⚠️"**
4. Verify packets are being displayed with realistic data

### Method 2: API Check
```bash
# Check if backend is running
curl http://localhost:8080/api/interfaces

# Should return JSON array of network interfaces
```

## Long-Duration Testing

### Bash Test Suite (90+ seconds)
```bash
cd backend
./test_simulation.sh
```

**Purpose**: Tests simulation for longer than 60 seconds to catch issues that occur after the initial period.

**Requirements:**
- `jq` (JSON processor)
- `curl` (HTTP client)  
- `node` (required for WebSocket testing)
- `bc` (for calculations)

## What the Simulation Provides

### Network Topology
The simulation creates a realistic network environment with:

**Local Network (192.168.1.x)**
- 20 client machines (192.168.1.10 - 192.168.1.29)
- Regular internal traffic patterns

**Server Network (10.0.0.x)**  
- 10 server machines (10.0.0.10 - 10.0.0.90)
- Server-client communications

**Gateway Infrastructure**
- Multiple gateways (192.168.1.1, 192.168.2.1, 192.168.3.1)
- Routing between networks

**Internet Connectivity**
- External services (8.8.8.8, 1.1.1.1, etc.)
- Realistic external traffic

### Traffic Patterns

**Protocol Distribution:**
- **TCP**: Web traffic, API calls, file transfers
- **UDP**: DNS queries, streaming, gaming
- **ICMP**: Ping, network diagnostics

**Traffic Types:**
- **Fast Traffic**: Every 50ms (regular client activity)
- **Slow Traffic**: Every 500ms (server communications)  
- **Burst Traffic**: Every 2 seconds (heavy data transfers)

**Packet Characteristics:**
- Realistic packet sizes (64 bytes - 1500 bytes)
- Proper IP address formatting
- Sequential timestamps
- Consistent connection patterns

## Validation Checklist

### ✅ Basic Functionality
- [ ] Backend starts without errors
- [ ] WebSocket connections work
- [ ] Simulation mode is clearly indicated
- [ ] Packets are generated continuously

### ✅ Data Quality
- [ ] All required packet fields present
- [ ] IP addresses are valid format
- [ ] Packet sizes are realistic
- [ ] Timestamps are sequential
- [ ] Protocols are valid (TCP/UDP/ICMP)

### ✅ Network Patterns
- [ ] Local network traffic present
- [ ] Server communications active
- [ ] Internet traffic included
- [ ] Gateway routing visible
- [ ] Multiple protocols in use

### ✅ Performance
- [ ] Packet generation rate is appropriate
- [ ] No memory leaks or crashes
- [ ] WebSocket streaming is smooth
- [ ] CPU usage is reasonable

## API Endpoints for Testing

### WebSocket Connection
```
ws://localhost:8080/ws
```
- **Without interface parameter**: Simulation mode
- **With interface parameter**: Real capture mode (falls back to simulation if failed)

### Debug Capture
```
http://localhost:8080/debug/capture?interface=test
```
- Shows live packet capture in browser
- Clearly indicates simulation vs real mode
- Displays packet details and JSON structure

### Network Interfaces
```
http://localhost:8080/api/interfaces
```
- Lists available network interfaces
- Used by frontend for interface selection

## Expected Simulation Output

### Mode Confirmation Message
```json
{
  "type": "mode",
  "mode": "simulated",
  "interface": ""
}
```

### Sample Packet Data
```json
{
  "type": "packet",
  "src": "192.168.1.15",
  "dst": "10.0.0.30",
  "size": 1234,
  "protocol": "TCP",
  "timestamp": 1701234567,
  "source": "simulated"
}
```

## Troubleshooting

### Backend Won't Start
```bash
# Check if port is in use
lsof -i :8080

# Try different port
go run cmd/main.go -addr=:8081
```

### No Packets Generated
- Check WebSocket connection
- Verify simulation mode is active
- Check browser console for errors

### Invalid Packet Data
- Update backend code
- Restart backend service
- Clear browser cache

### Performance Issues
- Monitor CPU/memory usage
- Reduce packet generation rate
- Check for memory leaks

## Integration with Frontend

The frontend should:
1. Connect to WebSocket without interface parameter for simulation
2. Display mode indicator (simulation vs real)
3. Handle packet data properly
4. Show network topology visualization
5. Update in real-time

## Development Notes

### Simulation Code Location
- Main logic: `internal/capture/packet.go`
- SimulatedCapture struct handles packet generation
- Configurable timing and patterns

### Key Parameters
- **Fast ticker**: 50ms (regular traffic)
- **Slow ticker**: 500ms (server traffic)  
- **Burst ticker**: 2 seconds (heavy traffic)
- **Packet buffer**: 100 packets

### Customization Options
- Modify IP ranges in `generatePackets()`
- Adjust timing intervals
- Add new traffic patterns
- Include additional protocols

## Security Considerations

The simulation mode is safe for testing because:
- ✅ No real network interfaces accessed
- ✅ No actual packet capture performed
- ✅ No network traffic generated
- ✅ Only simulated data structures created
- ✅ No external network connections required

## Conclusion

The backend simulation provides a comprehensive testing environment for network visualization without requiring:
- Administrator privileges
- Real network interfaces
- Actual network traffic
- Security concerns

Use the provided testing scripts to validate simulation quality and ensure proper integration with your frontend visualization system. 