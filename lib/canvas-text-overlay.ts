/**
 * Utilitaire pour ajouter un texte overlay professionnel sur une image
 * Utilise Canvas HTML5 côté client pour un contrôle pixel-perfect
 */

export interface TextOverlayOptions {
  text: string;
  position?: 'top' | 'center' | 'bottom';
  style?: 'headline' | 'cta' | 'minimal';
  fontSize?: number;
  fontFamily?: string;
  textColor?: string;
  backgroundColor?: string;
  backgroundStyle?: 'clean' | 'none' | 'transparent' | 'solid' | 'gradient' | 'blur' | 'outline' | 'minimal' | 'glow';
  maxWidth?: number;
}

/**
 * Détecte si le texte est un CTA (Call-To-Action)
 */
function isCTA(text: string): boolean {
  return /\b(offre|promo|réduction|%|€|gratuit|limité|maintenant|découvr|inscri|réserv)/i.test(text);
}

/**
 * Calcule la taille de police optimale selon la longueur du texte
 */
function calculateFontSize(text: string, canvasWidth: number): number {
  const length = text.length;

  if (length < 20) return Math.min(canvasWidth * 0.08, 120); // Hero text
  if (length < 40) return Math.min(canvasWidth * 0.06, 80);  // Large
  if (length < 60) return Math.min(canvasWidth * 0.05, 60);  // Medium-large
  return Math.min(canvasWidth * 0.04, 48);                    // Medium
}

/**
 * Wrap le texte pour qu'il tienne dans la largeur max
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Ajoute un text overlay professionnel sur une image
 * @param imageUrl URL de l'image source
 * @param options Options de style du texte
 * @returns Promise<string> Data URL de l'image avec overlay
 */
export async function addTextOverlay(
  imageUrl: string,
  options: TextOverlayOptions
): Promise<string> {
  const {
    text,
    position = 'center',
    style = 'headline',
    fontSize: customFontSize,
    fontFamily = 'inter',
    textColor,
    backgroundColor,
    backgroundStyle,
  } = options;

  console.log('[TextOverlay] Starting overlay with options:', {
    text: text.substring(0, 50),
    position,
    style,
    fontSize: customFontSize,
    fontFamily,
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
      console.log('[TextOverlay] Image loaded successfully:', {
        width: img.width,
        height: img.height
      });
      try {
        // Créer canvas avec les dimensions de l'image
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error('Impossible de créer le contexte canvas');
        }

        // Dessiner l'image de base
        ctx.drawImage(img, 0, 0);

        // Détecter si c'est un CTA
        const isCallToAction = isCTA(text);

        // Calculer la taille de police (ou utiliser celle fournie)
        const fontSize = customFontSize || calculateFontSize(text, canvas.width);

        // Mapper les noms de police
        const fontFamilyMap: Record<string, string> = {
          'inter': 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
          'montserrat': 'Montserrat, -apple-system, BlinkMacSystemFont, sans-serif',
          'bebas': '"Bebas Neue", Impact, sans-serif',
          'roboto': 'Roboto, -apple-system, BlinkMacSystemFont, sans-serif',
          'playfair': '"Playfair Display", Georgia, serif',
        };

        const fontFamilyString = fontFamilyMap[fontFamily] || fontFamilyMap['inter'];

        // Configuration de la police
        ctx.font = `900 ${fontSize}px ${fontFamilyString}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Wrap le texte
        const maxTextWidth = canvas.width * 0.85; // 85% de la largeur
        const lines = wrapText(ctx, text, maxTextWidth);
        const lineHeight = fontSize * 1.2;
        const totalTextHeight = lines.length * lineHeight;

        // Calculer la position Y selon le paramètre position
        let baseY: number;
        if (position === 'top') {
          baseY = canvas.height * 0.25;
        } else if (position === 'bottom') {
          baseY = canvas.height * 0.75;
        } else {
          baseY = canvas.height * 0.5;
        }

        // Ajuster pour centrer verticalement le bloc de texte
        const startY = baseY - (totalTextHeight / 2) + (lineHeight / 2);

        // Déterminer les couleurs selon le style
        let finalTextColor = textColor || 'white';
        let finalBgColor = backgroundColor;

        if (!finalBgColor) {
          if (isCallToAction || style === 'cta') {
            // CTA avec background solide
            finalBgColor = 'rgba(59, 130, 246, 0.95)'; // blue-500
          } else {
            // Headline avec overlay transparent
            finalBgColor = 'rgba(0, 0, 0, 0.4)';
          }
        }

        // Dessiner le background pour chaque ligne (sauf si style sans fond)
        if (backgroundStyle !== 'clean' && backgroundStyle !== 'none' && backgroundStyle !== 'minimal') {
          lines.forEach((line, index) => {
            const y = startY + (index * lineHeight);
            const metrics = ctx.measureText(line);
            const textWidth = metrics.width;

            // Padding autour du texte
            const padding = isCallToAction || style === 'cta' ? 40 : 30;
            const bgWidth = textWidth + (padding * 2);
            const bgHeight = lineHeight + (padding * 0.8);
            const bgX = (canvas.width - bgWidth) / 2;
            const bgY = y - (bgHeight / 2);

            const radius = isCallToAction || style === 'cta' ? 16 : 12;

            // Fonction helper pour dessiner rectangle arrondi
            ctx.beginPath();
            ctx.moveTo(bgX + radius, bgY);
            ctx.lineTo(bgX + bgWidth - radius, bgY);
            ctx.arcTo(bgX + bgWidth, bgY, bgX + bgWidth, bgY + radius, radius);
            ctx.lineTo(bgX + bgWidth, bgY + bgHeight - radius);
            ctx.arcTo(bgX + bgWidth, bgY + bgHeight, bgX + bgWidth - radius, bgY + bgHeight, radius);
            ctx.lineTo(bgX + radius, bgY + bgHeight);
            ctx.arcTo(bgX, bgY + bgHeight, bgX, bgY + bgHeight - radius, radius);
            ctx.lineTo(bgX, bgY + radius);
            ctx.arcTo(bgX, bgY, bgX + radius, bgY, radius);
            ctx.closePath();

            if (backgroundStyle === 'outline') {
              // Juste le contour
              ctx.strokeStyle = finalBgColor;
              ctx.lineWidth = 4;
              ctx.stroke();
            } else if (backgroundStyle === 'glow') {
              // Effet glow avec ombre étendue
              ctx.shadowColor = finalBgColor;
              ctx.shadowBlur = 30;
              ctx.fillStyle = finalBgColor;
              ctx.fill();
              // Reset shadow
              ctx.shadowColor = 'transparent';
              ctx.shadowBlur = 0;
            } else if (backgroundStyle === 'solid') {
              // Fond OPAQUE sans transparence
              // Convertir la couleur en RGB opaque
              const solidColor = finalBgColor.includes('rgba')
                ? finalBgColor.replace(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)/, 'rgb($1, $2, $3)')
                : finalBgColor.replace(/,\s*[\d.]+\)/, ', 1)');
              ctx.fillStyle = solidColor;
              ctx.fill();
            } else if (backgroundStyle === 'gradient') {
              // Gradient linéaire (haut vers bas)
              const gradient = ctx.createLinearGradient(bgX, bgY, bgX, bgY + bgHeight);
              // Extraire la couleur de base
              const baseColor = finalBgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
              if (baseColor) {
                const r = baseColor[1], g = baseColor[2], b = baseColor[3];
                gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.9)`);
                gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.7)`);
                gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.9)`);
              } else {
                gradient.addColorStop(0, finalBgColor);
                gradient.addColorStop(1, finalBgColor);
              }
              ctx.fillStyle = gradient;
              ctx.fill();
            } else if (backgroundStyle === 'blur') {
              // Effet blur simulé avec plusieurs couches légèrement transparentes
              ctx.shadowColor = finalBgColor;
              ctx.shadowBlur = 20;
              ctx.fillStyle = finalBgColor;
              ctx.fill();
              // Deuxième couche plus transparente
              const blurColor = finalBgColor.includes('rgba')
                ? finalBgColor.replace(/,\s*([\d.]+)\)/, ', 0.3)')
                : finalBgColor.replace('rgb', 'rgba').replace(')', ', 0.3)');
              ctx.fillStyle = blurColor;
              ctx.fill();
              // Reset shadow
              ctx.shadowColor = 'transparent';
              ctx.shadowBlur = 0;
            } else if (backgroundStyle === 'transparent') {
              // Fond transparent (comportement par défaut)
              ctx.fillStyle = finalBgColor;
              ctx.fill();
            } else {
              // Fallback: utiliser la couleur telle quelle
              ctx.fillStyle = finalBgColor;
              ctx.fill();
            }
          });
        }

        // Dessiner le texte avec outline pour contraste maximum
        lines.forEach((line, index) => {
          const y = startY + (index * lineHeight);

          // Styles adaptatifs selon backgroundStyle
          if (backgroundStyle === 'clean') {
            // Clean: VRAIMENT rien (juste le texte pur)
            // Pas d'ombre, pas de contour
          } else if (backgroundStyle === 'minimal') {
            // Minimal: ombre très légère, pas de contour
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            ctx.shadowBlur = fontSize * 0.08;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = fontSize * 0.03;
          } else if (backgroundStyle === 'none') {
            // None: contour + ombre forts pour fort contraste
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
            ctx.lineWidth = fontSize * 0.10;
            ctx.strokeText(line, canvas.width / 2, y);
            ctx.shadowColor = 'rgba(0, 0, 0, 1)';
            ctx.shadowBlur = fontSize * 0.25;
            ctx.shadowOffsetX = 4;
            ctx.shadowOffsetY = 4;
          } else {
            // Autres styles: contour + ombre normaux
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.lineWidth = fontSize * 0.05;
            ctx.strokeText(line, canvas.width / 2, y);
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = fontSize * 0.15;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = fontSize * 0.05;
          }

          // Texte principal
          ctx.fillStyle = finalTextColor;
          ctx.fillText(line, canvas.width / 2, y);

          // Reset shadow
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        });

        // Convertir en data URL
        const dataUrl = canvas.toDataURL('image/png', 0.95);
        resolve(dataUrl);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error('Erreur de chargement de l\'image'));
    };

    img.src = imageUrl;
  });
}

/**
 * Convertit un data URL en Blob pour upload
 */
export function dataURLtoBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }

  return new Blob([u8arr], { type: mime });
}
