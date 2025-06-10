# Backend Simulation Long-Duration Test Summary

**Generated:** Mon Jun  9 02:09:34 MDT 2025
**Test Duration:** 90 seconds
**Backend URL:** http://localhost:8080

## Test Overview

This test validates the backend simulation by running a WebSocket connection
for 90 seconds to identify issues that occur after the initial 60-second period.

## Test Results

### Packet Generation
- Total packets: 8361
- Error count: 0

### Protocol Distribution
- TCP: 4835
- UDP: 2591
- ICMP: 935
- OTHER: 0

### Network Distribution
- local: 5399
- server: 1144
- internet: 1818

## Files Generated

- Test Results: `long_duration_test_20250609_020803.json`
- Test Log: `websocket_test_20250609_020803.log`
- This Report: `simulation_test_summary_20250609_020803.md`

## Recommendations

1. Review the test log for any ERROR entries
2. Check if packet generation stops or slows after 60 seconds
3. Verify consistent packet structure throughout the test duration
4. Monitor for any WebSocket connection issues

---
*Test completed at Mon Jun  9 02:09:35 MDT 2025*
