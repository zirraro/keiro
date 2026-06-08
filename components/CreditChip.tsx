"use client";

import { useState } from 'react';
import CreditBalanceChip from './CreditBalanceChip';
import CreditPackModal from './CreditPackModal';

/**
 * Self-contained credit chip — drop anywhere in a page header.
 * Owns its own pack-modal state so consumers don't have to plumb it.
 *
 * Founder rule 2026-06-09 : discreet, no stress about remaining credits.
 * The chip itself is silent when ≥ 50% remaining (just "X cr").
 */
export default function CreditChip({ source = 'nav' }: { source?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <CreditBalanceChip onBuyPack={() => setOpen(true)} />
      {open && (
        <CreditPackModal
          reason="manual"
          source={source}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
