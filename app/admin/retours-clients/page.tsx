'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import Link from 'next/link';
import FeedbackPopup from '@/components/FeedbackPopup';
import FeedbackModal from '@/components/FeedbackModal';
import { useFeedbackPopup } from '@/hooks/useFeedbackPopup';

export default function AdminRetoursClientsPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const feedback = useFeedbackPopup();

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Tabs: demandes first (default), questionnaires second
  const [activeTab, setActiveTab] = useState<'demandes' | 'questionnaires'>('demandes');

  // Questionnaires state
  const [feedbackStats, setFeedbackStats] = useState<any>(null);
  const [feedbackComments, setFeedbackComments] = useState<any[]>([]);
  const [feedbackTotal, setFeedbackTotal] = useState(0);

  // Demandes state
  const [contactRequests, setContactRequests] = useState<any[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [adminReply, setAdminReply] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminAttachment, setAdminAttachment] = useState<string | null>(null);
  const [adminUploading, setAdminUploading] = useState(false);
  const adminFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { router.push('/login'); return; }
      setUser(session.user);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (!profileData?.is_admin) { router.push('/'); return; }
      setProfile(profileData);
      setLoading(false);

      // Auto-load demandes (default tab)
      loadContactRequests();
      // Mark as read
      localStorage.setItem('keiro_support_last_read', new Date().toISOString());
    };
    init();
  }, [supabase, router]);

  const loadFeedbackStats = async () => {
    try {
      const res = await fetch('/api/feedback');
      if (res.ok) {
        const data = await res.json();
        setFeedbackStats(data.stats);
        setFeedbackComments(data.comments || []);
        setFeedbackTotal(data.total || 0);
      }
    } catch (e) { console.error('[Admin] Feedback load error:', e); }
  };

  const loadContactRequests = async () => {
    try {
      const res = await fetch('/api/contact-requests');
      if (res.ok) {
        const data = await res.json();
        setContactRequests(data.requests || []);
      }
    } catch (e) { console.error('[Admin] Contacts load error:', e); }
  };

  const handleAdminReply = async (requestId: string) => {
    if (!adminReply.trim() && !adminAttachment) return;
    setAdminLoading(true);
    try {
      const res = await fetch(`/api/contact-requests/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: adminReply || '', image: adminAttachment || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedRequest(data.request);
        setContactRequests(prev => prev.map(r => r.id === requestId ? data.request : r));
        setAdminReply('');
        setAdminAttachment(null);
      }
    } catch (e) { console.error('[Admin] Reply error:', e); }
    finally { setAdminLoading(false); }
  };

  const handleStatusChange = async (requestId: string, status: string) => {
    try {
      const res = await fetch(`/api/contact-requests/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedRequest(data.request);
        setContactRequests(prev => prev.map(r => r.id === requestId ? data.request : r));
      }
    } catch (e) { console.error('[Admin] Status change error:', e); }
  };

  const handleAdminFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { alert('Image trop lourde (max 8 Mo)'); return; }
    setAdminUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        setAdminAttachment(data.url);
      }
    } catch (err) { console.error('[Admin] Upload error:', err); }
    finally { setAdminUploading(false); if (adminFileRef.current) adminFileRef.current.value = ''; }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const LABELS: Record<string, string> = {
    images: 'Images', videos: 'Videos', suggestions: 'Suggestions IA',
    assistant: 'Assistant IA', audio: 'Audio', publication: 'Publication',
    interface: 'Interface', prix: 'Qualite/Prix',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 to-white">
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 text-sm text-neutral-500 mb-1">
              <Link href="/mon-compte" className="hover:text-neutral-700">Mon compte</Link>
              <span>/</span>
              <span className="text-purple-600 font-medium">Retours clients</span>
            </div>
            <h1 className="text-2xl font-bold text-neutral-900">Retours clients</h1>
          </div>
          <Link href="/mon-compte" className="text-sm text-neutral-600 hover:text-neutral-900 px-4 py-2 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-all">
            Retour
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 bg-neutral-100 rounded-xl p-1 mb-6">
          <button
            onClick={() => { setActiveTab('demandes'); if (contactRequests.length === 0) loadContactRequests(); }}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${activeTab === 'demandes' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500'}`}
          >
            Demandes clients ({contactRequests.length})
          </button>
          <button
            onClick={() => { setActiveTab('questionnaires'); if (!feedbackStats) loadFeedbackStats(); }}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${activeTab === 'questionnaires' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500'}`}
          >
            Questionnaires ({feedbackTotal})
          </button>
        </div>

        {/* ===== TAB DEMANDES ===== */}
        {activeTab === 'demandes' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Liste des demandes */}
            <div className="md:col-span-1 bg-white rounded-2xl shadow-sm border border-neutral-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Demandes</h3>
                <button onClick={loadContactRequests} className="text-xs text-purple-600 hover:underline">Actualiser</button>
              </div>
              <div className="space-y-2 max-h-[70vh] overflow-y-auto">
                {contactRequests.length === 0 && <p className="text-xs text-neutral-400 text-center py-4">Aucune demande</p>}
                {contactRequests.map((req: any) => (
                  <button
                    key={req.id}
                    onClick={() => setSelectedRequest(req)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${selectedRequest?.id === req.id ? 'border-purple-500 bg-purple-50' : 'border-neutral-100 hover:border-neutral-300'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-neutral-800 truncate">{req.user_name || req.user_email}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${req.status === 'new' ? 'bg-red-100 text-red-700' : req.status === 'in_progress' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                        {req.status === 'new' ? 'Nouveau' : req.status === 'in_progress' ? 'En cours' : 'Resolu'}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-500 truncate">{req.subject}</p>
                    <p className="text-[10px] text-neutral-400 mt-0.5">{new Date(req.created_at).toLocaleDateString('fr-FR')}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Detail / Chat */}
            <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-neutral-200 p-4">
              {selectedRequest ? (
                <div className="flex flex-col h-[70vh]">
                  <div className="flex items-center justify-between mb-3 pb-3 border-b border-neutral-100">
                    <div>
                      <h3 className="font-semibold text-sm">{selectedRequest.subject}</h3>
                      <p className="text-xs text-neutral-500">{selectedRequest.user_name} &lt;{selectedRequest.user_email}&gt;</p>
                    </div>
                    <div className="flex gap-1">
                      {['new', 'in_progress', 'resolved'].map(s => (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(selectedRequest.id, s)}
                          className={`text-[10px] px-2 py-1 rounded-full border transition-all ${selectedRequest.status === s ? (s === 'new' ? 'bg-red-500 text-white border-red-500' : s === 'in_progress' ? 'bg-amber-500 text-white border-amber-500' : 'bg-green-500 text-white border-green-500') : 'border-neutral-200 text-neutral-500 hover:border-neutral-400'}`}
                        >
                          {s === 'new' ? 'Nouveau' : s === 'in_progress' ? 'En cours' : 'Resolu'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 space-y-3 overflow-y-auto mb-3">
                    {(selectedRequest.messages || []).map((msg: any, i: number) => (
                      <div key={i} className={`flex ${msg.from === 'admin' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-3 rounded-xl text-sm ${msg.from === 'admin' ? 'bg-purple-600 text-white' : 'bg-neutral-100 text-neutral-800'}`}>
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                          {msg.image && (
                            <img
                              src={msg.image}
                              alt="Piece jointe"
                              className="mt-2 max-w-full max-h-48 rounded-lg border cursor-pointer"
                              onClick={() => window.open(msg.image, '_blank')}
                            />
                          )}
                          <p className={`text-[10px] mt-1 ${msg.from === 'admin' ? 'text-purple-200' : 'text-neutral-400'}`}>
                            {new Date(msg.at).toLocaleString('fr-FR')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Admin attachment preview */}
                  {adminAttachment && (
                    <div className="mb-2 flex items-center gap-2">
                      <img src={adminAttachment} alt="Piece jointe" className="h-16 rounded-lg border" />
                      <button onClick={() => setAdminAttachment(null)} className="text-xs text-red-500 hover:underline">Retirer</button>
                    </div>
                  )}

                  {/* Input reponse */}
                  <div className="flex gap-2">
                    <input type="file" ref={adminFileRef} accept="image/*" className="hidden" onChange={handleAdminFileUpload} />
                    <button
                      onClick={() => adminFileRef.current?.click()}
                      disabled={adminUploading}
                      className="px-3 py-2 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-all disabled:opacity-50"
                      title="Joindre une image"
                    >
                      {adminUploading ? (
                        <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                      )}
                    </button>
                    <input
                      type="text"
                      value={adminReply}
                      onChange={(e) => setAdminReply(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAdminReply(selectedRequest.id)}
                      placeholder="Repondre..."
                      className="flex-1 text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                    <button
                      onClick={() => handleAdminReply(selectedRequest.id)}
                      disabled={adminLoading || (!adminReply.trim() && !adminAttachment)}
                      className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-all disabled:opacity-50"
                    >
                      {adminLoading ? '...' : 'Envoyer'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-48 text-neutral-400 text-sm">
                  Selectionnez une demande pour voir les details
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== TAB QUESTIONNAIRES ===== */}
        {activeTab === 'questionnaires' && (
          <div className="space-y-4">
            {!feedbackStats ? (
              <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-6 text-center">
                <button onClick={loadFeedbackStats} className="text-purple-600 font-medium hover:underline">Charger les statistiques</button>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-6">
                  <h2 className="text-lg font-semibold mb-4">{feedbackTotal} retour{feedbackTotal > 1 ? 's' : ''} recus</h2>
                  <div className="space-y-4">
                    {Object.entries(feedbackStats).map(([key, counts]: [string, any]) => {
                      const total = (counts.tres_bien || 0) + (counts.bien || 0) + (counts.moyen || 0) + (counts.pas_du_tout || 0);
                      if (total === 0) return null;
                      return (
                        <div key={key}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-neutral-700">{LABELS[key] || key}</span>
                            <span className="text-xs text-neutral-400">{total} reponse{total > 1 ? 's' : ''}</span>
                          </div>
                          <div className="flex h-4 rounded-full overflow-hidden bg-neutral-100">
                            {counts.tres_bien > 0 && <div className="bg-green-500" style={{ width: `${(counts.tres_bien / total) * 100}%` }} title={`Tres bien: ${counts.tres_bien}`} />}
                            {counts.bien > 0 && <div className="bg-blue-500" style={{ width: `${(counts.bien / total) * 100}%` }} title={`Bien: ${counts.bien}`} />}
                            {counts.moyen > 0 && <div className="bg-amber-500" style={{ width: `${(counts.moyen / total) * 100}%` }} title={`Moyen: ${counts.moyen}`} />}
                            {counts.pas_du_tout > 0 && <div className="bg-red-500" style={{ width: `${(counts.pas_du_tout / total) * 100}%` }} title={`Pas du tout: ${counts.pas_du_tout}`} />}
                          </div>
                          <div className="flex gap-3 mt-1 text-[10px] text-neutral-400">
                            {counts.tres_bien > 0 && <span className="text-green-600">Tres bien: {counts.tres_bien}</span>}
                            {counts.bien > 0 && <span className="text-blue-600">Bien: {counts.bien}</span>}
                            {counts.moyen > 0 && <span className="text-amber-600">Moyen: {counts.moyen}</span>}
                            {counts.pas_du_tout > 0 && <span className="text-red-600">Pas du tout: {counts.pas_du_tout}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {feedbackComments.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-6">
                    <h2 className="text-lg font-semibold mb-4">Commentaires libres ({feedbackComments.length})</h2>
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {feedbackComments.map((c: any, i: number) => (
                        <div key={i} className="p-3 bg-neutral-50 rounded-lg border border-neutral-100">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-purple-600">{c.key}</span>
                            <span className="text-[10px] text-neutral-400">{c.user_email} - {new Date(c.created_at).toLocaleDateString('fr-FR')}</span>
                          </div>
                          <p className="text-sm text-neutral-700">{c.comment}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      <FeedbackPopup show={feedback.showPopup} onAccept={feedback.handleAccept} onDismiss={feedback.handleDismiss} />
      <FeedbackModal isOpen={feedback.showModal} onClose={feedback.handleModalClose} />
    </div>
  );
}
