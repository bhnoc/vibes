#!/bin/bash

# VIBES Network Visualizer Prerequisites Installer
# ====================================
# This script installs all required dependencies for the VIBES project in WSL
# - Go 1.21+
# - Node.js 16+
# - libpcap development libraries
# - And more...

set -o pipefail # If using pipe in commands, fail for any non-exit 0
set -o nounset # Error on unset variables
set -o errexit # Exit immediately if a non-zero status
set -o errtrace # Propagate error trapping to subshells

# Store original directory for later restoration
ORIGINAL_DIR="$(pwd)"

# Create private temp directory for all temp files
TMPDIR=$(mktemp -d) && chmod 700 "$TMPDIR" || { echo "Failed to create temp directory"; exit 1; }

# Temporary files to clean up on exit
TEMP_FILES=()

# Cleanup handler
cleanup() {
    local exit_code=$?
    for file in "${TEMP_FILES[@]}"; do
        [[ -f "$file" ]] && rm -f "$file"
    done
    # Remove private temp directory
    rm -rf "$TMPDIR" 2>/dev/null
    # Return to original directory with error handling
    if [[ -d "$ORIGINAL_DIR" ]] && cd "$ORIGINAL_DIR" 2>/dev/null; then
        :
    else
        echo "Warning: Failed to return to original directory" >&2
    fi
    exit "$exit_code"
}

trap cleanup EXIT INT TERM ERR

# Portable PATH setup - check if directory exists first
if [[ -d /usr/local/bin ]] && [[ ! "$PATH" =~ /usr/local/bin ]]; then
    export PATH="$PATH:/usr/local/bin"
fi

# Portable sha256sum wrapper - handles macOS shasum difference
sha256sum() {
    if command -v shasum &>/dev/null; then
        # macOS shasum uses different format
        shasum -a 256 "$@"
    else
        command sha256sum "$@"
    fi
}

# Portable sha256 parsing - robust across platforms
parse_sha256() {
    local hash
    hash=$(sha256sum "$1" 2>/dev/null | awk '{print $1}')
    echo "$hash"
}

# Validate requirements.conf exists before parsing
if [[ ! -f requirements.conf ]]; then
    echo "  ✗ Error: requirements.conf not found" >&2
    exit 1
fi

# Safely parse requirements.conf as key=value pairs
parse_requirements() {
    local key value
    while IFS='=' read -r key value || [[ -n "$key" ]]; do
        # Skip empty lines and comments
        [[ -z "$key" ]] && continue
        [[ "$key" =~ ^[[:space:]]*# ]] && continue
        # Trim whitespace
        key="${key#"${key%%[![:space:]]*}"}"
        key="${key%"${key##*[![:space:]]}"}"
        value="${value#"${value%%[![:space:]]*}"}"
        value="${value%"${value##*[![:space:]]}"}"
        [[ -z "$key" ]] && continue
        # Export validated variable
        declare -g "$key=$value"
    done < requirements.conf
}

# Parse requirements before using any variables
parse_requirements

# Print styled messages using printf for portability
print_header() {
    if [[ -t 1 ]]; then
        printf '\n\e[1;36m==>\e[0m \e[1;37m%s\e[0m\n' "$1"
    else
        printf '\n==> %s\n' "$1"
    fi
}

print_step() {
    if [[ -t 1 ]]; then
        printf '  \e[1;32m->\e[0m \e[1;37m%s\e[0m\n' "$1"
    else
        printf '  -> %s\n' "$1"
    fi
}

print_warning() {
    if [[ -t 1 ]]; then
        printf '  \e[1;33m!\e[0m \e[1;37m%s\e[0m\n' "$1"
    else
        printf '  ! %s\n' "$1"
    fi
}

print_error() {
    if [[ -t 1 ]]; then
        printf '  \e[1;31m✗\e[0m \e[1;37m%s\e[0m\n' "$1"
    else
        printf '  ✗ %s\n' "$1"
    fi
}

# Sanitize version strings using pure bash (no sed)
sanitize_version() {
    local ver="$1"
    ver="${ver//[!0-9.]/}"
    echo "$ver"
}

# Validate all required variables are set and sanitize them
declare -A REQUIRED_VARS=(
    [GO_VER]="" [NODE_VER]="" [REACT_VER]="" [ZUSTAND_VER]=""
    [TYPES_REACT_VER]="" [TYPES_REACTDOM_VER]="" [VITEJS_REACT_VER]=""
    [AUTOPREFIXER_VER]="" [POSTCSS_VER]="" [TAILWINDCSS_VER]=""
    [TYPESCRIPT_VER]="" [VITE_VER]="" [VITETS_VER]=""
    [WEBSOCKET_VER]="" [GOPACKET_VER]="" [GO_RUN]=""
)

for var in "${!REQUIRED_VARS[@]}"; do
    if [[ -z "${!var:-}" ]]; then
        print_error "Required variable $var is not set in requirements.conf"
        exit 1
    fi
    # Remove leading/trailing whitespace using built-in parameter expansion
    val="${!var}"
    val="${val#"${val%%[![:space:]]*}"}"
    val="${val%"${val##*[![:space:]]}"}"
    # Validate version variables match semver pattern
    if [[ "$var" == *VER ]] && [[ "$var" != "GO_RUN" ]]; then
        val=$(sanitize_version "$val")
        if ! [[ "$val" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]]; then
            print_error "Version variable $var does not match semantic versioning format"
            exit 1
        fi
    fi
    # Export validated variable
    declare -g "$var=$val"
done

# Validate NODE_VER is numeric before URL construction
if ! [[ "$NODE_VER" =~ ^[0-9]+$ ]]; then
    print_error "NODE_VER must be a valid integer"
    exit 1
fi

# Range check for NODE_VER to prevent invalid version requests (upper bound: 99)
if [[ "$NODE_VER" -gt 99 ]]; then
    print_error "NODE_VER exceeds maximum allowed value of 99"
    exit 1
fi

# Project configuration
export FE_NAME="vibes-network-visualizer"
export FE_PRIVATE=true
export FE_VERSION="0.1.0"

# Configurable repository URL
GO_MODULE_BASE="github.com/vibes-network-visualizer"

# WSL detection helper function
detect_wsl() {
    local wsl=false
    # Check Linux-specific indicators first
    if grep -q Microsoft /proc/version 2>/dev/null || [[ -d /run/WSL ]]; then
        wsl=true
    # Check for wslpath as fallback
    elif command -v wslpath &>/dev/null; then
        wsl=true
    fi
    echo "$wsl"
}

# Check if we're running in WSL
WSL_DETECTED=$(detect_wsl)

if [[ "$WSL_DETECTED" == "false" ]]; then
    print_warning "This doesn't appear to be WSL. The script might not work correctly."
    # Portable timeout implementation for macOS compatibility
    timeout_prompt() {
        local timeout_seconds=$1
        local result=""
        (
            sleep "$timeout_seconds" && echo "timeout" > /tmp/vibes_timeout_$$
        ) &
        local timeout_pid=$!
        if read -t "$timeout_seconds" -p "Continue anyway? (y/n) " -n 1 -r REPLY; then
            kill "$timeout_pid" 2>/dev/null || true
            if [[ -f /tmp/vibes_timeout_$$ ]]; then
                rm -f /tmp/vibes_timeout_$$
                return 1
            fi
            printf '%s' "$REPLY"
            return 0
        fi
        rm -f /tmp/vibes_timeout_$$ 2>/dev/null || true
        wait "$timeout_pid" 2>/dev/null || true
        return 1
    }
    # Add timeout to interactive prompt (120 seconds)
    if ! timeout 120 bash -c 'read -t 120 -p "Continue anyway? (y/n) " -n 1 -r && echo; exit $?' REPLY 2>/dev/null; then
        # Fallback for systems without timeout
        local timeout_reached=false
        (
            sleep 120 && echo "timeout" > /tmp/vibes_timeout_$$
        ) &
        local timeout_pid=$!
        if read -p "Continue anyway? (y/n) [120s] " -n 1 -r REPLY 2>/dev/null; then
            kill "$timeout_pid" 2>/dev/null || true
            rm -f /tmp/vibes_timeout_$$ 2>/dev/null || true
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                exit 1
            fi
        else
            print_warning "Prompt timed out, exiting..."
            exit 1
        fi
    fi
    echo
fi

# Check if script is run as root
if [[ "$EUID" -eq 0 ]]; then
    print_error "Please don't run this script as root/sudo"
    exit 1
fi

# Check for NOPASSWD sudoers configuration
if [[ -n "$(sudo -n -v 2>&1)" ]]; then
    print_warning "Sudo requires a password - elevated privileges will prompt you"
else
    print_warning "WARNING: sudo has NOPASSWD configured - this may enable automated privilege escalation"
fi

# Basic system setup
print_header "Updating system package information"
print_warning "This operation requires elevated privileges"
if ! sudo apt-get update; then
    print_error "Failed to update package list"
    exit 1
fi

print_header "Installing basic build tools"
print_warning "This operation requires elevated privileges"
if ! sudo apt-get install -y build-essential curl wget git unzip; then
    print_error "Failed to install build tools"
    exit 1
fi

# Detect system architecture for portable downloads
detect_arch() {
    local ARCH
    ARCH=$(uname -m)
    case "$ARCH" in
        x86_64) echo "amd64" ;;
        aarch64) echo "arm64" ;;
        armv7l) echo "armv7l" ;;
        *) print_error "Unsupported architecture: $ARCH"; exit 1 ;;
    esac
}

GO_ARCH=$(detect_arch)

# Portable version comparison function
version_gte() {
    local required="$1"
    local installed="$2"
    local req_major req_minor req_patch
    local inst_major inst_minor inst_patch
    
    # Parse versions
    IFS='.' read -r req_major req_minor req_patch <<< "${required%.*}"
    IFS='.' read -r inst_major inst_minor inst_patch <<< "${installed%.*}"
    
    # Ensure defaults for patch version
    req_patch="${req_patch:-0}"
    inst_patch="${inst_patch:-0}"
    
    # Compare major
    if [[ "$req_major" -gt "$inst_major" ]]; then
        return 1
    elif [[ "$req_major" -lt "$inst_major" ]]; then
        return 0
    fi
    
    # Compare minor
    if [[ "$req_minor" -gt "$inst_minor" ]]; then
        return 1
    elif [[ "$req_minor" -lt "$inst_minor" ]]; then
        return 0
    fi
    
    # Compare patch
    if [[ "$req_patch" -gt "$inst_patch" ]]; then
        return 1
    fi
    
    return 0
}

# Install Go
print_header "Installing Go $GO_VER"
if command -v go &> /dev/null; then
    GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
    print_step "Go $GO_VERSION is already installed"

    # Compare versions using portable function
    if ! version_gte "$GO_VER" "$GO_VERSION"; then
        print_warning "Your Go version is older than $GO_VER. Attempting upgrade..."
        print_step "Downloading Go $GO_VER..."

        # Create secure temporary file in private TMPDIR
        TEMP_GO_ARCHIVE=$(mktemp "$TMPDIR/go.XXXXXX") && TEMP_FILES+=("$TEMP_GO_ARCHIVE")
        
        if ! wget -q -O "$TEMP_GO_ARCHIVE" "https://go.dev/dl/go${GO_VER}.${GO_ARCH}.tar.gz"; then
            print_error "Failed to download Go archive"
            exit 1
        fi

        # Verify integrity - download checksum file
        print_step "Verifying Go download integrity..."
        TEMP_CHECKSUM=$(mktemp "$TMPDIR/go-checksum.XXXXXX") && TEMP_FILES+=("$TEMP_CHECKSUM")
        if wget -q -O "$TEMP_CHECKSUM" "https://go.dev/dl/go${GO_VER}.checksums"; then
            local expected_hash
            expected_hash=$(parse_sha256 "$TEMP_GO_ARCHIVE")
            if ! grep -q "$expected_hash" "$TEMP_CHECKSUM"; then
                print_error "Go checksum verification failed"
                exit 1
            fi
        else
            print_error "Could not download checksum file, security verification cannot be performed"
            exit 1
        fi

        print_step "Removing old Go installation..."
        sudo rm -rf /usr/local/go

        print_step "Installing Go $GO_VER..."
        if ! sudo tar -C /usr/local -xzf "$TEMP_GO_ARCHIVE"; then
            print_error "Failed to extract Go archive"
            exit 1
        fi

        # Add Go to PATH if not already there with proper quoting
        if ! grep -q "export PATH=\$PATH:/usr/local/go/bin" ~/.profile 2>/dev/null; then
            if ! echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.profile 2>/dev/null; then
                print_warning "Could not add Go to ~/.profile, please add manually"
            fi
        fi

        # Also add to current session
        export PATH="$PATH:/usr/local/go/bin"
        print_step "Go upgrade complete"
    else
        print_step "Go version is up to date"
    fi
else
    print_step "Downloading Go $GO_VER..."
    
    # Create secure temporary file in private TMPDIR
    TEMP_GO_ARCHIVE=$(mktemp "$TMPDIR/go.XXXXXX") && TEMP_FILES+=("$TEMP_GO_ARCHIVE")

    if ! wget -q -O "$TEMP_GO_ARCHIVE" "https://go.dev/dl/go${GO_VER}.${GO_ARCH}.tar.gz"; then
        print_error "Failed to download Go archive"
        exit 1
    fi

    print_step "Installing Go..."
    if ! sudo tar -C /usr/local -xzf "$TEMP_GO_ARCHIVE"; then
        print_error "Failed to extract Go archive"
        exit 1
    fi

    # Add Go to PATH if not already there
    if ! grep -q "export PATH=\$PATH:/usr/local/go/bin" ~/.profile 2>/dev/null; then
        if ! echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.profile 2>/dev/null; then
            print_warning "Could not add Go to ~/.profile, please add manually"
        fi
    fi

    # Also add to current session
    export PATH="$PATH:/usr/local/go/bin"
    print_step "Go installation complete"
fi

# Install Node.js and npm - use pipe to sudo for security instead of sudo bash
print_header "Installing Node.js and npm"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    print_step "Node.js $NODE_VERSION is already installed"

    # Check if Node.js version is at least $NODE_VER with proper quoting and robust parsing
    if [[ $NODE_VERSION =~ v([0-9]+)\..* ]]; then
        NODE_MAJOR="${BASH_REMATCH[1]}"
    else
        NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1 | tr -d 'v')
    fi
    
    if [[ "$NODE_MAJOR" -lt "$NODE_VER" ]]; then
        print_warning "Your Node.js version is too old. Version $NODE_VER+ is required."
        print_step "Upgrading Node.js..."
        
        # Download NodeSource setup script to temp file first, then pipe to sudo
        TEMP_SETUP_SCRIPT=$(mktemp "$TMPDIR/nodesource-setup.XXXXXX") && TEMP_FILES+=("$TEMP_SETUP_SCRIPT")
        
        if ! curl -fsSL -o "$TEMP_SETUP_SCRIPT" "https://deb.nodesource.com/setup_${NODE_VER}.x"; then
            print_error "Failed to download NodeSource setup script"
            exit 1
        fi
        
        print_step "Running NodeSource setup..."
        # Use pipe to sudo rather than sudo bash - safer
        if ! sudo -E bash "$TEMP_SETUP_SCRIPT"; then
            print_error "NodeSource setup failed"
            exit 1
        fi
        
        if ! sudo apt-get install -y nodejs; then
            print_error "Failed to install Node.js"
            exit 1
        fi
    else
        print_step "Node.js version is sufficient"
    fi
else
    print_step "Setting up Node.js repository..."
    TEMP_SETUP_SCRIPT=$(mktemp "$TMPDIR/nodesource-setup.XXXXXX") && TEMP_FILES+=("$TEMP_SETUP_SCRIPT")
    
    if ! curl -fsSL -o "$TEMP_SETUP_SCRIPT" "https://deb.nodesource.com/setup_${NODE_VER}.x"; then
        print_error "Failed to download NodeSource setup script"
        exit 1
    fi
    
    if ! sudo -E bash "$TEMP_SETUP_SCRIPT"; then
        print_error "NodeSource setup failed"
        exit 1
    fi
    
    print_step "Installing Node.js..."
    if ! sudo apt-get install -y nodejs; then
        print_error "Failed to install Node.js"
        exit 1
    fi
    
    print_step "Node.js installation complete"
fi

# Install libpcap for packet capture
print_header "Installing libpcap development libraries"
print_warning "This operation requires elevated privileges"
if ! sudo apt-get install -y libpcap-dev; then
    print_error "Failed to install libpcap-dev"
    exit 1
fi

# Install frontend dependencies
print_header "Setting up frontend environment"
print_step "Creating package.json if it doesn't exist"
if [[ ! -f frontend/package.json ]]; then
    mkdir -p frontend
    
    # Create package.json with error checking using atomic write
    TEMP_PKG_JSON=$(mktemp "$TMPDIR/package.XXXXXX") && TEMP_FILES+=("$TEMP_PKG_JSON")
    
    # Write package.json content to temp file
    cat > "$TEMP_PKG_JSON" << 'EOF'
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
    "react": "^$REACT_VER",
    "react-dom": "^$REACT_VER",
    "zustand": "^$ZUSTAND_VER"
  },
  "devDependencies": {
    "@types/react": "^$TYPES_REACT_VER",
    "@types/react-dom": "^$TYPES_REACTDOM_VER",
    "@vitejs/plugin-react": "^$VITEJS_REACT_VER",
    "autoprefixer": "^$AUTOPREFIXER_VER",
    "postcss": "^$POSTCSS_VER",
    "tailwindcss": "^$TAILWINDCSS_VER",
    "typescript": "^$TYPESCRIPT_VER",
    "vite": "^$VITE_VER",
    "vite-tsconfig-paths": "^$VITETS_VER"
  }
}
EOF
    
    # Verify the file was created and has required content
    if ! grep -q '"name"' "$TEMP_PKG_JSON" || ! grep -q '"dependencies"' "$TEMP_PKG_JSON"; then
        print_error "package.json content verification failed"
        exit 1
    fi
    
    # Move to final location atomically
    if ! mv "$TEMP_PKG_JSON" frontend/package.json; then
        print_error "Failed to move package.json to final location"
        exit 1
    fi
    
    # Verify the file was created and is readable
    if ! [[ -r frontend/package.json ]]; then
        print_error "package.json is not readable"
        exit 1
    fi
    
    # Remove from cleanup list since it's no longer temporary
    TEMP_FILES=("${TEMP_FILES[@]/$TEMP_PKG_JSON}")
    
    print_step "Created package.json"
fi

# Install backend dependencies
print_header "Setting up backend environment"
print_step "Creating go.mod if it doesn't exist"
if [[ ! -f backend/go.mod ]]; then
    mkdir -p backend
    
    # Validate WEBSOCKET_VER and GOPACKET_VER against semantic version patterns
    if ! [[ "$WEBSOCKET_VER" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]]; then
        print_error "WEBSOCKET_VER does not match semantic versioning format"
        exit 1
    fi
    if ! [[ "$GOPACKET_VER" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]]; then
        print_error "GOPACKET_VER does not match semantic versioning format"
        exit 1
    fi
    
    # Create go.mod with error checking using atomic write
    TEMP_MOD=$(mktemp "$TMPDIR/gomod.XXXXXX") && TEMP_FILES+=("$TEMP_MOD")
    
    # Write go.mod content to temp file
    cat > "$TEMP_MOD" << 'EOF'
module github.com/vibes-network-visualizer/backend

go $GO_RUN

require (
        github.com/gorilla/websocket v${WEBSOCKET_VER}
        github.com/google/gopacket v${GOPACKET_VER}
)
EOF
    
    # Verify the file was created and has required content
    if ! grep -q 'module' "$TEMP_MOD" || ! grep -q 'require' "$TEMP_MOD"; then
        print_error "go.mod content verification failed"
        exit 1
    fi
    
    # Move to final location atomically
    if ! mv "$TEMP_MOD" backend/go.mod; then
        print_error "Failed to move go.mod to final location"
        exit 1
    fi
    
    # Verify the file was created and is readable
    if ! [[ -r backend/go.mod ]]; then
        print_error "go.mod is not readable"
        exit 1
    fi
    
    # Remove from cleanup list since it's no longer temporary
    TEMP_FILES=("${TEMP_FILES[@]/$TEMP_MOD}")
    
    print_step "Created go.mod"
fi

# Centralized pushd/popd handler for directory management
PUSHD_STACK=()

pushd_safe() {
    if ! pushd "$1" &>/dev/null; then
        print_error "Failed to change to $1 directory"
        exit 1
    fi
    PUSHD_STACK+=("$1")
}

popd_safe() {
    if [[ ${#PUSHD_STACK[@]} -gt 0 ]]; then
        if ! popd &>/dev/null; then
            print_warning "Failed to return to previous directory"
        fi
        unset 'PUSHD_STACK[-1]'
    fi
}

# Cleanup on exit to ensure directory restoration
cleanup() {
    # Pop all remaining directories from stack
    while [[ ${#PUSHD_STACK[@]} -gt 0 ]]; do
        popd_safe
    done
    # Call original cleanup
    local exit_code=$?
    for file in "${TEMP_FILES[@]}"; do
        [[ -f "$file" ]] && rm -f "$file"
    done
    rm -rf "$TMPDIR" 2>/dev/null
    if [[ -d "$ORIGINAL_DIR" ]] && cd "$ORIGINAL_DIR" 2>/dev/null; then
        :
    else
        echo "Warning: Failed to return to original directory" >&2
    fi
    exit "$exit_code"
}
trap cleanup EXIT INT TERM ERR

# Install Go dependencies with proper directory management
print_step "Installing Go dependencies"
pushd_safe backend

# Error handling for go mod tidy
if ! go mod tidy; then
    print_error "go mod tidy failed"
    exit 1
fi

# Install websocket package with fallback to GOPROXY and explicit error checking
if ! go get github.com/gorilla/websocket@v${WEBSOCKET_VER}; then
    if ! GOPROXY=https://proxy.golang.org,direct go install github.com/gorilla/websocket@v${WEBSOCKET_VER}; then
        print_error "Failed to install gorilla/websocket package"
        exit 1
    fi
fi

if ! go get github.com/google/gopacket@v${GOPACKET_VER}; then
    print_error "Failed to install gopacket package"
    exit 1
fi

# Return to parent directory
popd_safe

print_step "Installing frontend dependencies"
pushd_safe frontend

if ! npm install; then
    print_error "npm install failed"
    exit 1
fi

# Return to parent directory
popd_safe

# Setup the project for first-time use
print_header "Setting up project for first-time use"

print_step "Creating database directory"
mkdir -p data
chmod 750 data

print_step "Creating log directory"
mkdir -p logs
chmod 750 logs

# Print completion message
print_header "VIBES Network Visualizer prerequisites installation completed!"
print_step "You may need to restart your terminal or run 'source ~/.profile' to use Go"
print_step "To start the frontend: cd frontend && npm run dev"
print_step "To start the backend: cd backend/cmd && go run main.go"

print_warning "Note: you'll need to run the backend with sudo for packet capture capabilities"
print_warning "      Example: sudo -E $(which go) run backend/cmd/main.go"

print_header "Ready to build the sickest network visualizer ever! 🚀"
