import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load environment variables
  const env = loadEnv(mode, '.', '');
  
  // Get backend configuration from environment variables
  const backendHost = env.VITE_BACKEND_HOST || 'localhost';
  const backendPort = env.VITE_BACKEND_PORT || '8080';
  const backendUrl = `${backendHost}:${backendPort}`;

  return {
    plugins: [react(), tsconfigPaths()],
    server: {
      proxy: {
        '/ws': {
          target: `ws://${backendUrl}`,
          ws: true,
        },
        '/api': {
          target: `http://${backendUrl}`,
          changeOrigin: true,
          secure: false
        }
      }
    }
  };
}); 