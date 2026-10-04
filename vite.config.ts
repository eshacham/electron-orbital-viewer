// vite.config.ts
import { existsSync, statSync, createReadStream } from 'fs';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, sep } from 'path';

// Serves the stack's CloudFront distribution: publish.py uploads the
// generated molecule data there (spec §4.5), never into this repo's build.
const MOLECULE_DATA_CDN = 'https://d3rhfcclqjt4tf.cloudfront.net';

/** Dev only (`apply: 'serve'`, and `server`/plugin config is never part of a
 * production bundle regardless): serves /molecules/<version>/... from
 * tools/molecules/out/ when it has been generated locally, so data can be
 * viewed before it is published; falls through to the proxy below otherwise
 * (spec §4.5). Registered via configureServer, so it runs ahead of Vite's
 * own proxy middleware, and a local file always wins. */
function serveLocalMolecules(): Plugin {
  const root = resolve(__dirname, 'tools/molecules/out');
  return {
    name: 'serve-local-molecules',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/molecules', (req, res, next) => {
        const file = resolve(root, `.${decodeURIComponent((req.url ?? '').split('?')[0])}`);
        // Node's own router already rejects a raw ".." segment with 400; this
        // is defence in depth against anything that reaches this far (e.g. a
        // sibling directory that merely shares `root` as a string prefix,
        // which a bare `startsWith(root)` would wrongly allow).
        if (file !== root && !file.startsWith(root + sep)) return next();
        if (!existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
        const stream = createReadStream(file);
        stream.on('error', next);
        stream.pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serveLocalMolecules()],
  root: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: [
      {
        find: /^\/main.tsx$/,
        replacement: resolve(__dirname, 'src/main.tsx')
      },
      {
        find: /^\.\.\/src\/(.*)/,
        replacement: resolve(__dirname, 'src/$1')
      }
    ]
  },
  server: {
    watch: {
      usePolling: true,
      interval: 100
    },
    // Not published yet, or a molecule not generated locally: fetch it from
    // CloudFront, same as production (spec §4.5).
    proxy: {
      '/molecules': {
        target: MOLECULE_DATA_CDN,
        changeOrigin: true,
      },
    },
  }
});