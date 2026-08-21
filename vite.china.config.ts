import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "github-pages",
  base: "/",
  define: { "import.meta.env.BIAOKANKAN_PAGES_ENCRYPTED": "false" },
  publicDir: "../public",
  plugins: [react()],
  build: {
    outDir: "../china-dist",
    emptyOutDir: true,
  },
});
