import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const VIRTUAL_ID = "virtual:content";
const RESOLVED_ID = "\0" + VIRTUAL_ID;

/**
 * Minimal content plugin stub — loads JSON pages from src/content/pages
 * and exposes them as `virtual:content`.
 */
export function contentPlugin(): Plugin {
  let root = process.cwd();

  return {
    name: "content-plugin-stub",
    configResolved(config) {
      root = config.root;
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },
    load(id) {
      if (id !== RESOLVED_ID) return;

      const pagesDir = path.resolve(root, "src/content/pages");
      if (!fs.existsSync(pagesDir)) {
        return "export {};";
      }

      const exports: string[] = [];
      for (const file of fs.readdirSync(pagesDir)) {
        if (!file.endsWith(".json")) continue;
        const name = path.basename(file, ".json");
        const abs = path.resolve(pagesDir, file).replace(/\\/g, "/");
        exports.push(`export { default as ${name} } from ${JSON.stringify(abs)};`);
      }
      return exports.join("\n") || "export {};";
    },
  };
}
