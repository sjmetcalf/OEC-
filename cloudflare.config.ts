import { defineConfig } from "cf/config";

export default defineConfig({
  accountId: "47996dc9bdf3aea95a3fb3ca2e759bf9",
  worker: {
    name: "oec",
    compatibilityDate: "2026-11-05",
    assets: {
      notFoundHandling: "single-page-application",
    },
    domains: ["oec.fyi"],
    observability: {
      enabled: true,
    },
  },
});
