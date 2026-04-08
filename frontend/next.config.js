/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow large SoW file uploads through the rewrite proxy
  experimental: {
    proxyTimeout: 120_000,
    middlewareClientMaxBodySize: '25mb',
  },
  /**
   * Proxy /api/* requests to the FastAPI backend so the frontend can call
   * fetch('/api/sow', ...) without hard-coding the backend URL.
   *
   * In development the backend runs on http://localhost:8000 (or whatever
   * BACKEND_URL is set to in the shell environment).
   * In Docker Compose the service name is "backend" on port 8000.
   */
  async rewrites() {
    const backendUrl =
      process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
