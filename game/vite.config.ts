import { defineConfig } from 'vite';
// base relative : le jeu fonctionne depuis n'importe quel dossier ou hébergeur.
// Noms de fichiers stables et dossier non vidé : chaque build remplace le précédent.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020', chunkSizeWarningLimit: 1500, emptyOutDir: false,
    rollupOptions: { output: { entryFileNames: 'assets/app.js', chunkFileNames: 'assets/[name].js', assetFileNames: 'assets/[name][extname]' } },
  },
});
