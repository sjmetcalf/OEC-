import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5174,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      outDir: ".cloudflare/output/v0/workers/default/assets",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "oec.fyi",
        short_name: "oec.fyi",
        description: "Practice the Outdoor Emergency Care questions, online or off.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#a855f7",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,webmanifest}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
    }),
    cloudflare(),
  ],
});
