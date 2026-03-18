import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Keiro - Visuels Marketing IA',
    short_name: 'Keiro',
    description: 'Créez des visuels marketing professionnels avec l\'IA',
    start_url: '/',
    display: 'standalone',
    background_color: '#0c1a3a',
    theme_color: '#0c1a3a',
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
