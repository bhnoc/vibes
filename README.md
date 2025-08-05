# VIBES - Network Visualization Tool

Visual Interface for Browsing Entities and Structures (VIBES). This next-generation network visualization tool is imbued with retro-inspired aesthetics. Watch network traffic flow in real-time with stylized neon particles and node representations.

## Example

![Preview of VIBES](PREVIEW.gif)


## Features

### Network Visualization
- Real-time network map with device nodes and connections
- Multiple rendering engines for different performance needs
- Dynamically scaled hosts based on traffic volume
- Animated packet flow visualization with protocol-specific coloring
- Viewport panning and zooming for large networks
- Device metadata display and interaction

### Traffic Analysis
- **Real Packet Capture**: Live capture from network interfaces (TCP, UDP, ICMP)
- **Simulated Traffic**: Configurable traffic generation for testing and demos
- Protocol-specific visualization and filtering
- Traffic volume-based node sizing and connection highlighting
- Real-time performance statistics

### Performance & Debugging
- Object pooling for high-performance rendering (1000s of objects at 60fps)
- Comprehensive debug panels with performance metrics
- WebSocket connection monitoring and diagnostics
- Simulation testing framework with automated scenarios
- FPS monitoring and viewport optimization

### User Interface
- Dark mode with retro-inspired CRT aesthetics
- Configurable physics simulation parameters
- Renderer selection (Canvas, PixiJS variants, Minimal DOM)
- Real-time settings adjustment
- Cross-platform support (Windows, Linux, WSL)

## Tech Stack

### Backend
- **Language:** Go 1.21
- **Real-Time Communication:** WebSockets (Gorilla WebSocket v1.5.3)
- **Packet Capture:** Real packet capture (gopacket v1.1.19) and comprehensive simulated traffic generation
- **PCAP Replay:** Full support for replaying captured traffic from PCAP files at variable speeds.
- **Network Processing:** Support for TCP, UDP, ICMP, and other protocols
- **Testing:** Comprehensive simulation testing framework with automated scenarios

### Frontend
- **Framework:** React with TypeScript and Vite
- **Rendering Engines:** Currently implemented:
  - **Canvas Renderer** (Recommended) - High-performance Canvas-based rendering for 1000s of objects at 60fps
  - **Minimal DOM** - Lightweight DOM renderer for smaller networks (<100 objects)
- **State Management:** Zustand v4.1.1
- **Styling:** TailwindCSS v3.1.8
- **Additional Libraries:** React Icons, Lodash, Pixi.js
- **Performance:** Object pooling, viewport optimization, and 60fps animation loops
- **Development Tools:** Comprehensive debugging panels and performance monitoring

## Project Structure

```
/
├── backend/              # Go backend code
│   ├── cmd/              # Application entry points (main.go)
│   ├── internal/         # Private application code
│   │   └── capture/      # Packet capture implementations (packet.go)
│   ├── go.mod & go.sum   # Go module definitions
│   ├── test_simulation.sh # Automated simulation testing script
│   ├── check_timestamps.sh # Testing utilities
│   └── SIMULATION_TESTING.md # Comprehensive testing documentation
├── frontend/             # React frontend code
│   ├── public/           # Static assets
│   ├── src/              # Source code
│   │   ├── components/   # React components (renderers, debug panels)
│   │   ├── stores/       # Zustand state management
│   │   ├── hooks/        # Custom React hooks
│   │   ├── types/        # TypeScript type definitions
│   │   ├── utils/        # Utility functions
│   │   └── styles/       # Additional styling
│   ├── package.json      # Frontend dependencies
│   ├── vite.config.ts    # Vite build configuration
│   ├── tailwind.config.cjs # TailwindCSS configuration
│   └── tsconfig.json     # TypeScript configuration
├── install_prereqs.ps1  # Windows installation script
├── install_prereqs.sh   # Linux/WSL installation script
├── install_wsl_prereqs.bat # WSL setup script
├── PROJECT.md           # Temporary project guidance
├── TROUBLESHOOTING.md   # Common issues and solutions
└── CURSOR_RULES.md      # Development guidelines and design philosophy
```

## Quick Start (Windows)

The easiest way to get started on Windows is by using our automated installation script:

1. Open PowerShell as Administrator
2. Navigate to the project directory
3. Run: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`
4. Run: `.\install_prereqs.ps1`
5. Follow the on-screen prompts
6. Once installation is complete, you can start the application

For Windows users, packet capture requires Npcap which will be installed by the script.

If you encounter any issues, check the [TROUBLESHOOTING.md](TROUBLESHOOTING.md) file for solutions.

## Quick Start (WSL/Linux)

If you're using WSL or Linux:

1. Navigate to the project directory
2. Run: `chmod +x install_prereqs.sh`
3. Run: `./install_prereqs.sh`
4. Follow the on-screen prompts

## Manual Setup

### Prerequisites
- Node.js v16+
- Go 1.21+
- libpcap development libraries (for packet capture on Linux/macOS)
- Npcap (for packet capture on Windows)

### Backend Setup
```bash
cd backend
# Dependencies are already defined in go.mod
go mod tidy
go mod download
```

### Frontend Setup
```bash
cd frontend
npm install
```

## Development

### Running the Backend
```bash
cd backend/cmd
go run main.go
```

For packet capture functionality on Linux/macOS (requires sudo):
```bash
sudo -E $(which go) run backend/cmd/main.go
```

For packet capture functionality on Windows:
```bash
# Run PowerShell or Command Prompt as Administrator
cd backend/cmd
go run main.go
```

### Running the Frontend
```bash
cd frontend
npm run dev
```

## Design Philosophy

This project follows a "retro cyberpunk" aesthetic - think Tron, Hackers, and 80s sci-fi computer interfaces with modern performance.

- **Performance** (60+ FPS, zero lag)
- **Personality** (retro, cinematic, terminal-chic)
- **Precision** (tight, scalable codebase)
- **Play** (have fun—you're building art, not just software)

See the `CURSOR_RULES.md` file for our detailed design philosophy and coding guidelines.

## Background 

Originally inspired by OrganicIP ([OIP](https://github.com/USU-Security/oip)), a visualizer which uses libpcap and Simple DirectMedia Layer (SDL) to visualize IP traffic between endpoints.

## License

MIT 
