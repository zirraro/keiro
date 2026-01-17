import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externaliser les modules natifs pour éviter le bundling webpack
      config.externals = config.externals || [];
      config.externals.push('@napi-rs/canvas');
    }
    return config;
  },
};

export default nextConfig;
