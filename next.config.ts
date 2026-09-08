import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // potrace's `loadImage` does `instanceof Jimp`, which Turbopack mangles
  // when bundling jimp. Keeping potrace external lets Node load it as raw
  // CommonJS at runtime, preserving the prototype chain.
  serverExternalPackages: ["potrace"],
  // Vercel traces `process.cwd()` for the serverless bundle because
  // `src/lib/storage/images.ts` resolves IMAGES_DIR against it; keep the repo
  // noise out of the function (same pattern as glyph).
  outputFileTracingExcludes: {
    "/*": [
      "./.git/**",
      "./docs/**",
      "./generate-images/**",
      "./tests/**",
      "./public/**",
    ],
  },
};

export default nextConfig;
