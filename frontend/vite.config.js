import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// basicSsl: certificado autofirmado para poder probar getUserMedia (cámara)
// desde el celular en la misma red — Safari/Chrome móvil exigen un
// contexto seguro (HTTPS o localhost) para dar permiso de cámara, una IP
// local por http plano no alcanza. El navegador del celular va a mostrar
// una advertencia de certificado no confiable la primera vez; "Avanzado" ->
// "Continuar/Visitar sitio" es esperable, no es un error real.
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    port: 5173,
    host: true, // escucha en todas las interfaces de red, no solo localhost
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          recharts: ['recharts'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
