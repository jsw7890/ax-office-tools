import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@electric-sql/pglite", "@electric-sql/pglite-pgvector"],
};

export default nextConfig;
