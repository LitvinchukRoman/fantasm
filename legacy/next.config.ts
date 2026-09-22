import type { NextConfig } from "next";

const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  // Standalone output → a slim Docker image that runs `node server.js`.
  output: "standalone",
  // next/og (Satori) reads the Fixel TTFs at runtime via fs.readFile with a
  // process.cwd()-relative path. Output-file tracing can't detect that dynamic
  // path, so without this the fonts are absent from the standalone bundle and
  // every OG route 500s in prod. Force them in.
  outputFileTracingIncludes: {
    "/**": ["./lib/og-assets/**"],
  },
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Idea covers / avatars are served from CloudFront.
    remotePatterns: [
      { protocol: "https", hostname: "**.cloudfront.net" },
      { protocol: "https", hostname: "cdn.ideas.naukma.com" },
      { protocol: "https", hostname: "*.naukma.com" },
    ],
  },
  async rewrites() {
    // In local dev the browser talks to Next on :3000; proxy /api/* to Spring
    // on :8080 so we mimic the same-origin Caddy setup used in prod.
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
