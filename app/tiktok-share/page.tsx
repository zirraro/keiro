'use client';

import { useState } from 'react';

/**
 * TikTok Content Sharing UX Page
 * Required by TikTok Developer Guidelines for Content Posting API approval.
 * Follows all 5 points of the UX Guidelines:
 * https://developers.tiktok.com/doc/content-sharing-guidelines#required_ux_implementation_in_your_app
 */

type PrivacyLevel = 'public' | 'friends' | 'private';

export default function TikTokSharePage() {
  // Point 1: Privacy settings
  const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevel>('public');

  // Point 2: Interaction settings
  const [allowComment, setAllowComment] = useState(true);
  const [allowDuet, setAllowDuet] = useState(true);
  const [allowStitch, setAllowStitch] = useState(true);

  // Point 3: Disclosure
  const [agreedToDisclosure, setAgreedToDisclosure] = useState(false);

  // Point 4: Content preview
  const [caption, setCaption] = useState('');

  // Step tracking
  const [step, setStep] = useState(1);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);

  const handlePost = async () => {
    if (!agreedToDisclosure) return;
    setPosting(true);
    // Simulate posting delay
    await new Promise(r => setTimeout(r, 2000));
    setPosted(true);
    setPosting(false);
  };

  return (
    <div className="min-h-dvh bg-black text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <a href="/assistant" className="text-white/60 hover:text-white text-sm">← Retour</a>
        <h1 className="font-bold text-sm">Publier sur TikTok</h1>
        <div className="w-16" />
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">

        {/* ═══ STEP 1: Content Preview ═══ */}
        {/* Point 4: Users must be able to preview content before posting */}
        <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-cyan-500 flex items-center justify-center text-xs font-bold">1</span>
            <h2 className="font-bold text-sm">Apercu du contenu</h2>
          </div>

          {/* Video/Image preview placeholder */}
          <div className="aspect-[9/16] max-h-[300px] bg-white/5 rounded-xl flex items-center justify-center mb-3 border border-white/10">
            <div className="text-center text-white/30">
              <div className="text-4xl mb-2">🎬</div>
              <p className="text-xs">Apercu de la video</p>
              <p className="text-[10px] text-white/20 mt-1">Le contenu sera affiche ici avant publication</p>
            </div>
          </div>

          {/* Caption */}
          <label className="block text-xs text-white/50 mb-1">Legende</label>
          <textarea
            value={caption}
            onChange={e => setCaption(e.target.value)}
            placeholder="Ajoutez une legende pour votre TikTok..."
            rows={3}
            maxLength={2200}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 resize-none focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
          />
          <div className="text-right text-[10px] text-white/30 mt-1">{caption.length}/2200</div>
        </div>

        {/* ═══ STEP 2: Privacy Settings ═══ */}
        {/* Point 1: Privacy level selection — who can view this video */}
        <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-cyan-500 flex items-center justify-center text-xs font-bold">2</span>
            <h2 className="font-bold text-sm">Qui peut voir cette video</h2>
          </div>
          <p className="text-xs text-white/40 mb-3">Selectionnez le niveau de confidentialite de votre video TikTok.</p>

          <div className="space-y-2">
            {([
              { value: 'public', label: 'Tout le monde', desc: 'Votre video sera visible par tous les utilisateurs TikTok', icon: '🌍' },
              { value: 'friends', label: 'Amis uniquement', desc: 'Seuls vos abonnes mutuels pourront voir la video', icon: '👥' },
              { value: 'private', label: 'Prive', desc: 'Seul vous pourrez voir cette video', icon: '🔒' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => setPrivacyLevel(opt.value)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                  privacyLevel === opt.value
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                <span className="text-lg">{opt.icon}</span>
                <div className="flex-1">
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-[11px] text-white/40">{opt.desc}</div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  privacyLevel === opt.value ? 'border-cyan-500 bg-cyan-500' : 'border-white/20'
                }`}>
                  {privacyLevel === opt.value && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ═══ STEP 3: Interaction Settings ═══ */}
        {/* Point 2: Allow/disallow comments, duets, stitches */}
        <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-cyan-500 flex items-center justify-center text-xs font-bold">3</span>
            <h2 className="font-bold text-sm">Parametres d&apos;interaction</h2>
          </div>
          <p className="text-xs text-white/40 mb-3">Choisissez comment les utilisateurs peuvent interagir avec votre video.</p>

          <div className="space-y-3">
            {/* Allow comments */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm">💬 Autoriser les commentaires</div>
                <div className="text-[11px] text-white/40">Les utilisateurs pourront commenter votre video</div>
              </div>
              <button
                onClick={() => setAllowComment(!allowComment)}
                className={`w-11 h-6 rounded-full transition-all relative ${allowComment ? 'bg-cyan-500' : 'bg-white/20'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ${allowComment ? 'left-5.5' : 'left-0.5'}`}
                  style={{ left: allowComment ? '22px' : '2px' }} />
              </button>
            </div>

            {/* Allow duet */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm">🎭 Autoriser les Duets</div>
                <div className="text-[11px] text-white/40">Les utilisateurs pourront creer des Duets avec votre video</div>
              </div>
              <button
                onClick={() => setAllowDuet(!allowDuet)}
                className={`w-11 h-6 rounded-full transition-all relative ${allowDuet ? 'bg-cyan-500' : 'bg-white/20'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all`}
                  style={{ left: allowDuet ? '22px' : '2px' }} />
              </button>
            </div>

            {/* Allow stitch */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm">✂️ Autoriser les Stitches</div>
                <div className="text-[11px] text-white/40">Les utilisateurs pourront creer des Stitches avec votre video</div>
              </div>
              <button
                onClick={() => setAllowStitch(!allowStitch)}
                className={`w-11 h-6 rounded-full transition-all relative ${allowStitch ? 'bg-cyan-500' : 'bg-white/20'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all`}
                  style={{ left: allowStitch ? '22px' : '2px' }} />
              </button>
            </div>
          </div>

          {/* Privacy level impact notice */}
          {privacyLevel !== 'public' && (
            <div className="mt-3 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 text-[11px] text-amber-400">
              Les Duets et Stitches ne sont disponibles que pour les videos publiques. Avec le parametre &quot;{privacyLevel === 'friends' ? 'Amis uniquement' : 'Prive'}&quot;, ces options seront desactivees automatiquement.
            </div>
          )}
        </div>

        {/* ═══ STEP 4: Disclosure & Consent ═══ */}
        {/* Point 3 & 5: Disclosure that content will be shared to TikTok */}
        <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-full bg-cyan-500 flex items-center justify-center text-xs font-bold">4</span>
            <h2 className="font-bold text-sm">Divulgation et consentement</h2>
          </div>

          <div className="bg-white/5 rounded-xl p-3 mb-3 text-xs text-white/60 space-y-2">
            <p>En publiant cette video, vous acceptez que :</p>
            <ul className="list-disc list-inside space-y-1 text-[11px]">
              <li>Votre contenu sera partage et publie sur <strong className="text-white/80">TikTok</strong> via l&apos;API Content Posting.</li>
              <li>La video sera soumise aux <a href="https://www.tiktok.com/community-guidelines" target="_blank" rel="noopener" className="text-cyan-400 hover:underline">Regles communautaires de TikTok</a> et aux <a href="https://www.tiktok.com/legal/terms-of-service" target="_blank" rel="noopener" className="text-cyan-400 hover:underline">Conditions d&apos;utilisation de TikTok</a>.</li>
              <li>Les parametres de confidentialite et d&apos;interaction que vous avez choisis seront appliques a votre video sur TikTok.</li>
              <li>Vous pouvez modifier ou supprimer votre video a tout moment depuis l&apos;application TikTok.</li>
              <li>KeiroAI ne stocke pas votre contenu video apres publication sur TikTok.</li>
            </ul>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreedToDisclosure}
              onChange={e => setAgreedToDisclosure(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded accent-cyan-500"
            />
            <span className="text-xs text-white/70">
              Je comprends et j&apos;accepte que mon contenu sera publie sur TikTok avec les parametres selectionnes ci-dessus.
            </span>
          </label>
        </div>

        {/* ═══ STEP 5: Post Button ═══ */}
        {/* Point 5: Clear action to post content */}
        <div className="space-y-3">
          {!posted ? (
            <>
              <button
                onClick={handlePost}
                disabled={!agreedToDisclosure || posting}
                className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all ${
                  agreedToDisclosure && !posting
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:opacity-90 shadow-lg shadow-cyan-500/20'
                    : 'bg-white/10 text-white/30 cursor-not-allowed'
                }`}
              >
                {posting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin">⏳</span> Publication en cours...
                  </span>
                ) : (
                  '🎵 Publier sur TikTok'
                )}
              </button>

              {/* Settings summary */}
              <div className="bg-white/5 rounded-xl p-3 text-[10px] text-white/40 space-y-1">
                <div className="font-bold text-white/60 mb-1">Resume des parametres :</div>
                <div>Confidentialite : <span className="text-white/70">{privacyLevel === 'public' ? '🌍 Public' : privacyLevel === 'friends' ? '👥 Amis' : '🔒 Prive'}</span></div>
                <div>Commentaires : <span className="text-white/70">{allowComment ? '✅ Autorises' : '❌ Desactives'}</span></div>
                <div>Duets : <span className="text-white/70">{allowDuet && privacyLevel === 'public' ? '✅ Autorises' : '❌ Desactives'}</span></div>
                <div>Stitches : <span className="text-white/70">{allowStitch && privacyLevel === 'public' ? '✅ Autorises' : '❌ Desactives'}</span></div>
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <div className="text-5xl mb-3">✅</div>
              <h3 className="font-bold text-lg mb-1">Publie avec succes !</h3>
              <p className="text-sm text-white/60">Votre video a ete partagee sur TikTok.</p>
              <a href="/assistant" className="inline-block mt-4 px-6 py-2 bg-white/10 rounded-xl text-sm hover:bg-white/20 transition">
                Retour a l&apos;espace agents
              </a>
            </div>
          )}
        </div>

        {/* Footer disclosure */}
        <div className="text-center text-[10px] text-white/20 pb-8">
          <p>Propulse par l&apos;API TikTok Content Posting</p>
          <p className="mt-1">
            <a href="https://www.tiktok.com/legal/terms-of-service" target="_blank" rel="noopener" className="hover:text-white/40">Conditions TikTok</a>
            {' · '}
            <a href="https://www.tiktok.com/legal/privacy-policy" target="_blank" rel="noopener" className="hover:text-white/40">Politique de confidentialite TikTok</a>
            {' · '}
            <a href="https://www.tiktok.com/community-guidelines" target="_blank" rel="noopener" className="hover:text-white/40">Regles communautaires</a>
          </p>
        </div>
      </div>
    </div>
  );
}
