import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getAdminClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function normalize(str: string): string {
  return str.toString().trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * POST /api/admin/crm/recategorize
 *
 * Logique CRM experte :
 *
 * SOURCE (canal d'acquisition) :
 * - Notes contiennent "Résultat visite" / "Créneau visite" → terrain (une visite terrain a eu lieu ou est planifiée)
 * - Sinon on ne devine PAS le canal, on laisse tel quel
 *
 * STATUS (avancement pipeline) — uniquement avec preuve explicite :
 * - "Sprint vendu: Oui" → sprint + matched_plan
 * - "Converti: Oui" → client + matched_plan
 * - "Résultat visite" avec mots positifs EXPLICITES (intéressé, rdv pris, demo) → repondu
 * - PAS de changement pour "Zone terrain" seul, "Date visite" seul, ou résultat neutre/négatif
 *
 * RESET : prospects incorrectement passés en "contacté" par la version précédente
 * sont remis en "identifié" s'ils n'ont aucune preuve de contact réel
 */
export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const supabase = getAdminClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    // Load ALL prospects (paginated)
    const prospects: any[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    while (true) {
      const { data: page, error: loadError } = await supabase
        .from('crm_prospects')
        .select('id, source, status, notes, instagram, phone, email, matched_plan')
        .range(from, from + PAGE_SIZE - 1)
        .order('created_at', { ascending: true });

      if (loadError) {
        return NextResponse.json({ error: loadError.message }, { status: 500 });
      }
      if (!page || page.length === 0) break;
      prospects.push(...page);
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    let sourceFixed = 0;
    let statusFixed = 0;
    let statusReset = 0;
    let planFixed = 0;
    const updates: { id: string; data: Record<string, unknown> }[] = [];

    // Mots-clés positifs EXPLICITES pour Résultat visite (preuve de réponse/intérêt)
    const POSITIVE_RESULTS = ['interesse', 'interessé', 'interessee', 'positif', 'rdv', 'rendez-vous', 'rappeler', 'a rappeler', 'demo', 'demonstration', 'ok partant', 'partant', 'veut essayer', 'enthousiaste', 'curieux', 'curieuse', 'motivé', 'motivee'];

    // Mots-clés négatifs / neutres pour Résultat visite (PAS de changement de statut)
    const NEGATIVE_NEUTRAL_RESULTS = ['non', 'absent', 'absente', 'ferme', 'fermé', 'fermee', 'refuse', 'refusé', 'refusee', 'pas interesse', 'pas intéressé', 'pas la', 'rien', 'porte fermee', 'pas ouvert', 'trop petit', 'deja client', 'deja equipe', 'ne repond pas', 'injoignable', 'pas de reponse', 'raccroche', 'occupe'];

    for (const p of prospects) {
      const changes: Record<string, unknown> = {};
      const notesRaw = p.notes || '';
      const notesLower = notesRaw.toLowerCase();
      const notesNorm = normalize(notesRaw);

      // ═══════════════════════════════════════════════════════════
      // 1. FIX SOURCE (canal d'acquisition)
      // ═══════════════════════════════════════════════════════════
      if (!p.source || p.source === 'import' || p.source === 'other') {
        // Terrain : preuve d'activité terrain dans les notes
        const hasTerrainActivity = notesLower.includes('résultat visite') || notesLower.includes('resultat visite') ||
          notesLower.includes('créneau visite') || notesLower.includes('creneau visite') ||
          notesLower.includes('meilleur créneau') || notesLower.includes('meilleur creneau');

        // Zone terrain seule = le prospect VIENT d'un fichier terrain
        const hasZoneTerrain = notesLower.includes('zone terrain');

        if (hasTerrainActivity || hasZoneTerrain) {
          changes.source = 'terrain';
          sourceFixed++;
        }
      }

      // ═══════════════════════════════════════════════════════════
      // 2. FIX STATUS (uniquement avec preuve explicite)
      // ═══════════════════════════════════════════════════════════

      // 2a. RESET : annuler les "contacté" incorrects de la version précédente
      // Un prospect "contacté" sans preuve réelle → retour en "identifié"
      if (p.status === 'contacte') {
        const hasSprintVendu = notesNorm.includes('sprint vendu') && POSITIVE_RESULTS.some(k => {
          const match = notesRaw.match(/Sprint vendu[:\s]*([^\n|]+)/i);
          return match && ['oui', 'yes', '1', 'vendu', 'ok', 'fait'].some(v => normalize(match[1]).includes(v));
        });
        const hasConverti = notesNorm.includes('converti') && (() => {
          const match = notesRaw.match(/Converti[^:\n]*[:\s]*([^\n|]+)/i);
          return match && ['oui', 'yes', '1', 'converti', 'ok'].some(v => normalize(match[1]).includes(v));
        })();
        const hasPositiveVisite = (() => {
          const match = notesRaw.match(/[Rr][eé]sultat visite[:\s]*([^\n|]+)/i);
          if (!match) return false;
          const val = normalize(match[1]);
          return POSITIVE_RESULTS.some(k => val.includes(normalize(k)));
        })();

        // Si aucune preuve réelle de contact → reset en identifié
        if (!hasSprintVendu && !hasConverti && !hasPositiveVisite) {
          changes.status = 'identifie';
          statusReset++;
        }
      }

      // 2b. Avancer le statut uniquement avec preuve EXPLICITE
      if (p.status === 'identifie' || changes.status === 'identifie') {
        // Sprint vendu = Oui → status sprint
        const sprintMatch = notesRaw.match(/Sprint vendu[:\s]*([^\n|]+)/i);
        if (sprintMatch) {
          const val = normalize(sprintMatch[1]);
          if (['oui', 'yes', '1', 'vendu', 'ok', 'fait'].some(k => val.includes(k))) {
            changes.status = 'sprint';
            if (!p.matched_plan && !changes.matched_plan) {
              changes.matched_plan = 'sprint';
              planFixed++;
            }
            statusFixed++;
          }
        }

        // Converti Pro/Fond = Oui → status client (priorité sur sprint)
        const convertiMatch = notesRaw.match(/Converti[^:\n]*[:\s]*([^\n|]+)/i);
        if (convertiMatch) {
          const val = normalize(convertiMatch[1]);
          if (['oui', 'yes', '1', 'converti', 'ok'].some(k => val.includes(k))) {
            changes.status = 'client';
            if (!p.matched_plan && !changes.matched_plan) {
              if (val.includes('fond') || val.includes('fondateur')) {
                changes.matched_plan = 'fondateurs';
              } else if (val.includes('pro') || val.includes('standard')) {
                changes.matched_plan = 'standard';
              } else {
                changes.matched_plan = 'client';
              }
              planFixed++;
            }
            statusFixed++;
          }
        }

        // Résultat visite POSITIF UNIQUEMENT → repondu
        if (!changes.status || changes.status === 'identifie') {
          const rvMatch = notesRaw.match(/[Rr][eé]sultat visite[:\s]*([^\n|]+)/i);
          if (rvMatch) {
            const val = normalize(rvMatch[1]).trim();
            // Seulement si le résultat est EXPLICITEMENT positif
            const isPositive = POSITIVE_RESULTS.some(k => val.includes(normalize(k)));
            const isNegative = NEGATIVE_NEUTRAL_RESULTS.some(k => val.includes(normalize(k)));

            if (isPositive && !isNegative) {
              changes.status = 'repondu';
              statusFixed++;
            }
            // Résultat négatif/neutre → on ne change PAS le statut
          }
        }
      }

      // ═══════════════════════════════════════════════════════════
      // 3. Appliquer les changements
      // ═══════════════════════════════════════════════════════════
      if (Object.keys(changes).length > 0) {
        changes.updated_at = new Date().toISOString();
        updates.push({ id: p.id, data: changes });
      }
    }

    // Batch update (50 at a time, parallel)
    let errors = 0;
    const BATCH = 50;
    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(({ id, data }) =>
          supabase.from('crm_prospects').update(data).eq('id', id).then(r => r.error)
        )
      );
      for (const err of results) {
        if (err) errors++;
      }
    }

    return NextResponse.json({
      ok: true,
      total: prospects.length,
      updated: updates.length,
      sourceFixed,
      statusFixed,
      statusReset,
      planFixed,
      errors,
    });
  } catch (error: any) {
    console.error('[CRM Recategorize] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
