# Backend Connection Configuration

This document explains how to configure the frontend to connect to different backend servers.

## Overview

The frontend now supports dynamic backend connection configuration instead of hardcoded `localhost:8080` URLs. This allows the application to work in different environments (development, staging, production) and with different server configurations.

## How It Works

The frontend automatically determines the backend URL based on:
1. Environment variables (highest priority)
2. Current browser location
3. Fallback to localhost:8080 for development

## Environment Variables

You can configure the backend connection using these environment variables:

### `VITE_BACKEND_HOST`
The hostname or IP address of the backend server.
- **Default**: Current browser hostname, or `localhost` in development
- **Examples**: 
  - `localhost`
  - `192.168.1.100`
  - `your-server.com`
  - `api.yourcompany.com`

### `VITE_BACKEND_PORT`
The port number of the backend server.
- **Default**: `8080` in development, current port in production
- **Examples**:
  - `8080`
  - `3001`
  - `443`

## Configuration Examples

### Development (Default)
No configuration needed. The frontend will automatically connect to `localhost:8080`.

### Local Network Development
Create a `.env.local` file in the frontend directory:
```bash
VITE_BACKEND_HOST=192.168.1.100
VITE_BACKEND_PORT=8080
```

### Production with Custom Domain
```bash
VITE_BACKEND_HOST=api.yourcompany.com
VITE_BACKEND_PORT=443
```

### Docker Development
```bash
VITE_BACKEND_HOST=vibes-backend
VITE_BACKEND_PORT=8080
```

## Files Modified

The following files were updated to support dynamic backend configuration:

### 1. `src/utils/websocketUtils.ts` (New)
- **Purpose**: Centralized utility functions for generating WebSocket and API URLs
- **Functions**:
  - `getWebSocketUrl()`: Generates WebSocket URL based on environment
  - `getApiBaseUrl()`: Generates HTTP API base URL
  - `isDevelopmentMode()`: Detects development environment
  - `getEnvironmentConfig()`: Gets complete environment configuration

### 2. `src/hooks/useWebSocket.ts`
- **Changes**: Replaced hardcoded `ws://localhost:8080/ws` with dynamic URL generation
- **Impact**: WebSocket connections now work with any backend server configuration

### 3. `src/App.tsx`
- **Changes**: 
  - Replaced hardcoded API fetch URLs with dynamic generation
  - Updated error messages to show actual backend URL being used
- **Impact**: API calls and error reporting now reflect actual backend configuration

### 4. `vite.config.ts`
- **Changes**: Added support for environment variables in development proxy configuration
- **Impact**: Development server proxy now supports custom backend URLs

## Environment File Examples

### `.env.local` (Local Development)
```bash
# Local network development
VITE_BACKEND_HOST=192.168.1.100
VITE_BACKEND_PORT=8080
```

### `.env.production` (Production Build)
```bash
# Production configuration
VITE_BACKEND_HOST=api.yourcompany.com
VITE_BACKEND_PORT=443
```

### `.env.staging` (Staging Environment)
```bash
# Staging configuration
VITE_BACKEND_HOST=staging-api.yourcompany.com
VITE_BACKEND_PORT=8080
```

## Usage Instructions

### Development
1. No configuration needed for localhost:8080
2. For custom backend, create `.env.local` file with your settings
3. Restart the development server: `npm run dev`

### Production Build
1. Set environment variables in your build environment
2. Or create `.env.production` file
3. Build the project: `npm run build`

### Docker Deployment
Set environment variables in your Docker configuration:
```dockerfile
ENV VITE_BACKEND_HOST=your-backend-service
ENV VITE_BACKEND_PORT=8080
```

## Automatic Detection

When no environment variables are set, the frontend will:

1. **Development Mode** (port 3000 or 5173): Connect to `localhost:8080`
2. **Production Mode**: Use the same host as the current page
3. **WebSocket Protocol**: Automatically use `wss://` for HTTPS sites, `ws://` for HTTP

## Troubleshooting

### Connection Issues
1. Check that environment variables are set correctly
2. Verify the backend server is running on the specified host/port
3. Check browser console for connection errors
4. Ensure CORS is configured on the backend for your frontend origin

### Environment Variables Not Working
1. Make sure variables start with `VITE_` prefix
2. Restart the development server after changing environment files
3. For production builds, ensure variables are set in the build environment

### WebSocket Connection Failures
1. Check that the backend WebSocket endpoint is accessible
2. Verify firewall settings allow WebSocket connections
3. For HTTPS sites, ensure the backend supports WSS (WebSocket over SSL)

## Benefits

- ✅ **Flexible Deployment**: Works in any environment without code changes
- ✅ **Development Friendly**: No configuration needed for local development
- ✅ **Production Ready**: Supports custom domains and ports
- ✅ **Docker Compatible**: Works with container orchestration
- ✅ **Automatic Detection**: Intelligently determines connection settings
- ✅ **Secure**: Supports both HTTP/WebSocket and HTTPS/WSS protocols