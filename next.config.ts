import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle so the Docker image stays small (the lean
  // open-source bundle goal). See Dockerfile / docker-compose.yml.
  output: "standalone",
  // Anchor the workspace root to this repo. Otherwise a stray lockfile in a parent directory
  // (e.g. a leftover ~/package-lock.json) makes Turbopack infer the wrong root and warn.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
