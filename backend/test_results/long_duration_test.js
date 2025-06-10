const WebSocket = require('ws');
const fs = require('fs');

const ws = new WebSocket('ws://localhost:8080/ws'); // No interface param = simulation mode
const packets = [];
let packetCount = 0;
let modeConfirmed = false;
let startTime = Date.now();
const testDuration = 90 * 1000; // Convert to milliseconds
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
    const logLine = `[${timestamp}] ${message}`;
    console.log(logLine);
    
    // Also write to log file
    try {
        fs.appendFileSync(process.argv[3], logLine + '\n');
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
            logMessage(`ERROR: Packet missing field '${field}': ${JSON.stringify(packet)}`);
            return false;
        }
    }
    
    // Validate IP addresses
    const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    if (!ipRegex.test(packet.src)) {
        logMessage(`ERROR: Invalid source IP format: ${packet.src}`);
        return false;
    }
    
    if (!ipRegex.test(packet.dst)) {
        logMessage(`ERROR: Invalid destination IP format: ${packet.dst}`);
        return false;
    }
    
    // Validate size
    if (typeof packet.size !== 'number' || packet.size <= 0) {
        logMessage(`ERROR: Invalid packet size: ${packet.size}`);
        return false;
    }
    
    // Validate protocol
    const validProtocols = ['TCP', 'UDP', 'ICMP', 'OTHER'];
    if (!validProtocols.includes(packet.protocol)) {
        logMessage(`ERROR: Invalid protocol: ${packet.protocol}`);
        return false;
    }
    
    return true;
}

ws.on('open', function open() {
    logMessage('Connected to WebSocket in simulation mode');
    logMessage(`Test will run for ${testDuration/1000} seconds`);
});

ws.on('message', function message(data) {
    try {
        const packet = JSON.parse(data.toString());
        lastPacketTime = Date.now();
        
        if (packet.type === 'mode') {
            modeConfirmed = true;
            logMessage(`Mode confirmed: ${packet.mode} (interface: '${packet.interface || 'none'}')`);
            if (packet.mode !== 'simulated') {
                logMessage(`WARNING: Expected simulation mode but got: ${packet.mode}`);
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
                    logMessage(`Collected ${packetCount} packets (rate: ${rate.toFixed(1)} pps)`);
                }
            } else {
                errorCount++;
                if (errorCount > 10) {
                    logMessage(`ERROR: Too many packet validation errors (${errorCount}), stopping test`);
                    ws.close();
                    process.exit(1);
                }
            }
        } else {
            logMessage(`Received unknown message type: ${packet.type}`);
        }
        
        // Check if test duration is complete
        if (Date.now() - startTime >= testDuration) {
            logMessage(`Test duration completed (${testDuration/1000}s)`);
            
            // Log final statistics
            logMessage('=== FINAL STATISTICS ===');
            logMessage(`Total packets: ${packetCount}`);
            logMessage(`Error count: ${errorCount}`);
            logMessage(`Protocol distribution: ${JSON.stringify(packetStats)}`);
            logMessage(`Network distribution: ${JSON.stringify(networkStats)}`);
            
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
            logMessage(`Results saved to: ${process.argv[2]}`);
            
            ws.close();
            process.exit(0);
        }
        
    } catch (e) {
        errorCount++;
        logMessage(`ERROR: Failed to parse message: ${e.message}`);
        
        if (errorCount > 20) {
            logMessage('ERROR: Too many parse errors, stopping test');
            ws.close();
            process.exit(1);
        }
    }
});

ws.on('error', function error(err) {
    logMessage(`WebSocket error: ${err.message}`);
    process.exit(1);
});

ws.on('close', function close() {
    const elapsed = (Date.now() - startTime) / 1000;
    logMessage(`WebSocket connection closed after ${elapsed.toFixed(1)}s`);
    
    if (elapsed < testDuration / 1000 - 5) {
        logMessage('WARNING: Connection closed prematurely');
        process.exit(1);
    }
    
    process.exit(0);
});

// Timeout safety net
setTimeout(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    logMessage(`TIMEOUT: Test exceeded maximum duration (${elapsed.toFixed(1)}s)`);
    
    if (packetCount === 0) {
        logMessage('ERROR: No packets received during test');
        process.exit(1);
    }
    
    // Check for packet flow interruption
    const timeSinceLastPacket = (Date.now() - lastPacketTime) / 1000;
    if (timeSinceLastPacket > 10) {
        logMessage(`ERROR: No packets received for ${timeSinceLastPacket.toFixed(1)}s`);
        process.exit(1);
    }
    
    ws.close();
    process.exit(0);
}, testDuration + 10000); // Add 10s buffer
