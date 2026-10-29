import type { NextConfig } from "next";

const config: NextConfig = {
  // Lets the e2e suite keep a normal and a demo-catalogue build side by side.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  images: { formats: ["image/webp"] },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      { source: "/lumi/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=86400" }] },
    ];
  },
};

export default config;
