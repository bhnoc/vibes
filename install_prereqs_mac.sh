#!/bin/zsh

# VIBES Network Visualizer Prerequisites Installer (macOS)
# =======================================================
# This script installs all required dependencies for the VIBES project on macOS
# - Go 1.21+
# - Node.js 16+
# - libpcap development libraries
# - And more...
# Requires: macOS (Darwin). Uses Homebrew for most packages.

set -o pipefail
set -o nounset
set -o errexit

######################################################################
export PATH=$PATH:/usr/local/bin
######################################################################
# Source dependency versions
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "${SCRIPT_DIR}/requirements.conf" ]; then
  source "${SCRIPT_DIR}/requirements.conf"
else
  echo "Error: requirements.conf not found. Run this script from the vibes directory or ensure requirements.conf exists."
  exit 1
fi
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

# Check we're on macOS
if [[ "$(uname -s)" != "Darwin" ]]; then
  print_error "This script is for macOS only. Use install_prereqs.sh for WSL/Linux."
  exit 1
fi

# Check if script is run as root
if [ "$EUID" -eq 0 ]; then
  print_error "Please don't run this script as root/sudo"
  exit 1
fi

# Detect architecture for Go tarball (arm64 = Apple Silicon, amd64 = Intel)
ARCH=$(uname -m)
if [[ "$ARCH" == "arm64" ]]; then
  GO_ARCH="darwin-arm64"
else
  GO_ARCH="darwin-amd64"
fi

# Shell profile for PATH (prefer zsh on modern macOS)
if [ -n "${ZSH_VERSION:-}" ] || [ -f "$HOME/.zshrc" ]; then
  PROFILE="$HOME/.zshrc"
else
  PROFILE="$HOME/.bash_profile"
fi

# Ensure Homebrew is installed
print_header "Checking Homebrew"
if ! command -v brew &> /dev/null; then
  print_step "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Add Homebrew to PATH for this session (Apple Silicon: /opt/homebrew, Intel: /usr/local)
  if [[ -f /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
    export PATH="/opt/homebrew/bin:$PATH"
  fi
  print_step "Homebrew installed"
else
  print_step "Homebrew is already installed"
  # Ensure brew is on PATH (in case we're in a fresh terminal)
  if [[ -f /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null || true
  fi
fi

# Install basic build tools
print_header "Installing basic build tools"
brew install curl wget git unzip

# Install Xcode Command Line Tools if needed (for compilers)
if ! xcode-select -p &> /dev/null; then
  print_step "Installing Xcode Command Line Tools (required for compilation)..."
  xcode-select --install
  print_warning "Please complete the Xcode CLT installer, then re-run this script."
  exit 0
fi

# Install Go
print_header "Installing Go $GO_VER"
if command -v go &> /dev/null; then
  GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
  print_step "Go $GO_VERSION is already installed"
  if [[ "$(echo -e "${GO_VERSION}\n${GO_VER}" | sort -V | head -n 1)" != "$GO_VER" ]]; then
    print_warning "Your Go version is older than $GO_VER. Attempting upgrade..."
    print_step "Downloading Go $GO_VER for $GO_ARCH..."
    curl -fsSL -o "/tmp/go${GO_VER}.${GO_ARCH}.tar.gz" "https://go.dev/dl/go${GO_VER}.${GO_ARCH}.tar.gz"
    print_step "Removing old Go installation..."
    sudo rm -rf /usr/local/go
    print_step "Installing Go $GO_VER..."
    sudo tar -C /usr/local -xzf "/tmp/go${GO_VER}.${GO_ARCH}.tar.gz"
    if ! grep -q 'export PATH=$PATH:/usr/local/go/bin' "$PROFILE" 2>/dev/null; then
      echo 'export PATH=$PATH:/usr/local/go/bin' >> "$PROFILE"
    fi
    export PATH=$PATH:/usr/local/go/bin
    print_step "Go upgrade complete"
  fi
else
  print_step "Downloading Go $GO_VER for $GO_ARCH..."
  curl -fsSL -o "/tmp/go${GO_VER}.${GO_ARCH}.tar.gz" "https://go.dev/dl/go${GO_VER}.${GO_ARCH}.tar.gz"
  print_step "Installing Go..."
  sudo tar -C /usr/local -xzf "/tmp/go${GO_VER}.${GO_ARCH}.tar.gz"
  if ! grep -q 'export PATH=$PATH:/usr/local/go/bin' "$PROFILE" 2>/dev/null; then
    echo 'export PATH=$PATH:/usr/local/go/bin' >> "$PROFILE"
  fi
  export PATH=$PATH:/usr/local/go/bin
  print_step "Go installation complete"
fi

# Install Node.js and npm (use Homebrew; LTS is usually 18 or 20)
print_header "Installing Node.js and npm"
if command -v node &> /dev/null; then
  NODE_VERSION=$(node -v)
  print_step "Node.js $NODE_VERSION is already installed"
  NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1 | tr -d 'v')
  if [[ $NODE_MAJOR -lt $NODE_VER ]]; then
    print_warning "Node.js $NODE_VER+ is recommended. Upgrading via Homebrew..."
    brew upgrade node
  fi
else
  print_step "Installing Node.js via Homebrew..."
  brew install node
  print_step "Node.js installation complete"
fi

# Install libpcap for packet capture
print_header "Installing libpcap development libraries"
brew install libpcap

# Run remaining setup from the vibes directory (frontend/backend)
cd "$SCRIPT_DIR"

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
go get github.com/gorilla/websocket@v${WEBSOCKET_VER} || \
  GOPROXY=https://proxy.golang.org,direct go get github.com/gorilla/websocket@v${WEBSOCKET_VER} || \
  echo "Warning: Could not install gorilla/websocket. You may need to install it manually."
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

# Completion
print_header "VIBES Network Visualizer prerequisites installation completed!"
print_step "You may need to restart your terminal or run: source $PROFILE"
print_step "To start the frontend: cd frontend && npm run dev"
print_step "To start the backend: cd backend/cmd && go run main.go"
print_warning "Note: you may need to run the backend with sudo for packet capture: sudo -E go run backend/cmd/main.go"
print_header "Ready to build the sickest network visualizer ever! 🚀"
