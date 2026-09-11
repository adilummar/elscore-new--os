import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Strict mode for catching potential issues
  reactStrictMode: true,

  // API URL for server-side requests
  env: {
    API_URL: process.env.API_URL ?? 'http://localhost:3001/api/v1',
  },

  // Headers for security
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
