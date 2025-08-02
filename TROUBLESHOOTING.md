# VIBES Network Visualizer - Troubleshooting Guide

This guide will help you solve common issues that may arise when setting up and running the VIBES Network Visualizer.

## Prerequisites Installation

### Running the Installer in WSL

1. Open WSL (Windows Subsystem for Linux) by searching for it in the Start menu or opening a PowerShell/CMD and typing `wsl`
2. Navigate to your project directory:
   ```bash
   cd /mnt/c/Users/your-username/path/to/FOO
   ```
3. Make the installer script executable:
   ```bash
   chmod +x install_prereqs.sh
   ```
4. Run the installer:
   ```bash
   ./install_prereqs.sh
   ```

### Common Installation Issues

#### "Permission denied" when running the installer

If you see an error like `bash: ./install_prereqs.sh: Permission denied`, try:
```bash
chmod +x install_prereqs.sh
```

#### Go installation fails

If the Go installation fails, you can install it manually:
```bash
wget -O go1.19.linux-amd64.tar.gz https://golang.org/dl/go1.19.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.19.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.profile
source ~/.profile
```

#### Node.js installation fails

If Node.js installation fails, try installing it manually:
```bash
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## Running the Application

### Backend Issues

#### "Operation not permitted" when capturing packets

The packet capture functionality requires root privileges. Run the backend with sudo:
```bash
sudo -E $(which go) run backend/cmd/main.go
```

#### WebSocket connection fails

Check that the backend is running and listening on port 8080. You can verify with:
```bash
netstat -tuln | grep 8080
```

### Frontend Issues

#### Error: Cannot find module 'zustand' or its corresponding type declarations

If you see TypeScript errors like this, try installing the dependencies:
```bash
cd frontend
npm install
```

#### "Failed to connect to WebSocket" error

Make sure the backend is running and the WebSocket URL is correct. By default, the frontend tries to connect to `ws://localhost:8080/ws`.

## WSL-specific Issues

### Finding your project in WSL

WSL mounts your Windows drives under `/mnt/`. For example, your C: drive is at `/mnt/c/`. 

To navigate to your project directory:
```bash
cd /mnt/c/Users/your-username/path/to/project
```

### Accessing Windows from WSL

You can access Windows executables from WSL. For example, to open the project folder in Windows Explorer:
```bash
explorer.exe .
```

### Network Interface Access

If you have trouble with network interface access in WSL, you might need to run WSL as administrator or use Windows tools like Wireshark to capture packets and feed them to your application.

## Performance Issues

### Frontend rendering is slow

- Make sure hardware acceleration is enabled in your browser
- Check if your application is maintaining 60+ FPS with the built-in FPS counter
- Use PixiJS object pooling to reduce garbage collection
- Implement culling for off-screen elements

### Backend memory usage is high

- Implement packet batching to reduce WebSocket message frequency
- Use more efficient packet serialization
- Consider downsampling the packet stream during high-traffic periods

## Need More Help?

If you're still experiencing issues, try:
1. Checking the console logs in your browser and the backend terminal
2. Looking for similar issues in the PixiJS or Go WebSocket documentation
