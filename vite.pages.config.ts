import { copyFile, cp, mkdir } from "node:fs/promises";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const staticRoutes = ["radar", "radar/admin", "radar/project"];

function githubPagesRoutes() {
  return {
    name: "github-pages-routes",
    apply: "build" as const,
    async closeBundle() {
      const outputRoot = new URL("./pages-dist/", import.meta.url);
      const indexFile = new URL("index.html", outputRoot);

      await Promise.all(staticRoutes.map(async (route) => {
        const routeDirectory = new URL(`${route}/`, outputRoot);
        await mkdir(routeDirectory, { recursive: true });
        await copyFile(indexFile, new URL("index.html", routeDirectory));
      }));

      await copyFile(indexFile, new URL("404.html", outputRoot));
    },
  };
}

function safePublicAssets() {
  return {
    name: "safe-public-assets",
    apply: "build" as const,
    async closeBundle() {
      const publicRoot = new URL("./public/", import.meta.url);
      const outputRoot = new URL("./pages-dist/", import.meta.url);
      await cp(publicRoot, outputRoot, {
        recursive: true,
        filter: (source) => !source.endsWith("/data/radar.json"),
      });
    },
  };
}

export default defineConfig({
  root: "github-pages",
  base: "/biaokankan/",
  define: { "import.meta.env.BIAOKANKAN_PAGES_ENCRYPTED": "true" },
  publicDir: false,
  plugins: [react(), githubPagesRoutes(), safePublicAssets()],
  build: {
    outDir: "../pages-dist",
    emptyOutDir: true,
  },
});
