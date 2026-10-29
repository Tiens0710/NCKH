import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/", destination: "/workspace", permanent: false },
      { source: "/demo", destination: "/workspace", permanent: false },
      { source: "/cameras", destination: "/workspace/cameras", permanent: false },
      { source: "/videos", destination: "/workspace/videos", permanent: false },
      { source: "/search", destination: "/workspace/people", permanent: false },
      { source: "/results/demo", destination: "/workspace/journey", permanent: false },
      { source: "/multicam", destination: "/workspace/videos", permanent: false },
    ];
  },
  async rewrites() {
    const configuredBackend = process.env.BACKEND_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
    const backendOrigin = configuredBackend.startsWith("http") ? configuredBackend : `http://${configuredBackend}`;
    // Native demo handlers (including /jobs/[id]) must win before the legacy proxy.
    // Array-form rewrites run before dynamic routes and would hijack guest job URLs.
    return { fallback: [
      { source: "/health", destination: `${backendOrigin}/health` },
      { source: "/health/:path*", destination: `${backendOrigin}/health/:path*` },
      { source: "/api/:path*", destination: `${backendOrigin}/api/:path*` },
    ] };
  },
};

export default nextConfig;
