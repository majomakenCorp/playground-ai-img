import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // potrace's `loadImage` does `instanceof Jimp`, which Turbopack mangles
  // when bundling jimp. Keeping potrace external lets Node load it as raw
  // CommonJS at runtime, preserving the prototype chain.
  serverExternalPackages: ["potrace"],
};

export default nextConfig;
