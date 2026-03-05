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
 * Batch-fix source and status for all prospects based on their notes content + data
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

    // Load ALL prospects (Supabase default limit = 1000, so paginate)
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
    let planFixed = 0;
    const updates: { id: string; data: Record<string, unknown> }[] = [];

    for (const p of (prospects || [])) {
      const changes: Record<string, unknown> = {};
      const notes = (p.notes || '').toLowerCase();
      const notesRaw = p.notes || '';

      // ─── Fix source ───────────────────────────────────────────
      if (!p.source || p.source === 'import' || p.source === 'other') {
        // Detect from notes content
        if (notes.includes('zone terrain') || notes.includes('date visite') || notes.includes('résultat visite') || notes.includes('resultat visite') || notes.includes('créneau visite') || notes.includes('creneau visite')) {
          changes.source = 'terrain';
        }
        // Detect from data: has instagram + no other clue → dm_instagram
        else if (p.instagram && !p.phone && !p.email) {
          changes.source = 'dm_instagram';
        }
        // Has phone → telephone
        else if (p.phone && !p.instagram && !p.email) {
          changes.source = 'telephone';
        }
        // Has email → email
        else if (p.email && !p.instagram && !p.phone) {
          changes.source = 'email';
        }
        // Has instagram (even with other data) → default to dm_instagram
        else if (p.instagram) {
          changes.source = 'dm_instagram';
        }

        if (changes.source) sourceFixed++;
      }

      // ─── Fix status from notes ────────────────────────────────
      if (p.status === 'identifie') {
        // Sprint vendu
        const sprintMatch = notesRaw.match(/Sprint vendu[:\s]*([^\n|]+)/i);
        if (sprintMatch) {
          const val = normalize(sprintMatch[1]);
          if (['oui', 'yes', '1', 'vrai', 'true', 'vendu', 'ok', 'fait'].some(k => val.includes(k))) {
            changes.status = 'sprint';
            if (!p.matched_plan) {
              changes.matched_plan = 'sprint';
              planFixed++;
            }
            statusFixed++;
          }
        }

        // Converti Pro/Fond
        const convertiMatch = notesRaw.match(/Converti[^:\n]*[:\s]*([^\n|]+)/i);
        if (convertiMatch) {
          const val = normalize(convertiMatch[1]);
          if (['oui', 'yes', '1', 'vrai', 'true', 'converti', 'ok'].some(k => val.includes(k))) {
            changes.status = 'client';
            if (!p.matched_plan) {
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

        // Résultat visite positive → at least 'contacte'
        if (!changes.status) {
          const rvMatch = notesRaw.match(/[Rr][ée]sultat visite[:\s]*([^\n|]+)/);
          if (rvMatch) {
            const val = normalize(rvMatch[1]);
            if (['interesse', 'positif', 'rdv', 'rappeler', 'a rappeler', 'ok', 'demo'].some(k => val.includes(k))) {
              changes.status = 'repondu';
              statusFixed++;
            } else if (val && !['non', 'absent', 'ferme', 'refuse', 'rien', '-', ''].includes(val.trim())) {
              changes.status = 'contacte';
              statusFixed++;
            }
          }
        }

        // Has Date visite but no résultat → at least 'contacte' (visite = contact)
        if (!changes.status && (notes.includes('date visite') || notes.includes('zone terrain'))) {
          changes.status = 'contacte';
          statusFixed++;
        }
      }

      if (Object.keys(changes).length > 0) {
        changes.updated_at = new Date().toISOString();
        updates.push({ id: p.id, data: changes });
      }
    }

    // Batch update (50 at a time)
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
      total: (prospects || []).length,
      updated: updates.length,
      sourceFixed,
      statusFixed,
      planFixed,
      errors,
    });
  } catch (error: any) {
    console.error('[CRM Recategorize] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
