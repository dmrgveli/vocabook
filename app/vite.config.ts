import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages cannot set headers, so the CSP ships as a <meta> tag.
// Build only: the dev server (React Refresh) relies on an inline script.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com https://youglish.com",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "font-src 'self'",
  "img-src 'self' data: https:",
  "media-src 'self' https:",
  "connect-src 'self' https://api.dictionaryapi.dev https://api.datamuse.com https://vocabook-sync.vocabook-sync.workers.dev https://accounts.google.com",
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

// Each build gets an id. version.json carries it next to the app, so a tab left open on a
// phone can notice that a newer build was published (src/update.ts).
const BUILD_ID = process.env.GITHUB_SHA?.slice(0, 12) ?? String(Date.now())

function versionFile(): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) })
    },
  }
}

export default defineConfig(({ command }) => ({
  // GitHub Actions sets BASE_PATH=/<repo-name>/.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), cspMeta(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(command === 'build' ? BUILD_ID : 'dev') },
}))
