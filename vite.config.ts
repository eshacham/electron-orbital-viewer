// vite.config.ts
import { existsSync, statSync, createReadStream } from 'fs';
import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, sep } from 'path';

// Serves the stack's CloudFront distribution: publish.py uploads the
// generated molecule data there (spec §4.5), never into this repo's build.
const MOLECULE_DATA_CDN = 'https://d3rhfcclqjt4tf.cloudfront.net';

// The provenance panel links a computed job's input.py, output.log and
// geometry.xyz: shown as text, not downloaded (spec §9.3).
const TEXT_FILES = /\.(py|log|xyz)$/;

/** Dev only (`apply: 'serve'`, and `server`/plugin config is never part of a
 * production bundle regardless): serves /molecules/<version>/... from
 * tools/molecules/out/ when it has been generated locally, so data can be
 * viewed before it is published; falls through to the proxy below otherwise
 * (spec §4.5). Registered via configureServer, so it runs ahead of Vite's
 * own proxy middleware, and a local file always wins. */
function serveLocalMolecules(): Plugin {
  // A live check points its own Vite at a throwaway job server and result folder.
  const root = resolve(__dirname, process.env.JOBS_OUT_ROOT ?? 'tools/molecules/out');
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
        res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json'
          : TEXT_FILES.test(file) ? 'text/plain; charset=utf-8' : 'application/octet-stream');
        const stream = createReadStream(file);
        stream.on('error', next);
        stream.pipe(res);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Where "AWS" jobs go in development (Phase 6B-3 prints this URL after
  // deploying the compute stack). Unset, /api/aws falls through to the local
  // server, which answers 404 -- the UI says AWS is not configured.
  const jobsAwsApiUrl = loadEnv(mode, process.cwd(), '').JOBS_AWS_API_URL;
  return {
    plugins: [react(), serveLocalMolecules()],
    root: 'public',
    build: {
      outDir: '../dist',
      emptyOutDir: true,
      rollupOptions: {
        // Two pages: the viewer, and the owner's dashboard (spec §9.4), each
        // with its own entry chunk, so the dashboard's code never ships to a
        // visitor (tools/check_admin_split.mjs proves it on every build).
        input: {
          main: resolve(__dirname, 'public/index.html'),
          admin: resolve(__dirname, 'public/admin.html'),
        },
      },
    },
    resolve: {
      alias: [
        {
          find: /^\/main.tsx$/,
          replacement: resolve(__dirname, 'src/main.tsx')
        },
        { find: /^\/admin.tsx$/, replacement: resolve(__dirname, 'src/admin/main.tsx') },
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
      proxy: {
        ...(jobsAwsApiUrl ? {
          '/api/aws': { target: jobsAwsApiUrl, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/api\/aws/, '/api') },
        } : {}),
        // The local job server (tools/jobs/local_server.py, spec §12). A live
        // check points its own Vite at a throwaway job server and result folder.
        '/api': { target: process.env.JOBS_LOCAL_API_URL ?? 'http://127.0.0.1:8787', changeOrigin: false },
        // Not published yet, or a molecule not generated locally: fetch it from
        // CloudFront, same as production (spec §4.5).
        '/molecules': {
          target: MOLECULE_DATA_CDN,
          changeOrigin: true,
        },
      },
    }
  };
});