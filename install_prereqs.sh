#!/bin/bash

# VIBES Network Visualizer Prerequisites Installer
# ====================================
# This script installs all required dependencies for the VIBES project in WSL
# - Go 1.19+
# - Node.js 16+
# - libpcap development libraries
# - And more...

set -e # Exit immediately if a command exits with a non-zero status

# Print styled messages
print_header() {
  echo -e "\n\e[1;36m==>\e[0m \e[1;37m$1\e[0m"
}

print_step() {
  echo -e "  \e[1;32m->\e[0m \e[1;37m$1\e[0m"
}

print_warning() {
  echo -e "  \e[1;33m!\e[0m \e[1;37m$1\e[0m"
}

print_error() {
  echo -e "  \e[1;31mX\e[0m \e[1;37m$1\e[0m"
}

# Check if we're running in WSL
if [[ "$(uname -r)" != *WSL* ]] && [[ "$(uname -r)" != *Microsoft* ]]; then
  print_warning "This doesn't appear to be WSL. The script might not work correctly."
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Check if script is run as root
if [ "$EUID" -eq 0 ]; then
  print_error "Please don't run this script as root/sudo"
  exit 1
fi

# Basic system setup
print_header "Updating system package information"
sudo apt-get update

print_header "Installing basic build tools"
sudo apt-get install -y build-essential curl wget git unzip

# Install Go
print_header "Installing Go 1.19"
if command -v go &> /dev/null; then
  GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
  print_step "Go $GO_VERSION is already installed"
  
  # Compare versions (basic check)
  if [[ "$(echo -e "$GO_VERSION\n1.19" | sort -V | head -n 1)" != "1.19" ]]; then
    print_warning "Your Go version might be too old. Version 1.19+ is recommended."
    print_step "Proceeding with existing installation..."
  fi
else
  print_step "Downloading Go 1.19..."
  wget -O /tmp/go1.19.linux-amd64.tar.gz https://golang.org/dl/go1.19.linux-amd64.tar.gz
  
  print_step "Installing Go..."
  sudo tar -C /usr/local -xzf /tmp/go1.19.linux-amd64.tar.gz
  
  # Add Go to PATH if not already there
  if ! grep -q "export PATH=\$PATH:/usr/local/go/bin" ~/.profile; then
    echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.profile
  fi
  
  # Also add to current session
  export PATH=$PATH:/usr/local/go/bin
  print_step "Go installation complete"
fi

# Install Node.js and npm
print_header "Installing Node.js and npm"
if command -v node &> /dev/null; then
  NODE_VERSION=$(node -v)
  print_step "Node.js $NODE_VERSION is already installed"
  
  # Check if Node.js version is at least 16
  NODE_MAJOR=$(echo $NODE_VERSION | cut -d. -f1 | tr -d 'v')
  if [[ $NODE_MAJOR -lt 16 ]]; then
    print_warning "Your Node.js version is too old. Version 16+ is required."
    print_step "Upgrading Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
else
  print_step "Setting up Node.js repository..."
  curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
  
  print_step "Installing Node.js..."
  sudo apt-get install -y nodejs
  print_step "Node.js installation complete"
fi

# Install libpcap for packet capture
print_header "Installing libpcap development libraries"
sudo apt-get install -y libpcap-dev

# Install frontend dependencies
print_header "Setting up frontend environment"
print_step "Creating package.json if it doesn't exist"
if [ ! -f frontend/package.json ]; then
  mkdir -p frontend
  cat > frontend/package.json << EOF
{
  "name": "vibes-network-visualizer",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@pixi/react": "latest",
    "pixi.js": "latest",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.1.1"
  },
  "devDependencies": {
    "@types/react": "^18.0.17",
    "@types/react-dom": "^18.0.6",
    "@vitejs/plugin-react": "^2.1.0",
    "autoprefixer": "^10.4.12",
    "postcss": "^8.4.16",
    "tailwindcss": "^3.1.8",
    "typescript": "^4.6.4",
    "vite": "^3.1.0",
    "vite-tsconfig-paths": "^3.5.0"
  }
}
EOF
  print_step "Created package.json"
fi

# Install backend dependencies
print_header "Setting up backend environment"
print_step "Creating go.mod if it doesn't exist"
if [ ! -f backend/go.mod ]; then
  mkdir -p backend
  cat > backend/go.mod << EOF
module github.com/vibes-network-visualizer

go 1.19

require (
	github.com/gorilla/websocket v1.5.0
)
EOF
  print_step "Created go.mod"
fi

print_step "Installing Go dependencies"
cd backend
go get -u github.com/gorilla/websocket
go get -u github.com/google/gopacket
cd ..

print_step "Installing frontend dependencies"
cd frontend
npm install
cd ..

# Setup the project for first-time use
print_header "Setting up project for first-time use"

print_step "Creating database directory"
mkdir -p data

print_step "Creating log directory"
mkdir -p logs

# Print completion message
print_header "VIBES Network Visualizer prerequisites installation completed!"
print_step "You may need to restart your terminal or run 'source ~/.profile' to use Go"
print_step "To start the frontend: cd frontend && npm run dev"
print_step "To start the backend: cd backend/cmd && go run main.go"

print_warning "Note: you'll need to run the backend with sudo for packet capture capabilities"
print_warning "      Example: sudo -E $(which go) run backend/cmd/main.go"

print_header "Ready to build the sickest network visualizer ever! 🚀" 
