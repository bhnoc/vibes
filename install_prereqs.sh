#!/bin/bash

# VIBES Network Visualizer Prerequisites Installer
# ====================================
# This script installs all required dependencies for the VIBES project
# Supports Ubuntu and Debian (all versions)
# - Go (version specified in requirements.conf)
# - Node.js (version specified in requirements.conf)
# - libpcap development libraries
# - And more...

set -o pipefail # If using pipe in commands, fail for any non-exit 0
set -o nounset # Error on unset variables
set -o errexit # Exit immediately if a command exits with a non-zero status

######################################################################
export PATH=$PATH:/usr/local/bin
######################################################################
#Source all dependancy versions:
source requirements.conf
######################################################################

######################################################################
export FE_NAME="vibes-network-visualizer"
export FE_PRIVATE=true
export FE_VERSION="0.1.0"
######################################################################

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

# Detect distro and version
DISTRO_ID=""
DISTRO_VERSION=""
if [ -f /etc/os-release ]; then
  . /etc/os-release
  DISTRO_ID="$ID"
  DISTRO_VERSION="${VERSION_ID:-}"
  print_step "Detected distro: $DISTRO_ID ${DISTRO_VERSION:-unknown version}"
fi

# Check if script is run as root
if [ "$EUID" -eq 0 ]; then
  print_error "Please don't run this script as root/sudo"
  exit 1
fi

# Basic system setup
print_header "Updating and upgrading system packages"
sudo apt-get update
sudo apt-get upgrade -y
sudo apt-get dist-upgrade -y
sudo apt-get autoremove -y

print_header "Installing basic build tools"
sudo apt-get install -y build-essential curl wget git unzip bc

# Detect system architecture
ARCH=$(uname -m)
case $ARCH in
  x86_64) GO_ARCH="amd64" ;;
  aarch64) GO_ARCH="arm64" ;;
  armv7l) GO_ARCH="armv6l" ;;
  *) print_error "Unsupported architecture: $ARCH"; exit 1 ;;
esac
print_step "Detected architecture: $ARCH (Go: $GO_ARCH)"

install_go() {
  print_step "Downloading Go $GO_VER..."
  wget -O /tmp/go${GO_VER}.linux-${GO_ARCH}.tar.gz https://golang.org/dl/go${GO_VER}.linux-${GO_ARCH}.tar.gz
  print_step "Removing old Go installation (if any)..."
  sudo rm -rf /usr/local/go
  print_step "Installing Go $GO_VER..."
  sudo tar -C /usr/local -xzf /tmp/go${GO_VER}.linux-${GO_ARCH}.tar.gz
  rm /tmp/go${GO_VER}.linux-${GO_ARCH}.tar.gz

  # Add Go to PATH if not already there
  if ! grep -q "export PATH=\$PATH:/usr/local/go/bin" ~/.profile; then
    echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.profile
  fi

  # Also add to current session
  export PATH=$PATH:/usr/local/go/bin
}

# Install Go
print_header "Installing Go $GO_VER"
if command -v go &> /dev/null; then
  GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
  print_step "Go $GO_VERSION is already installed"

  # Compare versions - upgrade if current version is older than target
  if [[ "$(echo -e "$GO_VERSION\n$GO_VER" | sort -V | head -n 1)" != "$GO_VER" ]]; then
    print_warning "Your Go version ($GO_VERSION) is older than target $GO_VER. Upgrading..."
    install_go
    print_step "Go upgrade complete"
  elif [[ "$GO_VERSION" == "$GO_VER" ]]; then
    print_step "Go is already at target version $GO_VER"
  else
    print_step "Go $GO_VERSION is newer than target $GO_VER - keeping current version"
  fi
else
  print_step "Go not found, installing version $GO_VER..."
  install_go
  print_step "Go installation complete"
fi

# Install Node.js and npm
print_header "Installing Node.js and npm"

# Check if we need the modern apt keyring method (Ubuntu 22.04+, Debian 12+)
needs_modern_apt_keyring() {
  case "$DISTRO_ID" in
    ubuntu)
      if [[ -n "$DISTRO_VERSION" ]] && [[ "${DISTRO_VERSION%%.*}" -ge 22 ]]; then
        return 0
      fi
      ;;
    debian)
      if [[ -n "$DISTRO_VERSION" ]] && [[ "${DISTRO_VERSION%%.*}" -ge 12 ]]; then
        return 0
      fi
      ;;
  esac
  return 1
}

install_nodejs() {
  # For modern Ubuntu/Debian, use the new nodesource approach with signed-by
  if needs_modern_apt_keyring; then
    print_step "Using modern Node.js installation method (signed-by keyring)"
    sudo apt-get install -y ca-certificates curl gnupg
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_VER}.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
    sudo apt-get update
    sudo apt-get install -y nodejs
  else
    print_step "Setting up Node.js repository..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VER}.x | sudo -E bash -
    print_step "Installing Node.js..."
    sudo apt-get install -y nodejs
  fi
}

if command -v node &> /dev/null; then
  NODE_VERSION=$(node -v)
  NODE_MAJOR=$(echo $NODE_VERSION | cut -d. -f1 | tr -d 'v')
  print_step "Node.js $NODE_VERSION is already installed"

  # Check if Node.js version matches target version
  if [[ $NODE_MAJOR -lt $NODE_VER ]]; then
    print_warning "Your Node.js version ($NODE_VERSION) is older than target version $NODE_VER."
    print_step "Upgrading Node.js to version $NODE_VER..."
    install_nodejs
  elif [[ $NODE_MAJOR -gt $NODE_VER ]]; then
    print_step "Node.js $NODE_VERSION is newer than target $NODE_VER - keeping current version"
  else
    print_step "Node.js is already at target version $NODE_VER"
  fi
else
  print_step "Node.js not found, installing version $NODE_VER..."
  install_nodejs
  print_step "Node.js installation complete"
fi

# Update npm to latest compatible version
print_step "Updating npm to latest compatible version..."
NODE_MAJOR_VER=$(node -v | cut -d. -f1 | tr -d 'v')
if [[ $NODE_MAJOR_VER -ge 20 ]]; then
  sudo npm install -g npm@latest
elif [[ $NODE_MAJOR_VER -ge 18 ]]; then
  sudo npm install -g npm@10
else
  # For Node 16 and older, npm 9 is the latest compatible
  sudo npm install -g npm@9
fi

# Install dumpcap for high-performance packet capture
print_header "Installing dumpcap (Wireshark packet capture tool)"
if command -v dumpcap &> /dev/null; then
  print_step "dumpcap is already installed: $(which dumpcap)"
else
  print_step "Installing wireshark-common (provides dumpcap)..."
  # Pre-configure wireshark to allow non-root capture (will prompt if interactive)
  echo "wireshark-common wireshark-common/install-setuid boolean true" | sudo debconf-set-selections
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y wireshark-common

  # Add current user to wireshark group for non-root capture
  if [ -n "$SUDO_USER" ]; then
    sudo usermod -aG wireshark "$SUDO_USER"
    print_step "Added $SUDO_USER to wireshark group (logout/login required for non-sudo capture)"
  fi

  # Verify installation
  if command -v dumpcap &> /dev/null; then
    print_step "dumpcap installed successfully: $(dumpcap --version | head -1)"
  else
    print_error "dumpcap installation failed!"
    exit 1
  fi
fi

# Install libpcap for packet capture, addressing dependencies to use latest
print_header "Installing libpcap development libraries and resolving dependencies (aiming for latest)"

# Check for and unhold any potentially conflicting packages first
HELD_PACKAGES=$(apt-mark showhold)
if [ -n "$HELD_PACKAGES" ]; then
  print_warning "Found held packages that might cause dependency issues: $HELD_PACKAGES"
  print_step "Attempting to unhold them to allow for latest versions."
  for pkg in $HELD_PACKAGES; do
    print_step "Unholding $pkg..."
    sudo apt-mark unhold "$pkg" || true # Use || true to prevent script from exiting if unhold fails for some reason
  done
  print_step "Held packages unheld. Running apt update and upgrade again."
  sudo apt update
  sudo apt upgrade -y
  sudo apt --fix-broken install -y
fi

# Now attempt to install libpcap-dev and related packages, expecting them to update to compatible latest versions
print_step "Attempting to install or upgrade libpcap-dev and its dependencies."
if ! sudo apt-get install -y libpcap-dev libdbus-1-dev libnl-3-dev libnl-route-3-dev; then
  print_error "Failed to install libpcap-dev and its dependencies even after unholding and upgrading."
  print_error "This might mean that compatible latest versions of the -dev packages are not available in your repositories,"
  print_error "or there are deeper dependency conflicts. You might need to add specific repositories or consider alternative approaches."
  exit 1
fi
print_step "Dependency resolution and libpcap-dev installation complete."

# Install frontend dependencies
print_header "Setting up frontend environment"
print_step "Creating package.json if it doesn't exist"
if [ ! -f frontend/package.json ]; then
  mkdir -p frontend
  cat > frontend/package.json << EOF
{
  "name": "${FE_NAME}",
  "private": ${FE_PRIVATE},
  "version": "${FE_VERSION}",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@pixi/react": "latest",
    "pixi.js": "latest",
    "react": "^${REACT_VER}",
    "react-dom": "^${REACT_VER}",
    "zustand": "^${ZUSTAND_VER}"
  },
  "devDependencies": {
    "@types/react": "^${TYPES_REACT_VER}",
    "@types/react-dom": "^${TYPES_REACTDOM_VER}",
    "@vitejs/plugin-react": "^${VITEJS_REACT_VER}",
    "autoprefixer": "^${AUTOPREFIXER_VER}",
    "postcss": "^${POSTCSS_VER}",
    "tailwindcss": "^${TAILWINDCSS_VER}",
    "typescript": "^${TYPESCRIPT_VER}",
    "vite": "^${VITE_VER}",
    "vite-tsconfig-paths": "^${VITETS_VER}"
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

go $GO_RUN

require (
        github.com/gorilla/websocket v${WEBSOCKET_VER}
        github.com/google/gopacket v${GOPACKET_VER}
)
EOF
  print_step "Created go.mod"
fi

print_step "Installing Go dependencies"
cd backend
go mod tidy

# Try installing websocket package with fallback to GOPROXY
go get github.com/gorilla/websocket@v${WEBSOCKET_VER} || \
GOPROXY=https://proxy.golang.org,direct go install github.com/gorilla/websocket@v${WEBSOCKET_VER} || \
echo "Warning: Could not install gorilla/websocket package. You may need to install it manually."
go get github.com/google/gopacket@v${GOPACKET_VER}
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