/**
 * Ajoute un watermark "keiro.ai" discret sur une image
 * Utilisé pour les utilisateurs freemium (avec email ou compte sans plan payant)
 */

export interface WatermarkOptions {
  position?: 'bottom-right' | 'bottom-left' | 'bottom-center';
  opacity?: number;
  fontSize?: number;
}

export async function addWatermark(
  imageUrl: string,
  options: WatermarkOptions = {}
): Promise<string> {
  const {
    position = 'bottom-right',
    opacity = 0.6,
    fontSize = 14,
  } = options;

  console.log('[Watermark] Starting watermark with options:', {
    position,
    opacity,
    fontSize,
    imageUrlType: imageUrl.startsWith('data:') ? 'dataURL' : 'URL',
    imageUrlLength: imageUrl.length
  });

  return new Promise((resolve, reject) => {
    const img = new Image();

    // IMPORTANT: Ne pas définir crossOrigin pour les data URLs
    // Cela peut causer des erreurs de sécurité dans certains navigateurs
    if (!imageUrl.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      console.log('[Watermark] Image loaded successfully:', {
        width: img.width,
        height: img.height
      });
      try {
        // Créer canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Cannot get canvas context'));
          return;
        }

        // Définir taille du canvas = taille de l'image
        canvas.width = img.width;
        canvas.height = img.height;

        // Dessiner l'image originale
        ctx.drawImage(img, 0, 0);

        // Configuration du watermark
        ctx.font = `${fontSize}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.textBaseline = 'bottom';

        const watermarkText = 'keiro.ai';
        const textMetrics = ctx.measureText(watermarkText);
        const textWidth = textMetrics.width;
        const padding = 12;

        // Calculer position selon l'option
        let x: number;
        const y = canvas.height - padding;

        switch (position) {
          case 'bottom-left':
            x = padding;
            ctx.textAlign = 'left';
            break;
          case 'bottom-center':
            x = canvas.width / 2;
            ctx.textAlign = 'center';
            break;
          case 'bottom-right':
          default:
            x = canvas.width - padding;
            ctx.textAlign = 'right';
            break;
        }

        // Ajouter un fond semi-transparent pour meilleure lisibilité
        const bgPadding = 6;
        let bgX: number;
        let bgWidth: number;

        if (position === 'bottom-right') {
          bgX = canvas.width - textWidth - padding - bgPadding;
          bgWidth = textWidth + bgPadding * 2;
        } else if (position === 'bottom-left') {
          bgX = padding - bgPadding;
          bgWidth = textWidth + bgPadding * 2;
        } else {
          bgX = (canvas.width - textWidth) / 2 - bgPadding;
          bgWidth = textWidth + bgPadding * 2;
        }

        ctx.fillStyle = `rgba(0, 0, 0, ${opacity * 0.3})`;
        ctx.fillRect(
          bgX,
          y - fontSize - bgPadding,
          bgWidth,
          fontSize + bgPadding * 2
        );

        // Dessiner le texte watermark
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.fillText(watermarkText, x, y);

        // Convertir en data URL
        const dataUrl = canvas.toDataURL('image/png', 0.95);
        resolve(dataUrl);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    // Charger l'image
    img.src = imageUrl;
  });
}

/**
 * Vérifie si un utilisateur est freemium (a email ou compte mais pas de plan payant)
 */
export function isFreemiumUser(hasEmail: boolean, hasAccount: boolean, hasPremiumPlan: boolean): boolean {
  // Freemium = a fourni email OU créé compte, MAIS n'a pas de plan premium
  return (hasEmail || hasAccount) && !hasPremiumPlan;
}
