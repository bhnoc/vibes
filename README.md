# VIBES - Network Visualization Tool

A next-generation network visualization tool with retro-inspired aesthetics. Watch network traffic flow in real-time with stylized neon particles and node representations.

## Features

- Real-time network map with device nodes and connections
- Packet tracing with animated flow lines
- Dynamically scaled hosts based on traffic volume
- Time-travel mode (rewind/fast-forward traffic visualization)
- Device metadata on hover
- Filtering by protocol, device type, or IP range
- Dark mode with CRT-inspired themes

## Tech Stack

### Backend
- **Language:** Go
- **Real-Time Communication:** WebSockets (Gorilla)
- **Packet Capture:** libpcap, tshark, or custom ingestors

### Frontend
- **Framework:** React
- **Rendering Engine:** PixiJS (@pixi/react)
- **State Management:** Zustand
- **Styling:** TailwindCSS
- **Visual Enhancements:** CRT shaders, glow effects, animated trails

## Project Structure

```
/
├── backend/           # Go backend code
│   ├── cmd/           # Application entry points
│   ├── internal/      # Private application code
│   └── pkg/           # Public libraries
└── frontend/          # React frontend code
    ├── public/        # Static assets
    └── src/           # Source code
        ├── components/  # React components
        ├── hooks/       # Custom React hooks
        └── utils/       # Utility functions
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

If you encounter any issues, check the `TROUBLESHOOTING.md` file for solutions.

## Quick Start (WSL/Linux)

If you're using WSL or Linux:

1. Navigate to the project directory
2. Run: `chmod +x install_prereqs.sh`
3. Run: `./install_prereqs.sh`
4. Follow the on-screen prompts

## Manual Setup

### Prerequisites
- Node.js v16+
- Go 1.19+
- libpcap development libraries (for packet capture on Linux/macOS)
- Npcap (for packet capture on Windows)

### Backend Setup
```bash
cd backend
go mod init github.com/yourusername/vibes
go get -u github.com/gorilla/websocket
go get -u github.com/google/gopacket
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

## License

MIT 