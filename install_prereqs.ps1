# VIBES Network Visualizer Prerequisites Installer for Windows
# ==================================================
# This script installs all required dependencies for the VIBES project on Windows
# - Node.js 16+
# - Go 1.19+
# - Npcap (for packet capture)
# - Development tools

# Function to display styled output
function Write-Header {
    param([string]$text)
    Write-Host "`n==>" -ForegroundColor Cyan -NoNewline
    Write-Host " $text" -ForegroundColor White
}

function Write-Step {
    param([string]$text)
    Write-Host "  ->" -ForegroundColor Green -NoNewline
    Write-Host " $text" -ForegroundColor White
}

function Write-Warning {
    param([string]$text)
    Write-Host "  !" -ForegroundColor Yellow -NoNewline
    Write-Host " $text" -ForegroundColor White
}

function Write-Error {
    param([string]$text)
    Write-Host "  X" -ForegroundColor Red -NoNewline
    Write-Host " $text" -ForegroundColor White
}

# Check if script is run as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "This script requires administrator privileges to install some components."
    Write-Step "Please right-click on the script and select 'Run as administrator'"
    Read-Host "Press Enter to exit"
    exit
}

# Verify we have internet connection
Write-Header "Checking internet connection"
if (-not (Test-Connection -ComputerName www.google.com -Count 1 -Quiet)) {
    Write-Error "No internet connection detected. Please connect to the internet and try again."
    Read-Host "Press Enter to exit"
    exit
}

# Check for chocolatey package manager
Write-Header "Checking for Chocolatey package manager"
$chocoInstalled = $false
if (Get-Command choco -ErrorAction SilentlyContinue) {
    $chocoInstalled = $true
    Write-Step "Chocolatey is already installed"
} else {
    Write-Step "Installing Chocolatey..."
    try {
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))
        Write-Step "Chocolatey installed successfully"
        $chocoInstalled = $true
    } catch {
        Write-Error "Failed to install Chocolatey: $_"
        Read-Host "Press Enter to exit"
        exit
    }
}

# Install Go
Write-Header "Installing Go 1.19"
if (Get-Command go -ErrorAction SilentlyContinue) {
    $goVersion = (go version) -replace '.*go([0-9]+\.[0-9]+).*', '$1'
    Write-Step "Go $goVersion is already installed"
    
    # Compare versions (basic check)
    if ([version]$goVersion -lt [version]"1.19") {
        Write-Warning "Your Go version might be too old. Version 1.19+ is recommended."
        Write-Step "Proceeding with existing installation..."
    }
} else {
    Write-Step "Installing Go 1.19..."
    choco install golang -y --version=1.19
    refreshenv
    Write-Step "Go installation complete"
}

# Install Node.js
Write-Header "Installing Node.js"
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVersion = (node -v) -replace 'v', ''
    Write-Step "Node.js $nodeVersion is already installed"
    
    # Compare versions
    if ([version]$nodeVersion -lt [version]"16.0.0") {
        Write-Warning "Your Node.js version is too old. Version 16+ is required."
        Write-Step "Upgrading Node.js..."
        choco install nodejs -y --version=16.18.0
        refreshenv
    }
} else {
    Write-Step "Installing Node.js 16..."
    choco install nodejs -y --version=16.18.0
    refreshenv
    Write-Step "Node.js installation complete"
}

# Install Npcap for packet capture
Write-Header "Installing Npcap for packet capture"
if (Test-Path "C:\Windows\System32\Npcap") {
    Write-Step "Npcap is already installed"
} else {
    Write-Step "Installing Npcap..."
    choco install npcap -y
    Write-Step "Npcap installation complete"
}

# Install Git if not present
Write-Header "Installing Git"
if (Get-Command git -ErrorAction SilentlyContinue) {
    Write-Step "Git is already installed"
} else {
    Write-Step "Installing Git..."
    choco install git -y
    refreshenv
    Write-Step "Git installation complete"
}

# Setup project directories
Write-Header "Setting up project directories"
$projectRoot = Get-Location

# Setup backend environment
Write-Step "Creating backend directories"
if (-not (Test-Path "backend")) {
    New-Item -ItemType Directory -Path "backend" | Out-Null
    New-Item -ItemType Directory -Path "backend\cmd" | Out-Null
    New-Item -ItemType Directory -Path "backend\internal" | Out-Null
    New-Item -ItemType Directory -Path "backend\pkg" | Out-Null
}

# Create go.mod if it doesn't exist
if (-not (Test-Path "backend\go.mod")) {
    Write-Step "Creating go.mod"
    Set-Content -Path "backend\go.mod" -Value @"
module github.com/vibes-network-visualizer

go 1.19

require (
	github.com/gorilla/websocket v1.5.0
)
"@
}

# Setup frontend environment
Write-Step "Creating frontend directories"
if (-not (Test-Path "frontend")) {
    New-Item -ItemType Directory -Path "frontend" | Out-Null
    New-Item -ItemType Directory -Path "frontend\src" | Out-Null
    New-Item -ItemType Directory -Path "frontend\public" | Out-Null
    New-Item -ItemType Directory -Path "frontend\src\components" | Out-Null
    New-Item -ItemType Directory -Path "frontend\src\hooks" | Out-Null
    New-Item -ItemType Directory -Path "frontend\src\utils" | Out-Null
}

# Create package.json if it doesn't exist
if (-not (Test-Path "frontend\package.json")) {
    Write-Step "Creating package.json"
    Set-Content -Path "frontend\package.json" -Value @"
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
    "@pixi/react": "^6.0.1",
    "pixi.js": "^6.0.4",
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
"@
}

# Install Go dependencies
Write-Header "Installing Go dependencies"
Push-Location "backend"
try {
    Write-Step "Installing github.com/gorilla/websocket..."
    go get -u github.com/gorilla/websocket
    Write-Step "Installing github.com/google/gopacket..."
    go get -u github.com/google/gopacket
} catch {
    Write-Error "Failed to install Go dependencies: $_"
} finally {
    Pop-Location
}

# Install frontend dependencies
Write-Header "Installing frontend dependencies"
Push-Location "frontend"
try {
    Write-Step "Installing Node.js dependencies..."
    npm install
} catch {
    Write-Error "Failed to install Node.js dependencies: $_"
} finally {
    Pop-Location
}

# Create data and logs directories
Write-Header "Creating data and logs directories"
if (-not (Test-Path "data")) {
    New-Item -ItemType Directory -Path "data" | Out-Null
    Write-Step "Created data directory"
}
if (-not (Test-Path "logs")) {
    New-Item -ItemType Directory -Path "logs" | Out-Null
    Write-Step "Created logs directory"
}

# Final message
Write-Header "VIBES Network Visualizer prerequisites installation completed!"
Write-Step "To start the frontend: cd frontend && npm run dev"
Write-Step "To start the backend: cd backend/cmd && go run main.go"

Write-Warning "Note: You may need to run the command prompt as administrator for packet capture capabilities"
Write-Header "Ready to build the sickest network visualizer ever! 🚀"
Read-Host "Press Enter to exit" 