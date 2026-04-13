/**
 * KeiroAI CRM Pipeline - Shared constants and rules for all agents.
 *
 * Pipeline stages (in order):
 * identifie → contacte → relance_1 → relance_2 → relance_3 → repondu → demo → sprint → client
 *                                                     ↘ perdu (after 3 relances without response)
 *
 * Rules:
 * - identifie: prospect discovered but never contacted
 * - contacte: first contact made (email step 1 sent, or DM sent)
 * - relance_1: first follow-up sent (email step 2 or DM relance J+3)
 * - relance_2: second follow-up sent (email step 3)
 * - relance_3: third follow-up / FOMO sent (email step 4-5)
 * - repondu: prospect responded positively
 * - demo: demo/trial scheduled or free trial offered
 * - sprint: Essai gratuit actif (7 jours)
 * - client: paying customer
 * - perdu: 3+ relances without response, or explicit rejection
 */

export const PIPELINE_STAGES = [
  { id: 'identifie', label: 'Identifié', color: 'bg-slate-400', textColor: 'text-slate-700', borderColor: 'border-slate-400', hex: '#94A3B8', icon: '🔍', order: 0 },
  { id: 'contacte', label: 'Contacté', color: 'bg-[#0c1a3a]', textColor: 'text-[#0c1a3a]', borderColor: 'border-[#0c1a3a]', hex: '#0C1A3A', icon: '📨', order: 1 },
  { id: 'relance_1', label: 'Relance 1', color: 'bg-sky-400', textColor: 'text-sky-700', borderColor: 'border-sky-400', hex: '#38BDF8', icon: '🔄', order: 2 },
  { id: 'relance_2', label: 'Relance 2', color: 'bg-indigo-400', textColor: 'text-indigo-700', borderColor: 'border-indigo-400', hex: '#818CF8', icon: '🔄', order: 3 },
  { id: 'relance_3', label: 'Relance 3', color: 'bg-purple-400', textColor: 'text-purple-700', borderColor: 'border-purple-400', hex: '#C084FC', icon: '⏰', order: 4 },
  { id: 'repondu', label: 'Répondu', color: 'bg-violet-500', textColor: 'text-violet-700', borderColor: 'border-violet-500', hex: '#8B5CF6', icon: '💬', order: 5 },
  { id: 'demo', label: 'Démo', color: 'bg-amber-500', textColor: 'text-amber-700', borderColor: 'border-amber-500', hex: '#F59E0B', icon: '🎯', order: 6 },
  { id: 'sprint', label: 'Essai gratuit', color: 'bg-orange-500', textColor: 'text-orange-700', borderColor: 'border-orange-500', hex: '#F97316', icon: '🚀', order: 7 },
  { id: 'client', label: 'Client', color: 'bg-emerald-500', textColor: 'text-emerald-700', borderColor: 'border-emerald-500', hex: '#10B981', icon: '✅', order: 8 },
  { id: 'perdu', label: 'Perdu', color: 'bg-red-500', textColor: 'text-red-700', borderColor: 'border-red-500', hex: '#EF4444', icon: '✗', order: 9 },
] as const;

export type PipelineStageId = typeof PIPELINE_STAGES[number]['id'];

/**
 * Map email sequence steps to pipeline stages.
 * Used by agents to determine the correct CRM status after each action.
 */
export function getStageForEmailStep(step: number): PipelineStageId {
  switch (step) {
    case 1: return 'contacte';
    case 2: return 'relance_1';
    case 3: return 'relance_2';
    case 4:
    case 5: return 'relance_3';
    case 10: return 'contacte'; // warm follow-up
    default: return 'identifie';
  }
}

/**
 * Determine if a prospect should be marked as 'perdu' based on their history.
 * After 3 relances (email step >= 5) with no response → perdu.
 */
export function shouldMarkAsPerdu(prospect: {
  email_sequence_step?: number | null;
  email_sequence_status?: string | null;
  dm_status?: string | null;
  status?: string | null;
}): boolean {
  // Already responded, demo, sprint, or client → never mark as perdu
  const protectedStatuses = ['repondu', 'demo', 'sprint', 'client'];
  if (prospect.status && protectedStatuses.includes(prospect.status)) return false;

  // Completed full email sequence (5 steps) with no response → perdu
  if (prospect.email_sequence_status === 'completed' &&
      (prospect.email_sequence_step || 0) >= 5 &&
      prospect.status !== 'repondu') {
    return true;
  }

  return false;
}

/**
 * Check if a stage transition is valid (can only go forward, except for special cases).
 */
export function isValidTransition(currentStage: string, targetStage: string): boolean {
  const currentOrder = PIPELINE_STAGES.find(s => s.id === currentStage)?.order ?? 0;
  const targetOrder = PIPELINE_STAGES.find(s => s.id === targetStage)?.order ?? 0;

  // Can always go forward
  if (targetOrder > currentOrder) return true;

  // Special: can go to perdu from any stage
  if (targetStage === 'perdu') return true;

  // Special: can go back to identifie (reset)
  if (targetStage === 'identifie') return true;

  return false;
}

/**
 * Get the next expected stage for a prospect.
 */
export function getNextStage(currentStage: string): PipelineStageId | null {
  const current = PIPELINE_STAGES.find(s => s.id === currentStage);
  if (!current || current.id === 'client' || current.id === 'perdu') return null;

  const next = PIPELINE_STAGES.find(s => s.order === current.order + 1);
  return (next?.id as PipelineStageId) || null;
}
