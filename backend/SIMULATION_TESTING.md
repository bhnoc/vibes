# Backend Testing & Operations Guide

This guide explains backend operation modes, storage management, and testing procedures.

## Overview

The backend provides multiple modes of operation:
1. **Real Capture Mode**: Captures actual network packets from a specified interface
2. **Dumpcap Mode**: High-performance capture using Wireshark's dumpcap with automatic storage management
3. **PCAP Replay Mode**: Replays pre-recorded PCAP files at variable speeds
4. **Simulation Mode**: Generates realistic simulated network traffic for testing/demo purposes

---

## Storage Management (Dumpcap Mode)

When running long-duration captures (e.g., multi-day events), the backend provides hybrid storage management to prevent disk exhaustion while ensuring continuous capture.

### The Problem

- Event generates ~5TB of capture data over its duration
- Only 600GB of disk space available
- Cannot stop capture or lose packets
- Need to maintain rolling history within storage limits

### The Solution: Hybrid Approach

Two layers of protection ensure storage never exceeds limits:

#### Layer 1: dumpcap Ring Buffer (Safety Net)
dumpcap's built-in `-b files:N` option automatically deletes oldest files when the file count exceeds N. This is a hard safety net.

#### Layer 2: Storage Manager (Precise Control)
A background goroutine monitors actual disk usage every 30 seconds and performs FIFO cleanup when storage exceeds the configured maximum.

### Configuration Flags

| Flag | Default | Description |
|------|---------|-------------|
| `-max-storage-gb` | 600 | Maximum total storage in GB |
| `-file-rotation-mb` | 1000 | Rotate PCAP files after this size (MB) |
| `-file-rotation-mins` | 60 | Rotate PCAP files after this duration |
| `-ring-buffer-files` | auto | Max files to keep (auto = maxGB / rotationMB) |

### Example Configurations

**Default (600GB limit, 1GB files):**
```bash
go run cmd/main.go -dumpcap -launch-dumpcap -iface eth0
```

**Custom 100GB limit with smaller files:**
```bash
go run cmd/main.go -dumpcap -launch-dumpcap -iface eth0 \
  -max-storage-gb 100 \
  -file-rotation-mb 500 \
  -file-rotation-mins 30
```

**Large event (2TB limit, 2GB files):**
```bash
go run cmd/main.go -dumpcap -launch-dumpcap -iface eth0 \
  -max-storage-gb 2000 \
  -file-rotation-mb 2000 \
  -file-rotation-mins 120
```

### How It Works

1. **dumpcap** writes PCAP files to `-dumpcap-dir` (default: `/data/pcaps`)
2. Files rotate based on size (`-file-rotation-mb`) OR time (`-file-rotation-mins`)
3. **Ring buffer** keeps maximum N files (auto-calculated or manual)
4. **Storage Manager** checks every 30 seconds:
   - If total size > `max-storage-gb`: delete oldest files
   - Continue until size < 90% of max (low watermark)
   - Respects 5-minute minimum retention (won't delete files being written)

### Storage API Endpoint

Monitor storage status via the REST API:

```bash
curl http://localhost:8080/api/storage
```

**Response:**
```json
{
  "enabled": true,
  "totalFiles": 450,
  "totalSizeBytes": 454963200000,
  "totalSizeGB": 423.75,
  "maxSizeGB": 600,
  "usagePercent": 70.6,
  "oldestFile": "2024-01-15T08:30:00Z",
  "newestFile": "2024-01-15T16:45:00Z",
  "lastCleanup": "2024-01-15T16:30:00Z",
  "filesDeleted": 127,
  "bytesFreed": 134217728000,
  "bytesFreedGB": 125.0
}
```

### Storage Manager Behavior

| Condition | Action |
|-----------|--------|
| Usage < 90% | No action |
| Usage >= 100% | Delete oldest files until < 90% |
| File age < 5 min | Skip (minimum retention) |
| Cleanup triggered | Log each deleted file |

### Logs

The storage manager logs its activity:

```
📦 Storage Manager started: monitoring /data/pcaps (max: 600.00 GB, low watermark: 90%)
🧹 Storage cleanup needed: 612.45 GB used, target 540.00 GB (freeing 72.45 GB)
🗑️ Deleted: dumpcap_eth0_2024-01-15_08-30-00.pcap (1.00 GB, age: 8h15m)
🗑️ Deleted: dumpcap_eth0_2024-01-15_09-30-00.pcap (1.00 GB, age: 7h15m)
...
✅ Cleanup complete: deleted 73 files, freed 73.00 GB
```

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        VIBES Backend                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐     ┌──────────────────┐     ┌──────────────┐ │
│  │   dumpcap   │────▶│  /data/pcaps/    │◀────│   Storage    │ │
│  │  (capture)  │     │                  │     │   Manager    │ │
│  └─────────────┘     │  file1.pcap      │     └──────────────┘ │
│        │             │  file2.pcap      │           │          │
│        │             │  file3.pcap      │           │          │
│        ▼             │  ...             │           ▼          │
│  Ring Buffer         │  fileN.pcap      │     Monitors size    │
│  (files:N)           │                  │     every 30s        │
│  - Hard limit        └──────────────────┘     Deletes oldest   │
│  - Auto-deletes                               when > max       │
│    oldest file                                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Failure Modes & Recovery

| Scenario | Behavior |
|----------|----------|
| Storage Manager crash | Ring buffer continues protecting disk |
| Ring buffer disabled | Storage Manager handles all cleanup |
| Disk fills unexpectedly | Both layers attempt cleanup |
| Files locked by reader | Skipped, retried next cycle |
| Permissions error | Logged, continues monitoring |

### Historical Playback Compatibility

The backend supports **historical playback** via the TimeWindowProcessor, which reads archived PCAP files for time-based replay. This can conflict with storage management if both use the same directory.

#### The Issue
- **Storage Manager** deletes old files from `-dumpcap-dir`
- **TimeWindowProcessor** reads files from `-storage`
- Default: both point to `/data/pcaps`

#### Solutions

**Option 1: Separate Directories (Recommended for Production)**
```bash
# Live capture with storage management
go run cmd/main.go -dumpcap -launch-dumpcap -iface eth0 \
  -dumpcap-dir /data/live-capture \
  -max-storage-gb 600

# Historical playback reads from archive
# (manually archive important captures to /data/archive)
go run cmd/main.go -storage /data/archive
```

**Option 2: Same Directory with Awareness**
```bash
# Warning will be logged
go run cmd/main.go -dumpcap -launch-dumpcap -iface eth0 \
  -dumpcap-dir /data/pcaps \
  -storage /data/pcaps
```

When using the same directory:
- Old files WILL be deleted by storage manager
- Historical playback only works for files within retention window
- 5-minute minimum retention protects currently-writing files

#### Best Practices

| Use Case | Configuration |
|----------|---------------|
| Short event (< storage limit) | Same directory is fine |
| Long event (> storage limit) | Separate directories |
| Need full historical access | Archive important files to separate location |
| Real-time only | Single directory with aggressive cleanup |

---

## Simulation Testing

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