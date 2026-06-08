"use client";

import { useState } from 'react';
import { getOrdersForAgent } from '@/lib/agents/agent-orders-catalog';

interface AgentOrdersHintProps {
  agentId: string;
  /** Called when the user clicks an example to pre-fill the chat input. */
  onPickExample?: (text: string) => void;
  /** Compact: render as a discreet "?" icon that opens a popover, instead of an inline expanded card. */
  compact?: boolean;
}

/**
 * "Ce que tu peux me demander" — discoverable docs about the typed
 * directives this specific agent understands. Reduces the "I don't
 * know what to type" friction the founder flagged.
 */
export default function AgentOrdersHint({ agentId, onPickExample, compact = true }: AgentOrdersHintProps) {
  const [open, setOpen] = useState(false);
  const doc = getOrdersForAgent(agentId);
  if (!doc) return null;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`text-[11px] font-medium rounded-full transition-all ${
          compact
            ? 'px-2 py-1 border border-white/20 bg-white/5 text-white/70 hover:text-white hover:bg-white/10'
            : 'w-full px-3 py-2 bg-white/10 text-white/80 hover:bg-white/15'
        }`}
        aria-expanded={open}
        title="Ce que tu peux me demander"
      >
        {compact ? '💡 Que peux-tu lui demander ?' : '💡 Voir les ordres possibles'}
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-[min(92vw,520px)] right-0 rounded-2xl border border-white/10 bg-[#0c1a3a] shadow-2xl p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="text-sm font-bold text-white">Ce que tu peux demander à {doc.agentName}</h3>
              <p className="text-[11px] text-white/50 mt-0.5">{doc.description}</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/40 hover:text-white/80 -mt-1 -mr-1 p-1"
              aria-label="Fermer"
            >✕</button>
          </div>

          <ul className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            {doc.orders.map((o, i) => (
              <li key={i} className="rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
                <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-0.5">{o.intent}</div>
                <button
                  type="button"
                  onClick={() => {
                    onPickExample?.(o.example);
                    setOpen(false);
                  }}
                  className="text-xs text-white/85 text-left hover:text-cyan-300 transition w-full"
                  title="Cliquer pour pré-remplir le chat"
                >
                  « {o.example} »
                </button>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-[10px] text-white/40 text-center">
            Tu peux aussi formuler ta demande librement — {doc.agentName} comprendra.
          </p>
        </div>
      )}
    </div>
  );
}
