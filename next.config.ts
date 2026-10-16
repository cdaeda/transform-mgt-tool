import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The PowerPoint export embeds the appendix screenshots from public/ (not traced by default).
  outputFileTracingIncludes: { "/api/deck/pptx": ["./public/deck/tool/**"] },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
