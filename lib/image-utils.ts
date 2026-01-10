/**
 * Utilitaires pour manipulation d'images
 */

/**
 * Convertit une URL d'image en data URL
 * Nécessaire pour les images externes sans CORS pour utiliser Canvas
 */
export async function convertUrlToDataUrl(imageUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Si c'est déjà une data URL, retourner directement
    if (imageUrl.startsWith('data:')) {
      resolve(imageUrl);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Cannot get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/png', 1.0);
        resolve(dataUrl);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error(`Failed to load image from URL: ${imageUrl.substring(0, 100)}`));
    };

    img.src = imageUrl;
  });
}

/**
 * Précharge une image pour s'assurer qu'elle est chargée avant utilisation
 */
export async function preloadImage(imageUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to preload image: ${imageUrl.substring(0, 100)}`));

    img.src = imageUrl;
  });
}
