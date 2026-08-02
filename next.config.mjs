import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const projectRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // This machine has other lockfiles above the project; pin the root so the
  // font-tracing paths below resolve from the project, not the home dir.
  outputFileTracingRoot: projectRoot,
  // Card rendering reads the brand font files at runtime. Make sure Vercel's
  // file tracer bundles them with the API routes. The reel route also shells out
  // to the bundled ffmpeg binary to mix music into the clip, so include it there
  // (only that route, to avoid bloating the other functions).
  outputFileTracingIncludes: {
    "/api/**": ["./brand/fonts/**"],
    "/api/reel": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/ffcheck": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  // Keep ffmpeg-static out of the webpack bundle so its binary path (computed
  // from __dirname) resolves at runtime instead of being mangled.
  serverExternalPackages: ["ffmpeg-static"],
  // Pexels images are pulled into cards at render time; allow them in <Image>
  // if we ever use next/image (the card renderer itself uses next/og).
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.pexels.com" }],
  },
  // The card renderer uses raw <img> for Satori (next/og), which trips the
  // next/image lint rule. Keep type-checking on, skip lint during builds.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
