#!/bin/bash

# =============================================================================
# Backend Simulation Long-Duration Test
# =============================================================================
# This script tests the backend simulation for longer than 60 seconds to
# identify any issues that occur after the initial period.
# 
# ETHICAL USAGE DISCLAIMER:
# This script is intended for testing legitimate network monitoring software
# only. Do not use this script to test against unauthorized systems.
# =============================================================================

set -euo pipefail

# Configuration
BACKEND_HOST="localhost"
BACKEND_PORT="8080"
BASE_URL="http://${BACKEND_HOST}:${BACKEND_PORT}"
WEBSOCKET_URL="ws://${BACKEND_HOST}:${BACKEND_PORT}/ws"
TEST_DURATION=90  # Run for 90 seconds to catch issues after 60s
OUTPUT_DIR="./test_results"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date '+%H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date '+%H:%M:%S')] ERROR: $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')] INFO: $1${NC}"
}

# Function to check if backend is running
check_backend_status() {
    log "Checking if backend is running on ${BASE_URL}..."
    
    if curl -s -f "${BASE_URL}/api/interfaces" > /dev/null 2>&1; then
        log "✅ Backend is running and responding"
        return 0
    else
        error "❌ Backend is not running or not responding"
        error "Please start the backend with: cd backend && go run cmd/main.go"
        return 1
    fi
}

# Function to test long-duration WebSocket simulation
test_long_duration_websocket() {
    log "Testing WebSocket simulation for ${TEST_DURATION} seconds..."
    
    local output_file="${OUTPUT_DIR}/long_duration_test_${TIMESTAMP}.json"
    local log_file="${OUTPUT_DIR}/websocket_test_${TIMESTAMP}.log"
    
    # Create Node.js WebSocket client for long-duration test
    cat > "${OUTPUT_DIR}/long_duration_test.js" << EOF
const WebSocket = require('ws');
const fs = require('fs');

const ws = new WebSocket('ws://localhost:${BACKEND_PORT}/ws?interface=simulation'); // Force simulation mode
const packets = [];
let packetCount = 0;
let modeConfirmed = false;
let startTime = Date.now();
const testDuration = ${TEST_DURATION} * 1000; // Convert to milliseconds
let lastPacketTime = Date.now();
let errorCount = 0;

// Track packet statistics
let packetStats = {
    tcp: 0,
    udp: 0,
    icmp: 0,
    other: 0
};

let networkStats = {
    local: 0,      // 192.168.1.x
    server: 0,     // 10.0.0.x
    internet: 0    // others
};

function logMessage(message) {
    const timestamp = new Date().toISOString().substr(11, 8);
    const logLine = \`[\${timestamp}] \${message}\`;
    console.log(logLine);
    
    // Also write to log file
    try {
        fs.appendFileSync(process.argv[3], logLine + '\\n');
    } catch (e) {
        console.error('Error writing to log file:', e);
    }
}

function analyzePacket(packet) {
    // Count protocols
    if (packet.protocol) {
        packetStats[packet.protocol.toLowerCase()] = (packetStats[packet.protocol.toLowerCase()] || 0) + 1;
    }
    
    // Count network types
    if (packet.src) {
        if (packet.src.startsWith('192.168.1.')) {
            networkStats.local++;
        } else if (packet.src.startsWith('10.0.0.')) {
            networkStats.server++;
        } else {
            networkStats.internet++;
        }
    }
}

function validatePacketStructure(packet) {
    const requiredFields = ['type', 'src', 'dst', 'size', 'protocol', 'timestamp'];
    
    for (const field of requiredFields) {
        if (!(field in packet) || packet[field] === null || packet[field] === undefined) {
            logMessage(\`ERROR: Packet missing field '\${field}': \${JSON.stringify(packet)}\`);
            return false;
        }
    }
    
    // Validate IP addresses
    const ipRegex = /^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$/;
    if (!ipRegex.test(packet.src)) {
        logMessage(\`ERROR: Invalid source IP format: \${packet.src}\`);
        return false;
    }
    
    if (!ipRegex.test(packet.dst)) {
        logMessage(\`ERROR: Invalid destination IP format: \${packet.dst}\`);
        return false;
    }
    
    // Validate size
    if (typeof packet.size !== 'number' || packet.size <= 0) {
        logMessage(\`ERROR: Invalid packet size: \${packet.size}\`);
        return false;
    }
    
    // Validate protocol
    const validProtocols = ['TCP', 'UDP', 'ICMP', 'OTHER'];
    if (!validProtocols.includes(packet.protocol)) {
        logMessage(\`ERROR: Invalid protocol: \${packet.protocol}\`);
        return false;
    }
    
    return true;
}

ws.on('open', function open() {
    logMessage('Connected to WebSocket in simulation mode');
    logMessage(\`Test will run for \${testDuration/1000} seconds\`);
});

ws.on('message', function message(data) {
    try {
        const packet = JSON.parse(data.toString());
        lastPacketTime = Date.now();
        
        if (packet.type === 'mode') {
            modeConfirmed = true;
            logMessage(\`Mode confirmed: \${packet.mode} (interface: '\${packet.interface || 'none'}')\`);
            if (packet.mode !== 'simulated') {
                logMessage(\`WARNING: Expected simulation mode but got: \${packet.mode}\`);
            }
        } else if (packet.type === 'packet') {
            if (validatePacketStructure(packet)) {
                packets.push(packet);
                analyzePacket(packet);
                packetCount++;
                
                // Log progress every 50 packets
                if (packetCount % 50 === 0) {
                    const elapsed = (Date.now() - startTime) / 1000;
                    const rate = packetCount / elapsed;
                    logMessage(\`Collected \${packetCount} packets (rate: \${rate.toFixed(1)} pps)\`);
                }
            } else {
                errorCount++;
                if (errorCount > 10) {
                    logMessage(\`ERROR: Too many packet validation errors (\${errorCount}), stopping test\`);
                    ws.close();
                    process.exit(1);
                }
            }
        } else {
            logMessage(\`Received unknown message type: \${packet.type}\`);
        }
        
        // Check if test duration is complete
        if (Date.now() - startTime >= testDuration) {
            logMessage(\`Test duration completed (\${testDuration/1000}s)\`);
            
            // Log final statistics
            logMessage('=== FINAL STATISTICS ===');
            logMessage(\`Total packets: \${packetCount}\`);
            logMessage(\`Error count: \${errorCount}\`);
            logMessage(\`Protocol distribution: \${JSON.stringify(packetStats)}\`);
            logMessage(\`Network distribution: \${JSON.stringify(networkStats)}\`);
            
            const testData = {
                testDuration: testDuration,
                packetCount: packetCount,
                errorCount: errorCount,
                modeConfirmed: modeConfirmed,
                packetStats: packetStats,
                networkStats: networkStats,
                packets: packets
            };
            
            // Save results
            fs.writeFileSync(process.argv[2], JSON.stringify(testData, null, 2));
            logMessage(\`Results saved to: \${process.argv[2]}\`);
            
            ws.close();
            process.exit(0);
        }
        
    } catch (e) {
        errorCount++;
        logMessage(\`ERROR: Failed to parse message: \${e.message}\`);
        
        if (errorCount > 20) {
            logMessage('ERROR: Too many parse errors, stopping test');
            ws.close();
            process.exit(1);
        }
    }
});

ws.on('error', function error(err) {
    logMessage(\`WebSocket error: \${err.message}\`);
    process.exit(1);
});

ws.on('close', function close() {
    const elapsed = (Date.now() - startTime) / 1000;
    logMessage(\`WebSocket connection closed after \${elapsed.toFixed(1)}s\`);
    
    if (elapsed < testDuration / 1000 - 5) {
        logMessage('WARNING: Connection closed prematurely');
        process.exit(1);
    }
    
    process.exit(0);
});

// Timeout safety net
setTimeout(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    logMessage(\`TIMEOUT: Test exceeded maximum duration (\${elapsed.toFixed(1)}s)\`);
    
    if (packetCount === 0) {
        logMessage('ERROR: No packets received during test');
        process.exit(1);
    }
    
    // Check for packet flow interruption
    const timeSinceLastPacket = (Date.now() - lastPacketTime) / 1000;
    if (timeSinceLastPacket > 10) {
        logMessage(\`ERROR: No packets received for \${timeSinceLastPacket.toFixed(1)}s\`);
        process.exit(1);
    }
    
    ws.close();
    process.exit(0);
}, testDuration + 10000); // Add 10s buffer
EOF

    # Run the long-duration test
    if command -v node > /dev/null 2>&1; then
        info "Starting ${TEST_DURATION}-second WebSocket simulation test..."
        
        if node "${OUTPUT_DIR}/long_duration_test.js" "$output_file" "$log_file" 2>&1; then
            log "✅ Long-duration test completed successfully"
            
            # Analyze results
            if [ -f "$output_file" ]; then
                local total_packets=$(jq '.packetCount // 0' "$output_file")
                local error_count=$(jq '.errorCount // 0' "$output_file")
                local test_duration_actual=$(jq '.testDuration // 0' "$output_file")
                
                info "=== TEST RESULTS ==="
                info "Duration: $((test_duration_actual / 1000)) seconds"
                info "Total packets: $total_packets"
                info "Error count: $error_count"
                
                # Check for specific issues
                if [ "$error_count" -gt 0 ]; then
                    warn "⚠️  $error_count errors detected during simulation"
                    
                    # Show error details from log
                    if [ -f "$log_file" ]; then
                        warn "Error details:"
                        grep "ERROR:" "$log_file" | tail -5
                    fi
                else
                    log "✅ No errors detected during simulation"
                fi
                
                if [ "$total_packets" -gt 0 ]; then
                    local rate=$(echo "scale=1; $total_packets / ($test_duration_actual / 1000)" | bc)
                    log "✅ Packet rate: ${rate} packets/second"
                else
                    error "❌ No packets generated during test"
                    return 1
                fi
                
                return 0
            else
                error "❌ Test output file not created"
                return 1
            fi
        else
            error "❌ Long-duration test failed"
            
            # Show recent log entries if available
            if [ -f "$log_file" ]; then
                error "Recent log entries:"
                tail -10 "$log_file"
            fi
            
            return 1
        fi
    else
        error "Node.js is required for WebSocket testing"
        error "Please install Node.js to run this test"
        return 1
    fi
}

# Function to generate summary report
generate_summary_report() {
    log "Generating test summary..."
    
    local report_file="${OUTPUT_DIR}/simulation_test_summary_${TIMESTAMP}.md"
    
    cat > "$report_file" << EOF
# Backend Simulation Long-Duration Test Summary

**Generated:** $(date)
**Test Duration:** ${TEST_DURATION} seconds
**Backend URL:** ${BASE_URL}

## Test Overview

This test validates the backend simulation by running a WebSocket connection
for ${TEST_DURATION} seconds to identify issues that occur after the initial 60-second period.

## Test Results

$(if [ -f "${OUTPUT_DIR}/long_duration_test_${TIMESTAMP}.json" ]; then
    echo "### Packet Generation"
    local packets=$(jq '.packetCount // 0' "${OUTPUT_DIR}/long_duration_test_${TIMESTAMP}.json")
    local errors=$(jq '.errorCount // 0' "${OUTPUT_DIR}/long_duration_test_${TIMESTAMP}.json")
    echo "- Total packets: $packets"
    echo "- Error count: $errors"
    echo ""
    echo "### Protocol Distribution"
    jq -r '.packetStats | to_entries[] | "- \(.key | ascii_upcase): \(.value)"' "${OUTPUT_DIR}/long_duration_test_${TIMESTAMP}.json"
    echo ""
    echo "### Network Distribution"
    jq -r '.networkStats | to_entries[] | "- \(.key): \(.value)"' "${OUTPUT_DIR}/long_duration_test_${TIMESTAMP}.json"
else
    echo "Test data not available"
fi)

## Files Generated

- Test Results: \`long_duration_test_${TIMESTAMP}.json\`
- Test Log: \`websocket_test_${TIMESTAMP}.log\`
- This Report: \`simulation_test_summary_${TIMESTAMP}.md\`

## Recommendations

1. Review the test log for any ERROR entries
2. Check if packet generation stops or slows after 60 seconds
3. Verify consistent packet structure throughout the test duration
4. Monitor for any WebSocket connection issues

---
*Test completed at $(date)*
EOF

    log "✅ Summary report generated: $report_file"
}

# Main execution function
run_simulation_test() {
    log "=== STARTING LONG-DURATION BACKEND SIMULATION TEST ==="
    
    # Create output directory
    mkdir -p "$OUTPUT_DIR"
    
    # Prerequisites check
    if ! command -v jq > /dev/null 2>&1; then
        error "jq is required but not installed. Please install jq to run this script."
        exit 1
    fi
    
    if ! command -v curl > /dev/null 2>&1; then
        error "curl is required but not installed. Please install curl to run this script."
        exit 1
    fi
    
    if ! command -v bc > /dev/null 2>&1; then
        error "bc is required but not installed. Please install bc for calculations."
        exit 1
    fi
    
    # Check backend status
    if ! check_backend_status; then
        exit 1
    fi
    
    # Run long-duration test
    if test_long_duration_websocket; then
        log "✅ Simulation test completed successfully"
    else
        error "❌ Simulation test failed"
        exit 1
    fi
    
    # Generate summary
    generate_summary_report
    
    log "=== TEST COMPLETED ✅ ==="
    log "Check the generated files in: $OUTPUT_DIR"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -h, --help              Show this help message"
    echo "  -d, --duration SECONDS  Test duration in seconds (default: $TEST_DURATION)"
    echo "  -p, --port PORT         Backend port (default: $BACKEND_PORT)"
    echo "  -o, --output DIR        Output directory (default: $OUTPUT_DIR)"
    echo ""
    echo "This script tests the backend simulation for longer than 60 seconds"
    echo "to identify any issues that occur after the initial period."
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_usage
            exit 0
            ;;
        -d|--duration)
            TEST_DURATION="$2"
            shift 2
            ;;
        -p|--port)
            BACKEND_PORT="$2"
            BASE_URL="http://${BACKEND_HOST}:${BACKEND_PORT}"
            WEBSOCKET_URL="ws://${BACKEND_HOST}:${BACKEND_PORT}/ws"
            shift 2
            ;;
        -o|--output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        *)
            error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Main execution
main() {
    # Validate inputs
    if ! [[ "$TEST_DURATION" =~ ^[0-9]+$ ]] || [ "$TEST_DURATION" -lt 30 ]; then
        error "Invalid test duration: $TEST_DURATION (minimum 30 seconds)"
        exit 1
    fi
    
    if ! [[ "$BACKEND_PORT" =~ ^[0-9]+$ ]] || [ "$BACKEND_PORT" -lt 1 ] || [ "$BACKEND_PORT" -gt 65535 ]; then
        error "Invalid port: $BACKEND_PORT"
        exit 1
    fi
    
    # Run the test
    run_simulation_test
}

# Execute main function
main "$@" 