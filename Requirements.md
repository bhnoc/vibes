# VIBES Network Visualizer - Development Requirements

This document tracks development requirements and their implementation status for the VIBES network visualization project.

## Overview

VIBES is a next-generation network visualization tool with retro-inspired aesthetics that displays real-time network traffic flow with stylized neon particles and node representations.

## Status Legend
- 🔴 **Not Started** - Requirement not yet implemented
- 🟡 **In Progress** - Currently being worked on
- 🟢 **Completed** - Requirement fully implemented
- 🔵 **Blocked** - Waiting on dependencies or external factors
- ⚪ **Cancelled** - Requirement removed from scope

---

## Frontend Requirements

### Performance & Rendering Issues

#### FR-001: Node Position Stability
- **Status**: 🟡 In Progress
- **Priority**: High
- **Description**: When lots of nodes are being rendered, they will randomly show up extremely far apart and be moving at incredible speeds which looks very glitchy.
- **Technical Details**: 
  - Nodes should have position constraints/bounds
  - Velocity should be capped to prevent extreme speeds
  - Initial positioning should be more controlled
  - Nodes should always stay within the maximum view area
- **Acceptance Criteria**:
  - [x] Nodes stay within reasonable viewport bounds
  - [x] Maximum velocity cap implemented
  - [x] Smooth initial positioning for new nodes
  - [x] No more "teleporting" or extreme speed behaviors

#### FR-002: Communication Node Stability
- **Status**: 🔴 Not Started
- **Priority**: High
- **Description**: Nodes that are continually communicating keep bouncing close and away from each other in a very jerky way which makes it annoying to look at.
- **Technical Details**:
  - Implement smoother physics dampening
  - Add connection strength/stability based on communication frequency
  - Consider using spring-damper physics model
- **Acceptance Criteria**:
  - [ ] Nodes with frequent communication maintain stable relative positions
  - [ ] Reduced "bouncing" behavior between connected nodes
  - [ ] Smooth animation transitions
  - [ ] Configurable physics parameters for fine-tuning

### User Interface Enhancements

#### FR-003: Dynamic IP Label Sizing
- **Status**: 🔴 Not Started
- **Priority**: Medium
- **Description**: The IP address label lists the full IP address at more zoomed out levels. There should be a slider controller under "System" debug menu to adjust the IP label size.
- **Technical Details**:
  - Add zoom-aware label sizing
  - Implement IP address truncation (e.g., 192.168.1.100 → 192.168.*.100 → *.*.*.100)
  - Add slider control in System menu
- **Acceptance Criteria**:
  - [ ] IP labels automatically scale with zoom level
  - [ ] Slider control in System menu for manual adjustment
  - [ ] Smart IP truncation based on zoom/settings
  - [ ] Labels remain readable at all zoom levels

#### FR-004: Port Number Display
- **Status**: 🔴 Not Started
- **Priority**: Medium
- **Description**: The port number should be easily to see in the visualization. 
- **Dependencies**: BR-001 (Backend port data)
- **Technical Details**:
  - The port number should be shown in the middle of the connection between the 2 nodes. 
  - Consider best place to show the port number based on what we are trying to achieve. 
  - May need different display modes based on zoom level
- **Acceptance Criteria**:
  - [ ] Port numbers displayed with node and IP addresses
  - [ ] Readable formatting that doesn't clutter the display
  - [ ] Configurable display format options
  - [ ] Performance optimized for many nodes with port labels

#### FR-005: Command and Search Bar
- **Status**: 🔴 Not Started
- **Priority**: High
- **Description**: A command and search bar should exist on the bottom next to the "connected" notification. The command and search bar should allow a user to interact with the application.
- **Technical Details**:
  - Position: Bottom of screen, next to connection status
  - Initial functionality: Pin IP addresses
  - Extensible command system for future features
  - Consider using 'slash' for commands ie: /pin 
- **Acceptance Criteria**:
  - [ ] Command bar UI implemented at bottom of screen
  - [ ] Search functionality with autocomplete
  - [ ] Command parsing system
  - [ ] Pin IP address command implemented

#### FR-006: IP Address Pinning
- **Status**: 🔴 Not Started
- **Priority**: High
- **Description**: Initially a user should be able to pin an IP address so that a node matching the pinned IP stays on the screen. User's can pin nodes that are based on a port as well. 
- **Dependencies**: FR-005 (Command bar)
- **Technical Details**:
  - Pinned nodes should have visual indication (different border highlight)
  - Pinned nodes should resist physics forces or stay within the watch positions
  - Command syntax: `/pin 192.168.1.100` or `/pin port:443`
- **Acceptance Criteria**:
  - [ ] Pin command functionality in command bar
  - [ ] Visual indication for pinned nodes
  - [ ] Pinned nodes remain visible and stable
  - [ ] Unpin functionality
  - [ ] List of currently pinned IPs

### Security & Threat Visualization

#### FR-007: Threat Visualization
- **Status**: 🔴 Not Started
- **Priority**: High
- **Description**: On the front end, there needs to be a way to visualize threats and potential threats easily.
- **Dependencies**: BR-005 (Backend threat detection)
- **Technical Details**:
  - Color-coded threat level indicators (green/yellow/orange/red)
  - Threat severity visual representations (pulsing, borders, glow effects)
  - Threat particle effects for active threats
  - Integration with existing node rendering system
- **Acceptance Criteria**:
  - [ ] Color-coded threat level visualization
  - [ ] Threat severity indicators on nodes
  - [ ] Visual effects for active threats
  - [ ] Legend/key for threat visualization
  - [ ] Performance optimized for many threat indicators
  - [ ] Real-time threat status updates

#### FR-008: Threat Dashboard and Alerts
- **Status**: 🔴 Not Started
- **Priority**: Medium
- **Description**: Comprehensive threat monitoring dashboard with alert system for security personnel.
- **Dependencies**: FR-007 (Threat visualization), BR-005 (Backend threat detection)
- **Technical Details**:
  - Threat summary panel showing current threat levels
  - Real-time threat alerts with severity levels
  - Threat history and timeline
  - Filterable threat log
  - Audio/visual alert system for critical threats
- **Acceptance Criteria**:
  - [ ] Threat summary dashboard panel
  - [ ] Real-time threat alert notifications
  - [ ] Threat history and timeline view
  - [ ] Filterable and searchable threat log
  - [ ] Audio alerts for critical threats
  - [ ] Threat statistics and metrics
  - [ ] Export threat data functionality

---

## Backend Requirements

### Data Enhancement

#### BR-001: Port Number Data
- **Status**: 🔴 Not Started
- **Priority**: High
- **Description**: In getting the data, we need to have the port number as part of the data.
- **Technical Details**:
  - Extract source and destination ports from packet data
  - Include port information in WebSocket messages
  - Update packet structure to include port fields
- **Acceptance Criteria**:
  - [ ] Source port extracted from packets
  - [ ] Destination port extracted from packets
  - [ ] Port data included in WebSocket packet messages
  - [ ] TCP, UDP, ICMP and other port extraction
  - [ ] Updated packet JSON structure with port fields

### Data Persistence & Capture

#### BR-002: Network Tap Data Capture
- **Status**: 🔴 Not Started
- **Priority**: High
- **Description**: The server running this software is using a 100gigE network card that is on a tap port from the switch which is mirroring all traffic to this device. All data whether processed or not should be captured to disk.
- **Technical Details**:
  - Raw packet capture to PCAP files or other common usable format
  - Continuous logging with file rotation
  - Configurable storage location and retention policies
- **Acceptance Criteria**:
  - [ ] Raw packet data saved to PCAP files
  - [ ] File rotation based on size/time
  - [ ] Configurable storage location
  - [ ] Retention policy implementation
  - [ ] No packet loss during high-traffic periods

#### BR-003: PCAP Replay Functionality
- **Status**: 🔴 Not Started
- **Priority**: Medium
- **Description**: The backend should be able to be set to open a PCAP file and replay the data in the PCAP.
- **Technical Details**:
  - PCAP file parsing and replay
  - Configurable replay speed (real-time, faster, slower)
  - The playback should be able to skip forward or even support a specific time window from the pcap
  - WebSocket streaming of replayed data
  - Command line option to specify PCAP file
- **Acceptance Criteria**:
  - [ ] PCAP file parsing capability
  - [ ] Replay data through existing WebSocket interface
  - [ ] Configurable replay speed
  - [ ] Command line interface for PCAP selection
  - [ ] Support for large PCAP files

### Layer 2 Support

#### BR-004: Layer 2 Communication Display
- **Status**: 🔴 Not Started
- **Priority**: Medium
- **Description**: Layer 2 only communication should be considered as captured data so that it can be displayed in the frontend.
- **Technical Details**:
  - Capture and process Ethernet frame data
  - Display MAC addresses instead of/alongside IP addresses
  - Handle ARP, spanning tree, and other L2 protocols
- **Acceptance Criteria**:
  - [ ] Ethernet frame parsing
  - [ ] MAC address extraction and display
  - [ ] ARP packet visualization
  - [ ] Layer 2 protocol identification
  - [ ] Toggle between L2 and L3 view modes

### Security & Threat Detection

#### BR-005: Threat Detection and Risk Analysis
- **Status**: 🔴 Not Started
- **Priority**: High
- **Description**: We need to add someway to analyze risk with captured data so that threatening data can be identified on the front end.
- **Technical Details**:
  - Implement real-time threat detection algorithms
  - Risk scoring system for network traffic patterns
  - Anomaly detection for unusual traffic patterns
  - Integration with threat intelligence feeds
  - Configurable threat detection rules
- **Acceptance Criteria**:
  - [ ] Real-time threat analysis of captured packets
  - [ ] Risk scoring algorithm implementation
  - [ ] Anomaly detection for traffic patterns
  - [ ] Threat classification system (low/medium/high/critical)
  - [ ] Configurable threat detection rules
  - [ ] Performance optimization for high-traffic analysis
  - [ ] Threat data included in WebSocket messages

#### BR-006: Threat Intelligence Integration
- **Status**: 🔴 Not Started
- **Priority**: Medium
- **Description**: Integration with external threat intelligence sources to enhance threat detection capabilities.
- **Dependencies**: BR-005 (Threat Detection)
- **Technical Details**:
  - Support for common threat intelligence formats (STIX/TAXII, IOCs)
  - IP/domain reputation checking
  - Known malicious signature detection
  - Automated threat feed updates
- **Acceptance Criteria**:
  - [ ] External threat intelligence feed integration
  - [ ] IP/domain reputation analysis
  - [ ] Malicious signature detection
  - [ ] Automatic threat feed updates
  - [ ] Configurable threat intelligence sources

---

## Implementation Priority

### Phase 1 (Critical Stability)
1. **FR-001**: Node Position Stability
2. **FR-002**: Communication Node Stability  
3. **BR-001**: Port Number Data

### Phase 2 (Core Features)
4. **FR-005**: Command and Search Bar
5. **FR-006**: IP Address Pinning
6. **BR-002**: Network Tap Data Capture
7. **BR-005**: Threat Detection and Risk Analysis

### Phase 3 (Enhanced Features)  
8. **FR-003**: Dynamic IP Label Sizing
9. **FR-004**: Port Number Display
10. **FR-007**: Threat Visualization
11. **BR-003**: PCAP Replay Functionality

### Phase 4 (Advanced Features)
12. **FR-008**: Threat Dashboard and Alerts  
13. **BR-004**: Layer 2 Communication Display
14. **BR-006**: Threat Intelligence Integration

---

## Notes

- Requirements may be updated based on testing and user feedback
- Some requirements may have dependencies that affect implementation order
- Performance testing should be conducted after each major requirement implementation
- All changes should maintain the retro cyberpunk aesthetic and 60+ FPS performance standards

## Change Log

| Date | Requirement ID | Change | Author |
|------|---------------|---------|---------|
| 2025-01-28 | Initial | Created requirements document | Development Team |
| 2025-01-28 | BR-005, BR-006, FR-007, FR-008 | Added threat detection and risk analysis requirements | Development Team |
| 2025-01-28 | FR-001 | Implemented node position stability with velocity caps, bounds enforcement, and controlled initial positioning | Development Team |

---

*This document should be updated as requirements are implemented, modified, or new requirements are identified.*