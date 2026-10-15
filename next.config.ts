import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Lotes de XML de notas fiscais enviados à importação
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
