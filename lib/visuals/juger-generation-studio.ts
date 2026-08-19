import { createClient } from '@supabase/supabase-js';

/**
 * Noter ce qui sort du Studio et de la Galerie, comme on note ce que font les agents.
 *
 * ── Pourquoi ce module existe ──
 *
 * 2026-08-19, le fondateur : « toutes les générations doivent être jugées […]
 * on a Léna, on a à la demande via chat, on a via galerie et via studio, tous
 * les chemins doivent être notés et jugés ».
 *
 * Le comptage lui a donné raison : le juge tournait sur le chemin des agents
 * (portail de publication + agent contenu) et nulle part ailleurs. Tout ce qui
 * sortait du Studio ou de la Galerie partait sans être regardé — donc sans note
 * et sans trace. Deux effets, dont le second est le plus coûteux : le client
 * pouvait recevoir une image que l'agent aurait écartée, et surtout ces
 * générations ne nourrissaient rien. Aucune raison consignée, ni positive ni
 * négative, alors que c'est précisément ce qui fait progresser les prompts.
 *
 * ── Deux règles tenues ici, et pas ailleurs ──
 *
 * On note SANS BLOQUER. Le client garde l'image qu'il a payée en crédits ; une
 * panne de notre côté ne lui prend pas sa génération. Mais on l'enregistre au
 * lieu de la maquiller en succès — `indisponible` n'est pas un verdict
 * favorable, c'est l'aveu que le contrôle n'a pas eu lieu.
 *
 * L'écriture est ATTENDUE. Un insert lancé sans `await` est perdu dès que la
 * réponse HTTP part la première : c'est exactement ce qui avait fait croire
 * pendant des jours que le juge ne rendait aucune note.
 *
 * ── Pourquoi un module et pas un bloc recopié ──
 *
 * Le premier réflexe était de coller le même bloc dans t2i puis dans i2i. Deux
 * implémentations d'une même chose finissent toujours par diverger — on l'a
 * déjà payé avec les carrousels et avec `image-qa` qui appelait Anthropic en
 * direct pendant que le reste du code passait par la chaîne à repli. Un seul
 * endroit, donc, et les deux routes l'appellent.
 */

export type NoteGeneration = { verdict: string; motif?: string };

export async function jugerGenerationStudio(input: {
  imageUrl: string;
  /** Le brief effectivement envoyé au générateur, pas la demande brute. */
  brief: string;
  /** D'où vient la génération : sert à comparer les chemins entre eux. */
  chemin: 'studio_t2i' | 'studio_i2i' | 'galerie' | 'chat';
  businessType?: string;
  userId?: string | null;
  fournisseur?: string;
}): Promise<NoteGeneration> {
  try {
    const { reviewGeneratedImage } = await import('./image-qa');
    const v = await reviewGeneratedImage({
      imageUrl: input.imageUrl,
      visualBrief: input.brief,
      businessType: input.businessType,
    });
    const motif = v.issue || v.raisonIndisponible || undefined;

    try {
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      await sb.from('agent_logs').insert({
        agent: 'content',
        action: 'qc_verdict',
        status: v.verdict === 'hard_fail' ? 'warning' : 'ok',
        user_id: input.userId ?? null,
        data: {
          chemin: input.chemin,
          verdict: v.verdict,
          motif: motif ?? null,
          fournisseur: input.fournisseur ?? null,
          brief: input.brief.slice(0, 400),
          image_url: input.imageUrl,
        },
        created_at: new Date().toISOString(),
      });
    } catch (e: any) {
      // La trace qui tombe ne doit pas effacer la note déjà obtenue.
      console.warn(`[Juge ${input.chemin}] note non journalisée :`, e?.message);
    }

    return { verdict: v.verdict, motif };
  } catch (e: any) {
    // Le juge qui tombe ne prend pas l'image du client avec lui — mais on le
    // dit, au lieu de laisser croire que le contrôle a eu lieu.
    console.warn(`[Juge ${input.chemin}] indisponible :`, e?.message);
    return { verdict: 'indisponible', motif: String(e?.message ?? '').slice(0, 120) };
  }
}
