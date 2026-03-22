'use client';

import { useState } from 'react';

export default function ComingSoonBanner() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleNotify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || submitting) return;

    setSubmitting(true);
    try {
      // Store notification request (can be connected to Brevo/CRM later)
      const stored = JSON.parse(localStorage.getItem('keiro_agent_notify_emails') || '[]');
      if (!stored.includes(email)) {
        stored.push(email);
        localStorage.setItem('keiro_agent_notify_emails', JSON.stringify(stored));
      }
      setSubmitted(true);
    } catch {
      // Silent
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-purple-500/30 mb-6">
      {/* Animated gradient background */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.15), rgba(236,72,153,0.1))',
        }}
      />

      {/* Sparkle animation */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="sparkle sparkle-1" />
        <div className="sparkle sparkle-2" />
        <div className="sparkle sparkle-3" />
      </div>

      <div className="relative z-10 px-5 py-6 text-center">
        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-purple-500/20">
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>

        <h2 className="text-white font-bold text-lg mb-1">
          Votre Equipe IA arrive tres prochainement
        </h2>
        <p className="text-white/60 text-sm mb-5 max-w-md mx-auto">
          10 agents IA specialises pour votre business : marketing, contenu, SEO, prospection, et bien plus.
          Remplissez votre dossier business des maintenant pour etre pret le jour du lancement.
        </p>

        {/* Email notification form */}
        {!submitted ? (
          <form onSubmit={handleNotify} className="flex gap-2 max-w-sm mx-auto">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="votre@email.com"
              required
              className="flex-1 px-3.5 py-2.5 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder-white/40 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
            />
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-purple-500/20 disabled:opacity-60 transition-all whitespace-nowrap"
            >
              Me notifier
            </button>
          </form>
        ) : (
          <div className="flex items-center justify-center gap-2 text-green-400 text-sm font-medium">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            On te previent des le lancement !
          </div>
        )}
      </div>

      <style jsx>{`
        .sparkle {
          position: absolute;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: rgba(168, 85, 247, 0.6);
          animation: sparkleFloat 3s ease-in-out infinite;
        }
        .sparkle-1 {
          top: 20%;
          left: 10%;
          animation-delay: 0s;
        }
        .sparkle-2 {
          top: 60%;
          right: 15%;
          animation-delay: 1s;
          background: rgba(59, 130, 246, 0.6);
        }
        .sparkle-3 {
          bottom: 20%;
          left: 50%;
          animation-delay: 2s;
          background: rgba(236, 72, 153, 0.5);
        }
        @keyframes sparkleFloat {
          0%, 100% {
            transform: translateY(0) scale(1);
            opacity: 0.4;
          }
          50% {
            transform: translateY(-12px) scale(1.5);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
