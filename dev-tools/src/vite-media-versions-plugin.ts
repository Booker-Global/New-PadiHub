import fs from "node:fs";
import path from "node:path";
import type { Plugin, Connect } from "vite";

type MediaEntry = {
  currentUrl?: string;
  mediaType?: string;
};

/**
 * Serves /airo-assets/images/* from airo-media.json currentUrl values
 * when local files are missing (platform media slot rewrite).
 */
export function mediaVersionsPlugin(): Plugin {
  let root = process.cwd();
  let manifest: Record<string, MediaEntry> = {};

  function loadManifest() {
    const candidates = [
      path.resolve(root, "airo-media.json"),
      path.resolve(root, "public/airo-media.json"),
    ];
    for (const file of candidates) {
      if (!fs.existsSync(file)) continue;
      try {
        manifest = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, MediaEntry>;
        return;
      } catch {
        /* keep trying */
      }
    }
    manifest = {};
  }

  function resolveSlot(urlPath: string): string | undefined {
    const prefix = "/airo-assets/images/";
    if (!urlPath.startsWith(prefix)) return undefined;
    const slot = urlPath.slice(prefix.length).split("?")[0].replace(/\/+$/, "");
    return manifest[slot]?.currentUrl;
  }

  return {
    name: "media-versions",
    configResolved(config) {
      root = config.root;
      loadManifest();
    },
    configureServer(server) {
      loadManifest();
      const middleware: Connect.NextHandleFunction = (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/airo-assets/images/")) return next();

        // Prefer real files under public/
        const localFile = path.resolve(root, "public", url.slice(1));
        if (fs.existsSync(localFile) && fs.statSync(localFile).isFile()) {
          return next();
        }

        const remote = resolveSlot(url);
        if (!remote) return next();

        res.statusCode = 302;
        res.setHeader("Location", remote);
        res.setHeader("Cache-Control", "no-cache");
        res.end();
      };
      server.middlewares.use(middleware);
    },
  };
}
