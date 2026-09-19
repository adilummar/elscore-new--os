/** @type {import('next').NextConfig} */
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Enable standalone output on Linux/production (Hostinger), disable on Windows to avoid EPERM symlink errors.
const isWindows = process.platform === 'win32';

const nextConfig = {
  reactStrictMode: true,
  output: isWindows ? undefined : 'standalone',

  // Points Next.js to the monorepo root so it generates the correct nested
  // apps/web/ structure inside .next/standalone — this is what the deploy
  // scripts rely on when copying static assets.
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },

  env: {
    API_URL: process.env.API_URL,
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
          { 
            key: 'Content-Security-Policy', 
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https: http:;" 
          }
        ],
      },
    ];
  },
};

export default nextConfig;
