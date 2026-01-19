import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
  // Augmenter la limite de taille pour les API routes
  api: {
    bodyParser: {
      sizeLimit: '5mb',
    },
  },
};

export default nextConfig;
