import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// [SECURITY] API key is NEVER embedded in the client bundle.
// In dev mode, the Vite server proxies Gemini requests and injects
// the key server-side. In production, users must supply their own key.
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          // Dev-only API proxy: client calls /api/gemini/...
          // Vite server forwards to Google and injects the key
          '/api/gemini': {
            target: 'https://generativelanguage.googleapis.com',
            changeOrigin: true,
            rewrite: (p) => p.replace(/^\/api\/gemini/, ''),
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq, req) => {
                const apiKey = env.GEMINI_API_KEY;
                if (apiKey) {
                  proxyReq.setHeader('x-goog-api-key', apiKey);
                }
              });
            },
          },
        },
      },
      plugins: [react()],
      // [REMOVED] define: no longer injects GEMINI_API_KEY into client bundle
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
