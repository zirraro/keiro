'use client';

import { useEffect, useState, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';

const supabaseBrowser = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

type PersonalizationData = {
  detail?: string;
  follow_up_7d?: string;
  response_interested?: string;
  response_skeptical?: string;
  tone_notes?: string;
  business_type?: string;
  strategy?: string;
  dm_text?: string;
  follow_up?: string;
};

type DMItem = {
  id: string;
  prospect_id: string;
  channel: string;
  handle: string;
  message: string;
  followup_message: string | null;
  personalization: string | null;
  status: string;
  priority: number;
  created_at: string;
  sent_at: string | null;
  response_type: string | null;
  prospect?: {
    company: string;
    type: string | null;
    quartier: string | null;
    google_rating: number | null;
    google_reviews: number | null;
    score: number | null;
  };
};

function parsePersonalization(raw: string | null): PersonalizationData | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export default function DMQueuePage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<DMItem[]>([]);
  const [tab, setTab] = useState<'pending' | 'sent' | 'responded'>('pending');
  const [isAdmin, setIsAdmin] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const router = useRouter();

  const fetchQueue = useCallback(async () => {
    const supabase = supabaseBrowser();

    // Check admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) { router.push('/'); return; }
    setIsAdmin(true);

    // Fetch DM queue
    let query = supabase
      .from('dm_queue')
      .select('*, prospect:crm_prospects(company, type, quartier, google_rating, google_reviews, score)')
      .order('priority', { ascending: false });

    if (tab === 'pending') {
      query = query.eq('status', 'pending');
    } else if (tab === 'sent') {
      query = query.in('status', ['sent', 'no_response']);
    } else {
      query = query.eq('status', 'responded');
    }

    const { data } = await query.limit(50);
    setItems((data as any) || []);
    setLoading(false);
  }, [tab, router]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const updateStatus = async (id: string, status: string, responseType?: string) => {
    const supabase = supabaseBrowser();
    const updates: any = { status };
    if (status === 'sent') {
      updates.sent_at = new Date().toISOString();
    }
    if (responseType) {
      updates.response_type = responseType;
    }

    await supabase.from('dm_queue').update(updates).eq('id', id);

    // Also update prospect dm_status
    const item = items.find(i => i.id === id);
    if (item?.prospect_id) {
      const prospectUpdates: any = { updated_at: new Date().toISOString() };

      if (status === 'sent') {
        prospectUpdates.dm_status = 'sent';
        prospectUpdates.dm_sent_at = new Date().toISOString();
        prospectUpdates.dm_followup_date = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
      } else if (status === 'responded' && responseType === 'interested') {
        prospectUpdates.dm_status = 'responded_positive';
        prospectUpdates.temperature = 'hot';
      } else if (status === 'responded' && responseType === 'not_interested') {
        prospectUpdates.dm_status = 'responded_negative';
        prospectUpdates.status = 'lost';
      } else if (status === 'skipped') {
        prospectUpdates.dm_status = 'none';
      }

      await supabase.from('crm_prospects').update(prospectUpdates).eq('id', item.prospect_id);
    }

    fetchQueue();
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">File DM du jour</h1>
            <p className="text-sm text-neutral-500 mt-1">
              Messages personnalisés prêts à envoyer
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fetchQueue()}
              className="px-3 py-1.5 text-xs bg-white border rounded-lg hover:bg-neutral-50"
            >
              Actualiser
            </button>
            <a href="/admin/agents" className="px-3 py-1.5 text-xs bg-white border rounded-lg hover:bg-neutral-50">
              Agents IA
            </a>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-neutral-100 p-1 rounded-lg mb-6 w-fit">
          {([
            { key: 'pending' as const, label: `En attente (${tab === 'pending' ? items.length : '...'})` },
            { key: 'sent' as const, label: 'Envoyés' },
            { key: 'responded' as const, label: 'Réponses' },
          ]).map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setLoading(true); }}
              className={`px-4 py-2 text-xs font-medium rounded-md transition ${
                tab === t.key ? 'bg-white shadow text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12 text-neutral-400">Chargement...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-neutral-400">
            {tab === 'pending' ? 'Aucun DM en attente. Lancez l\'agent DM pour préparer la file.' : 'Aucun élément.'}
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item, i) => {
              const prospect = Array.isArray(item.prospect) ? item.prospect[0] : item.prospect;
              return (
                <div key={item.id} className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                  {/* Header */}
                  <div className="px-4 py-3 bg-neutral-50 border-b flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-neutral-400">#{i + 1}</span>
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">
                          {prospect?.company || 'Inconnu'}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {item.channel === 'instagram' ? '📸' : '🎵'} {item.handle}
                          {prospect?.quartier && ` · ${prospect.quartier}`}
                          {prospect?.type && ` · ${prospect.type}`}
                          {prospect?.google_rating && ` · ${prospect.google_rating}/5`}
                          {prospect?.google_reviews && ` (${prospect.google_reviews} avis)`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {prospect?.score && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          prospect.score >= 50 ? 'bg-red-100 text-red-700' :
                          prospect.score >= 25 ? 'bg-orange-100 text-orange-700' :
                          'bg-neutral-100 text-neutral-600'
                        }`}>
                          Score {prospect.score}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Message */}
                  <div className="px-4 py-3">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed">
                      {item.message}
                    </div>
                    {(() => {
                      const perso = parsePersonalization(item.personalization);
                      const persoText = perso?.detail || perso?.strategy || item.personalization;
                      return (
                        <>
                          {persoText && (
                            <p className="text-[10px] text-neutral-400 mt-1.5 italic">
                              Personnalisation : {persoText}
                              {perso?.tone_notes && ` · Ton : ${perso.tone_notes}`}
                            </p>
                          )}
                          <button
                            onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                            className="text-[10px] text-blue-500 hover:underline mt-1"
                          >
                            {expandedId === item.id ? '▲ Masquer les réponses types' : '▼ Voir relances & réponses types'}
                          </button>
                          {expandedId === item.id && (
                            <div className="mt-3 space-y-2">
                              {item.followup_message && (
                                <div className="relative">
                                  <p className="text-[10px] font-bold text-orange-600 mb-1">Relance J+3 :</p>
                                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5 text-xs text-neutral-700 whitespace-pre-wrap">
                                    {item.followup_message}
                                  </div>
                                  <button onClick={() => copyToClipboard(item.followup_message!, `${item.id}-f3`)} className={`absolute top-0 right-0 text-[10px] px-2 py-0.5 rounded ${copiedId === `${item.id}-f3` ? 'bg-green-500 text-white' : 'bg-orange-100 text-orange-600 hover:bg-orange-200'}`}>
                                    {copiedId === `${item.id}-f3` ? '✓' : '📋'}
                                  </button>
                                </div>
                              )}
                              {perso?.follow_up_7d && (
                                <div className="relative">
                                  <p className="text-[10px] font-bold text-red-600 mb-1">Relance J+7 (dernier message + CTA) :</p>
                                  <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-neutral-700 whitespace-pre-wrap">
                                    {perso.follow_up_7d}
                                  </div>
                                  <button onClick={() => copyToClipboard(perso.follow_up_7d!, `${item.id}-f7`)} className={`absolute top-0 right-0 text-[10px] px-2 py-0.5 rounded ${copiedId === `${item.id}-f7` ? 'bg-green-500 text-white' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}>
                                    {copiedId === `${item.id}-f7` ? '✓' : '📋'}
                                  </button>
                                </div>
                              )}
                              {perso?.response_interested && (
                                <div className="relative">
                                  <p className="text-[10px] font-bold text-green-600 mb-1">Si intéressé → CTA Sprint/49€ :</p>
                                  <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 text-xs text-neutral-700 whitespace-pre-wrap">
                                    {perso.response_interested}
                                  </div>
                                  <button onClick={() => copyToClipboard(perso.response_interested!, `${item.id}-ri`)} className={`absolute top-0 right-0 text-[10px] px-2 py-0.5 rounded ${copiedId === `${item.id}-ri` ? 'bg-green-500 text-white' : 'bg-green-100 text-green-600 hover:bg-green-200'}`}>
                                    {copiedId === `${item.id}-ri` ? '✓' : '📋'}
                                  </button>
                                </div>
                              )}
                              {perso?.response_skeptical && (
                                <div className="relative">
                                  <p className="text-[10px] font-bold text-amber-600 mb-1">Si sceptique → Preuve sociale :</p>
                                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-neutral-700 whitespace-pre-wrap">
                                    {perso.response_skeptical}
                                  </div>
                                  <button onClick={() => copyToClipboard(perso.response_skeptical!, `${item.id}-rs`)} className={`absolute top-0 right-0 text-[10px] px-2 py-0.5 rounded ${copiedId === `${item.id}-rs` ? 'bg-green-500 text-white' : 'bg-amber-100 text-amber-600 hover:bg-amber-200'}`}>
                                    {copiedId === `${item.id}-rs` ? '✓' : '📋'}
                                  </button>
                                </div>
                              )}
                              {perso?.dm_text && (
                                <div className="relative">
                                  <p className="text-[10px] font-bold text-purple-600 mb-1">DM TikTok à envoyer :</p>
                                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-2.5 text-xs text-neutral-700 whitespace-pre-wrap">
                                    {perso.dm_text}
                                  </div>
                                  <button onClick={() => copyToClipboard(perso.dm_text!, `${item.id}-dm`)} className={`absolute top-0 right-0 text-[10px] px-2 py-0.5 rounded ${copiedId === `${item.id}-dm` ? 'bg-green-500 text-white' : 'bg-purple-100 text-purple-600 hover:bg-purple-200'}`}>
                                    {copiedId === `${item.id}-dm` ? '✓' : '📋'}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* Actions */}
                  <div className="px-4 py-3 border-t bg-neutral-50">
                    {tab === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => copyToClipboard(item.message, item.id)}
                          className={`flex-1 py-2 text-xs font-medium rounded-lg transition ${
                            copiedId === item.id
                              ? 'bg-green-600 text-white'
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          {copiedId === item.id ? '✓ Copié !' : '📋 Copier le texte'}
                        </button>
                        <a
                          href={item.channel === 'tiktok'
                            ? `https://tiktok.com/@${item.handle.replace('@', '')}`
                            : `https://instagram.com/${item.handle.replace('@', '')}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex-1 py-2 text-xs font-medium text-white text-center rounded-lg hover:opacity-90 transition ${
                            item.channel === 'tiktok'
                              ? 'bg-gradient-to-r from-cyan-600 to-blue-600'
                              : 'bg-gradient-to-r from-purple-600 to-pink-600'
                          }`}
                        >
                          {item.channel === 'tiktok' ? 'Ouvrir TikTok' : 'Ouvrir Instagram'}
                        </a>
                        <button
                          onClick={() => updateStatus(item.id, 'sent')}
                          className="px-4 py-2 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                        >
                          Fait ✓
                        </button>
                        <button
                          onClick={() => updateStatus(item.id, 'skipped')}
                          className="px-3 py-2 text-xs text-neutral-500 border rounded-lg hover:bg-neutral-100 transition"
                        >
                          Passer
                        </button>
                      </div>
                    )}

                    {tab === 'sent' && (
                      <div className="space-y-2">
                        {item.followup_message && (
                          <button
                            onClick={() => copyToClipboard(item.followup_message!, `${item.id}-followup`)}
                            className={`w-full py-2 text-xs font-medium rounded-lg transition ${
                              copiedId === `${item.id}-followup`
                                ? 'bg-green-600 text-white'
                                : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                            }`}
                          >
                            {copiedId === `${item.id}-followup` ? '✓ Copié !' : '📋 Copier la relance'}
                          </button>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => updateStatus(item.id, 'responded', 'interested')}
                            className="flex-1 py-2 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700"
                          >
                            A répondu OUI
                          </button>
                          <button
                            onClick={() => updateStatus(item.id, 'responded', 'not_interested')}
                            className="flex-1 py-2 text-xs font-medium bg-red-500 text-white rounded-lg hover:bg-red-600"
                          >
                            Pas intéressé
                          </button>
                          <button
                            onClick={() => updateStatus(item.id, 'no_response')}
                            className="flex-1 py-2 text-xs border rounded-lg hover:bg-neutral-100"
                          >
                            Pas de réponse
                          </button>
                        </div>
                      </div>
                    )}

                    {tab === 'responded' && item.response_type && (
                      <p className={`text-xs font-medium ${
                        item.response_type === 'interested' ? 'text-green-600' : 'text-red-500'
                      }`}>
                        {item.response_type === 'interested' ? '🔥 Intéressé — Créer un visuel perso !' : '❌ Pas intéressé'}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
