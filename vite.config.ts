import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' keeps asset URLs relative, so the same build works on
// GitHub Pages (user.github.io/repo-name/), Cloudflare Pages, or a custom domain.
export default defineConfig({
  base: './',
  plugins: [react()],
});
