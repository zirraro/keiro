'use client';
import { useToast as useRawToast } from './toast';

// Normalise l'API pour toujours exposer push(...)
export function useToastCompat() {
  const t: any = useRawToast?.() ?? {};
  const push =
    t.push ??
    t.show ??
    t.add ??
    t.notify ??
    ((args: any) => {
      const msg = typeof args === 'string' ? args : args?.text ?? 'Toast';
      console.log('[toast]', msg);
    });
  return { push };
}
