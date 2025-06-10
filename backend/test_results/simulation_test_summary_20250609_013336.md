# Backend Simulation Long-Duration Test Summary

**Generated:** Mon Jun  9 01:35:08 MDT 2025
**Test Duration:** 90 seconds
**Backend URL:** http://localhost:8080

## Test Overview

This test validates the backend simulation by running a WebSocket connection
for 90 seconds to identify issues that occur after the initial 60-second period.

## Test Results

### Packet Generation
- Total packets: 8341
- Error count: 0

### Protocol Distribution
- TCP: 4885
- UDP: 2549
- ICMP: 907
- OTHER: 0

### Network Distribution
- local: 5341
- server: 1168
- internet: 1832

## Files Generated

- Test Results: `long_duration_test_20250609_013336.json`
- Test Log: `websocket_test_20250609_013336.log`
- This Report: `simulation_test_summary_20250609_013336.md`

## Recommendations

1. Review the test log for any ERROR entries
2. Check if packet generation stops or slows after 60 seconds
3. Verify consistent packet structure throughout the test duration
4. Monitor for any WebSocket connection issues

---
*Test completed at Mon Jun  9 01:35:10 MDT 2025*
