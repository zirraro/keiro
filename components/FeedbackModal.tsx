'use client';

import { useState } from 'react';

const QUESTIONS = [
  { key: 'images', label: 'Génération d\'images' },
  { key: 'videos', label: 'Génération de vidéos' },
  { key: 'suggestions', label: 'Suggestions texte IA' },
  { key: 'assistant', label: 'Assistant marketing IA' },
  { key: 'audio', label: 'Audio / narration' },
  { key: 'publication', label: 'Publication réseaux sociaux' },
  { key: 'interface', label: 'Interface / facilité d\'utilisation' },
  { key: 'prix', label: 'Rapport qualité / prix' },
] as const;

const RATING_OPTIONS = [
  { value: 'tres_bien', label: 'Très bien', bg: 'bg-green-100', border: 'border-green-500', text: 'text-green-700', selectedBg: 'bg-green-500 text-white' },
  { value: 'bien', label: 'Bien', bg: 'bg-blue-100', border: 'border-blue-500', text: 'text-blue-700', selectedBg: 'bg-blue-500 text-white' },
  { value: 'moyen', label: 'Moyen', bg: 'bg-amber-100', border: 'border-amber-500', text: 'text-amber-700', selectedBg: 'bg-amber-500 text-white' },
  { value: 'pas_du_tout', label: 'Pas du tout', bg: 'bg-red-100', border: 'border-red-500', text: 'text-red-700', selectedBg: 'bg-red-500 text-white' },
] as const;

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [ratings, setRatings] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [expandedComment, setExpandedComment] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (Object.keys(ratings).length === 0) return;
    setSending(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ratings,
          comments: Object.fromEntries(
            Object.entries(comments).filter(([, v]) => v.trim())
          ),
        }),
      });
      if (res.ok) {
        setSent(true);
        localStorage.setItem('keiro_feedback_done', 'true');
        setTimeout(() => {
          onClose();
          setSent(false);
          setRatings({});
          setComments({});
        }, 2000);
      }
    } catch (err) {
      console.error('[FeedbackModal] Error:', err);
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  if (sent) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl max-w-md w-full shadow-2xl p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-neutral-900 mb-2">Merci pour votre retour !</h3>
          <p className="text-neutral-600">Vos retours nous aident a ameliorer Keiro.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6 text-white rounded-t-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Votre retour sur Keiro</h2>
              <p className="text-sm text-purple-100">8 questions rapides (~30 secondes)</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {QUESTIONS.map((q) => (
            <div key={q.key} className="border-b border-neutral-100 pb-4 last:border-0">
              <p className="text-sm font-medium text-neutral-800 mb-2">{q.label}</p>
              <div className="flex gap-2 flex-wrap">
                {RATING_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setRatings((prev) => ({ ...prev, [q.key]: opt.value }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      ratings[q.key] === opt.value
                        ? `${opt.selectedBg} border-transparent shadow-sm`
                        : `${opt.bg} ${opt.border} ${opt.text} border hover:shadow-sm`
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setExpandedComment(expandedComment === q.key ? null : q.key)}
                className="text-[11px] text-neutral-400 hover:text-neutral-600 mt-2 transition-colors"
              >
                {expandedComment === q.key ? 'Masquer' : 'Qu\'amelioreriez-vous ? (optionnel)'}
              </button>
              {expandedComment === q.key && (
                <textarea
                  value={comments[q.key] || ''}
                  onChange={(e) => setComments((prev) => ({ ...prev, [q.key]: e.target.value }))}
                  placeholder="Votre suggestion..."
                  rows={2}
                  className="w-full mt-1 text-sm border border-neutral-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                />
              )}
            </div>
          ))}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg border border-neutral-300 text-neutral-700 font-medium hover:bg-neutral-50 transition-colors">
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={sending || Object.keys(ratings).length === 0}
              className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? 'Envoi...' : `Envoyer (${Object.keys(ratings).length}/8)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
