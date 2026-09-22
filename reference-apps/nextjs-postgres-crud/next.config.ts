import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Traces only the node_modules actually required at runtime into .next/standalone — this keeps
  // build/dev-only tooling (the prisma CLI and its mysql2/deepmerge-ts transitive deps, never
  // imported by app code) out of the production image entirely, rather than trying to exclude it by hand.
  output: "standalone",
};

export default nextConfig;
