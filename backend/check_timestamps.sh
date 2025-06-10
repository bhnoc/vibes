#!/bin/bash

# Quick timestamp verification script
# Tests if simulation generates unique, progressing timestamps

echo "🕐 Checking Simulation Timestamp Progression"
echo "=============================================="

# Check if backend is running
if ! curl -s -f "http://localhost:8080/api/interfaces" > /dev/null 2>&1; then
    echo "❌ Backend not running. Start with: cd backend && go run cmd/main.go"
    exit 1
fi

echo "✅ Backend is running"

# Create a simple Node.js script to collect just timestamps
cat > timestamp_test.js << 'EOF'
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080/ws');
const timestamps = [];
let packetCount = 0;
const maxPackets = 20;

ws.on('open', function open() {
    console.log('Connected - collecting timestamps...');
});

ws.on('message', function message(data) {
    try {
        const packet = JSON.parse(data.toString());
        
        if (packet.type === 'packet') {
            timestamps.push(packet.timestamp);
            packetCount++;
            
            console.log(`Packet ${packetCount}: timestamp=${packet.timestamp}, src=${packet.src}, dst=${packet.dst}`);
            
            if (packetCount >= maxPackets) {
                console.log('\n📊 TIMESTAMP ANALYSIS:');
                
                // Check for duplicates
                const uniqueTimestamps = [...new Set(timestamps)];
                console.log(`Total packets: ${timestamps.length}`);
                console.log(`Unique timestamps: ${uniqueTimestamps.length}`);
                
                if (uniqueTimestamps.length === timestamps.length) {
                    console.log('✅ All timestamps are unique');
                } else {
                    console.log('❌ Duplicate timestamps detected!');
                    
                    // Find duplicates
                    const counts = {};
                    timestamps.forEach(ts => counts[ts] = (counts[ts] || 0) + 1);
                    const duplicates = Object.entries(counts).filter(([ts, count]) => count > 1);
                    
                    console.log('Duplicate timestamps:');
                    duplicates.forEach(([ts, count]) => {
                        console.log(`  ${ts}: ${count} packets`);
                    });
                }
                
                // Check if timestamps are progressing
                const sorted = [...timestamps].sort((a, b) => a - b);
                const isProgressing = JSON.stringify(timestamps) !== JSON.stringify(sorted);
                
                if (isProgressing) {
                    console.log('✅ Timestamps are progressing (not just sequential)');
                } else {
                    console.log('⚠️  Timestamps appear to be purely sequential');
                }
                
                // Show time range
                const minTime = Math.min(...timestamps);
                const maxTime = Math.max(...timestamps);
                const timeSpan = maxTime - minTime;
                
                console.log(`Time range: ${minTime} to ${maxTime} (span: ${timeSpan} seconds)`);
                
                if (timeSpan > 0) {
                    console.log('✅ Timestamps span multiple seconds');
                } else {
                    console.log('❌ All timestamps are from the same second');
                }
                
                ws.close();
                process.exit(0);
            }
        }
    } catch (e) {
        console.error('Error parsing message:', e);
    }
});

ws.on('error', function error(err) {
    console.error('WebSocket error:', err);
    process.exit(1);
});

setTimeout(() => {
    console.log('Timeout - not enough packets received');
    process.exit(1);
}, 10000);
EOF

# Run the test
if command -v node > /dev/null 2>&1; then
    echo "🔍 Testing timestamp progression for 20 packets..."
    echo ""
    
    if node timestamp_test.js; then
        echo ""
        echo "✅ Timestamp test completed"
    else
        echo ""
        echo "❌ Timestamp test failed"
        exit 1
    fi
    
    # Cleanup
    rm -f timestamp_test.js
else
    echo "❌ Node.js required for this test"
    exit 1
fi

echo ""
echo "🎯 Summary:"
echo "- If timestamps are unique and progressing: ✅ Simulation is working correctly"
echo "- If timestamps are duplicated: ❌ Replay issue confirmed"
echo "- Check the output above for specific results" 