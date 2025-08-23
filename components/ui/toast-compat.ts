'use client';
import { useToast as useRawToast } from './toast';

// Ce wrapper normalise l'API pour exposer { push(...) }
export function useToastCompat() {
  const t: any = useRawToast?.() ?? {};
  const push =
    t.push ??
    t.show ??
    t.add ??
    t.notify ??
    ((args: any) => {
      // fallback: log console pour ne pas casser en prod
      const msg = typeof args === 'string' ? args : args?.text ?? 'Toast';
      console.log('[toast]', msg);
    });

  return { push };
}
