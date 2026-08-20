import { copyFile, mkdir } from "node:fs/promises";
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

export default defineConfig({
  root: "github-pages",
  base: "/biaokankan/",
  publicDir: "../public",
  plugins: [react(), githubPagesRoutes()],
  build: {
    outDir: "../pages-dist",
    emptyOutDir: true,
  },
});
