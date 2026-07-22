/**
 * Tiny dependency-free static file server for `app/out/` (the Next.js static
 * export), used only by the Playwright e2e webServer.
 *
 * Why this exists: `next start` refuses to run against `output: "export"`
 * ("next start does not work with output: export ... use serve@latest out
 * instead") — but this repo adds no new npm dependencies, and the live site
 * is itself just static files behind Caddy (AGENT-BRIEF), so a ~50-line
 * Node http server that mimics Caddy's extensionless-URL → `.html` lookup is
 * a closer match to production than pulling in a package for it.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "app", "out");
const PORT = Number(process.env.PORT ?? 3100);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

/** Resolves a request path to a file under ROOT, trying (in order) the exact
 *  file, `path.html`, and `path/index.html` — same fallback order Caddy's
 *  `try_files` uses for this export in production. */
async function resolveFile(urlPath) {
  const safePath = normalize(decodeURIComponent(urlPath)).replace(/^([.]{2}[/\\])+/, "");
  const base = safePath === "/" ? "/index.html" : safePath;
  const candidates = [join(ROOT, base), join(ROOT, `${base}.html`), join(ROOT, base, "index.html")];
  for (const candidate of candidates) {
    try {
      const s = await stat(candidate);
      if (s.isFile()) return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const file = (await resolveFile(url.pathname)) ?? join(ROOT, "404.html");
  try {
    const body = await readFile(file);
    const type = MIME[extname(file)] ?? "application/octet-stream";
    res.writeHead(file.endsWith("404.html") ? 404 : 200, { "content-type": type });
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end("static-server: failed to read " + file);
  }
});

server.listen(PORT, () => {
  console.log(`static-server: serving ${ROOT} on http://localhost:${PORT}`);
});
