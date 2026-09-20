import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const configuredBackend = process.env.BACKEND_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
    const backendOrigin = configuredBackend.startsWith("http") ? configuredBackend : `http://${configuredBackend}`;
    return [
      { source: "/health", destination: `${backendOrigin}/health` },
      { source: "/health/:path*", destination: `${backendOrigin}/health/:path*` },
      { source: "/api/:path*", destination: `${backendOrigin}/api/:path*` },
    ];
  },
};

export default nextConfig;
