import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle so the Docker image stays small (the lean
  // open-source bundle goal). See Dockerfile / docker-compose.yml.
  output: "standalone",
};

export default nextConfig;
