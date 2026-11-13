// Web build config. Lives next to (not inside) the offline app and never edits it:
// three offline modules are swapped for web versions at build time, everything else is shared as-is.
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const key = (p: string) => path.normalize(p.split("?")[0]).toLowerCase();

// offline module  ->  web replacement   (adjust the left side if your files live elsewhere)
const swaps = new Map<string, string>([
  [key(path.resolve(root, "src/data/igdb.ts")), path.resolve(here, "src/igdb.web.ts")],
  [key(path.resolve(root, "src/data/repository.ts")), path.resolve(here, "src/repository.web.ts")],
  [key(path.resolve(root, "src/features/settings-data.tsx")), path.resolve(here, "src/settings-data.web.tsx")],
]);

function swapModules(): Plugin {
  return {
    name: "web-swap-modules",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || source.startsWith("\0")) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved) return null;
      const target = swaps.get(key(resolved.id));
      // a web file may import the offline original it wraps; everybody else gets the web version
      if (target && key(importer) !== key(target)) return target;
      return null;
    },
  };
}

function csp(proxyOrigin: string): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self' https://accounts.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://images.igdb.com https://i.ytimg.com https://img.youtube.com",
    `connect-src 'self' ${proxyOrigin} https://www.googleapis.com https://accounts.google.com`,
    "frame-src https://accounts.google.com https://www.youtube.com https://www.youtube-nocookie.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  return {
    name: "web-csp",
    apply: "build", // dev server needs inline scripts for HMR
    transformIndexHtml: (html) => html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, here, "VITE_");
  const proxyOrigin = env.VITE_IGDB_PROXY_URL ? new URL(env.VITE_IGDB_PROXY_URL).origin : "";
  const publicDir = path.resolve(root, "public");
  return {
    root: here,
    envDir: here,
    publicDir: existsSync(publicDir) ? publicDir : false,
    plugins: [swapModules(), react(), csp(proxyOrigin)],
    resolve: { dedupe: ["react", "react-dom"] },
    server: { port: 5174, fs: { allow: [root] } }, // 5174 so it can run beside the offline dev server (5173)
    build: { outDir: path.resolve(here, "dist"), emptyOutDir: true, target: "es2022", sourcemap: false },
  };
});
