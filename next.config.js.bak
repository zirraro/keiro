/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true }, // on fixe proprement après
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.bfmtv.com' },
      { protocol: 'https', hostname: '**.lemonde.fr' },
      { protocol: 'https', hostname: '**.lefigaro.fr' },
      { protocol: 'https', hostname: '**.francetvinfo.fr' },
      { protocol: 'https', hostname: '**.rfi.fr' },
      { protocol: 'https', hostname: '**.static' },
      { protocol: 'https', hostname: '**' },
    ],
  },
};
module.exports = nextConfig;
