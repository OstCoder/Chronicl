import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
//
// DEV-ONLY PROXY for GDELT:
//
// The GDELT 2.0 doc API sends `Access-Control-Allow-Origin: *` on MOST
// responses but intermittently OMITS the header (observed live in a headless
// Chrome session: a curl probe to the same URL got the header, Chrome got a
// CORS-blocked fetch with the header missing). Because server-side probes
// cannot distinguish "header withheld" from "no header ever sent", routing
// the browser's request through a local same-origin proxy sidesteps CORS
// completely: the only cross-origin hop is node-to-node server side, which
// CORS doesn't govern.
//
// Frontend code must therefore call '/api/gdelt' (see services/gdelt.ts).
// Only /api/gdelt is proxied — unrelated paths stay untouched.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/gdelt': {
        target: 'https://api.gdeltproject.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gdelt/, '/api/v2/doc/doc'),
      },
    },
  },
})
