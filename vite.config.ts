import { defineConfig } from 'vite';

// La página vive en web/ y usa el motor de src/ tal cual. `base: './'` para poder abrir el build
// desde cualquier carpeta o subirlo a GitHub Pages.
export default defineConfig({
  root: 'web',
  base: './',
  build: { outDir: '../dist', emptyOutDir: true },
  worker: { format: 'es' },
});
