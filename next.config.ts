import type { NextConfig } from "next";

const nextConfig: any = { // Ubah tipe dari NextConfig ke any buat sementara
  /* config options here */
  typescript:{
	ignoreBuildErrors: true,
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["192.168.10.68:3000", "localhost:3000"]
    }
  },
};
export default nextConfig;
