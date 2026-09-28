const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Lets a second build (e.g. a local smoke test) live beside the dev server's .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // Development convenience: the browser talks to one origin and /api is proxied
  // to Express. In production Nginx routes /api directly to the API process.
  // API_URL is server-side only and never exposed to the browser bundle.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_URL || 'http://127.0.0.1:4600'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
