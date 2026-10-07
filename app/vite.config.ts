import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages cannot set headers, so the CSP ships as a <meta> tag.
// Build only: the dev server (React Refresh) relies on an inline script.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com https://youglish.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: https:",
  "media-src 'self' https:",
  "connect-src 'self' https://api.dictionaryapi.dev https://api.datamuse.com https://*.workers.dev https://accounts.google.com",
  'frame-src https://youglish.com https://www.youtube.com https://accounts.google.com',
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

function cspMeta(): Plugin {
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    ],
  }
}

export default defineConfig({
  // GitHub Actions sets BASE_PATH=/<repo-name>/.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), cspMeta()],
})
