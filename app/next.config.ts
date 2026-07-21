import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  transpilePackages: ["@2day/core"],
  webpack: (config) => {
    // @2day/core is consumed as raw TS with NodeNext-style ".js" specifiers;
    // teach webpack to resolve `./x.js` → `./x.ts` (same trick tsc's
    // moduleResolution applies).
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
