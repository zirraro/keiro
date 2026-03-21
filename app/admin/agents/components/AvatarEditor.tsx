'use client';

import { useState, useEffect, useRef } from 'react';

// ─── Types ─────────────────────────────────────────────────────

interface AgentPersonality {
  tone: string;
  verbosity: 'concis' | 'normal' | 'détaillé';
  emoji_usage: 'aucun' | 'subtil' | 'modéré' | 'expressif';
  humor_level: 'aucun' | 'léger' | 'modéré' | 'blagueur';
  expertise_focus: string[];
  language_style: string;
  signature_catchphrase: string;
}

interface AgentAvatar {
  id: string;
  display_name: string;
  title: string;
  avatar_url: string | null;
  personality: AgentPersonality;
  custom_instructions: string;
  is_active: boolean;
}

// ─── Agent Gradient Map ────────────────────────────────────────

const AGENT_GRADIENTS: Record<string, string> = {
  ceo: 'from-purple-600 to-indigo-700',
  commercial: 'from-blue-600 to-cyan-600',
  email: 'from-green-600 to-emerald-600',
  content: 'from-pink-600 to-rose-600',
  seo: 'from-amber-600 to-orange-600',
  onboarding: 'from-cyan-600 to-blue-600',
  retention: 'from-violet-600 to-purple-600',
  marketing: 'from-teal-600 to-green-600',
  ops: 'from-neutral-600 to-neutral-700',
  ads: 'from-red-600 to-orange-600',
  rh: 'from-slate-600 to-slate-700',
};

const AGENT_ICONS: Record<string, string> = {
  ceo: '🧠', commercial: '🎯', email: '📧', content: '⚡',
  seo: '🔍', onboarding: '🚀', retention: '💎', marketing: '📊',
  ops: '📱', ads: '🔥', rh: '⚖️',
};

// ─── Component ─────────────────────────────────────────────────

export default function AvatarEditor() {
  const [avatars, setAvatars] = useState<AgentAvatar[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editable fields for selected avatar
  const [editName, setEditName] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editTone, setEditTone] = useState('');
  const [editVerbosity, setEditVerbosity] = useState<'concis' | 'normal' | 'détaillé'>('concis');
  const [editEmoji, setEditEmoji] = useState<'aucun' | 'subtil' | 'modéré' | 'expressif'>('subtil');
  const [editHumor, setEditHumor] = useState<'aucun' | 'léger' | 'modéré' | 'blagueur'>('aucun');
  const [editExpertise, setEditExpertise] = useState('');
  const [editLanguageStyle, setEditLanguageStyle] = useState('');
  const [editCatchphrase, setEditCatchphrase] = useState('');
  const [editInstructions, setEditInstructions] = useState('');

  // ─── Load avatars ─────────────────────────────────────────
  useEffect(() => {
    fetchAvatars();
  }, []);

  async function fetchAvatars() {
    try {
      const res = await fetch('/api/admin/avatars');
      const data = await res.json();
      if (data.avatars) {
        setAvatars(data.avatars);
        if (!selectedId && data.avatars.length > 0) {
          selectAvatar(data.avatars[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load avatars:', err);
    } finally {
      setLoading(false);
    }
  }

  function selectAvatar(avatar: AgentAvatar) {
    setSelectedId(avatar.id);
    setEditName(avatar.display_name);
    setEditTitle(avatar.title);
    setEditTone(avatar.personality.tone);
    setEditVerbosity(avatar.personality.verbosity);
    setEditEmoji(avatar.personality.emoji_usage);
    setEditHumor(avatar.personality.humor_level);
    setEditExpertise(avatar.personality.expertise_focus.join(', '));
    setEditLanguageStyle(avatar.personality.language_style);
    setEditCatchphrase(avatar.personality.signature_catchphrase);
    setEditInstructions(avatar.custom_instructions);
    setSaveMsg(null);
  }

  // ─── Save ──────────────────────────────────────────────────
  async function handleSave() {
    if (!selectedId) return;
    setSaving(true);
    setSaveMsg(null);

    try {
      const res = await fetch('/api/admin/avatars', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedId,
          display_name: editName,
          title: editTitle,
          personality: {
            tone: editTone,
            verbosity: editVerbosity,
            emoji_usage: editEmoji,
            humor_level: editHumor,
            expertise_focus: editExpertise.split(',').map(s => s.trim()).filter(Boolean),
            language_style: editLanguageStyle,
            signature_catchphrase: editCatchphrase,
          },
          custom_instructions: editInstructions,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSaveMsg({ ok: true, text: 'Sauvegardé !' });
        fetchAvatars();
      } else {
        setSaveMsg({ ok: false, text: data.error || 'Erreur' });
      }
    } catch (err: any) {
      setSaveMsg({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  }

  // ─── Upload avatar image ──────────────────────────────────
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('id', selectedId);
      formData.append('file', file);

      const res = await fetch('/api/admin/avatars', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setSaveMsg({ ok: true, text: 'Avatar uploadé !' });
        fetchAvatars();
      } else {
        setSaveMsg({ ok: false, text: data.error || 'Upload failed' });
      }
    } catch (err: any) {
      setSaveMsg({ ok: false, text: err.message });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const selected = avatars.find(a => a.id === selectedId);

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Chargement des avatars...</div>;
  }

  // ─── Preview block ────────────────────────────────────────
  function renderPreview() {
    if (!selected) return null;
    const gradient = AGENT_GRADIENTS[selected.id] || 'from-gray-600 to-gray-700';

    return (
      <div className={`rounded-2xl bg-gradient-to-br ${gradient} p-6 text-white`}>
        <div className="flex items-center gap-4 mb-4">
          {/* Avatar circle */}
          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/40 flex items-center justify-center overflow-hidden">
            {selected.avatar_url ? (
              <img src={selected.avatar_url} alt={editName} className="w-full h-full object-cover rounded-full" />
            ) : (
              <span className="text-3xl">{AGENT_ICONS[selected.id] || '🤖'}</span>
            )}
          </div>
          <div>
            <h3 className="text-xl font-bold">{editName}</h3>
            <p className="text-white/80 text-sm">{editTitle}</p>
          </div>
        </div>

        {/* Personality badges */}
        <div className="flex flex-wrap gap-2 mb-3">
          <span className="px-2 py-0.5 rounded-full bg-white/20 text-xs">{editVerbosity}</span>
          <span className="px-2 py-0.5 rounded-full bg-white/20 text-xs">emoji: {editEmoji}</span>
          <span className="px-2 py-0.5 rounded-full bg-white/20 text-xs">humour: {editHumor}</span>
        </div>

        {/* Tone */}
        <p className="text-white/90 text-sm italic mb-2">&ldquo;{editTone}&rdquo;</p>

        {/* Catchphrase */}
        {editCatchphrase && (
          <p className="text-white font-semibold text-sm">{editCatchphrase}</p>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* ─── Agent list (left sidebar) ─────────────────────── */}
      <div className="col-span-3 space-y-2">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Agents</h3>
        {avatars.map(avatar => {
          const gradient = AGENT_GRADIENTS[avatar.id] || 'from-gray-600 to-gray-700';
          const isSelected = avatar.id === selectedId;
          return (
            <button
              key={avatar.id}
              onClick={() => selectAvatar(avatar)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                isSelected
                  ? `bg-gradient-to-r ${gradient} text-white shadow-lg`
                  : 'bg-[#1a1a2e] text-gray-300 hover:bg-[#252540]'
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center overflow-hidden ${
                isSelected ? 'bg-white/20' : 'bg-white/10'
              }`}>
                {avatar.avatar_url ? (
                  <img src={avatar.avatar_url} alt={avatar.display_name} className="w-full h-full object-cover rounded-full" />
                ) : (
                  <span className="text-lg">{AGENT_ICONS[avatar.id] || '🤖'}</span>
                )}
              </div>
              <div className="text-left">
                <div className="font-semibold text-sm">{avatar.display_name}</div>
                <div className={`text-xs ${isSelected ? 'text-white/70' : 'text-gray-500'}`}>{avatar.title}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ─── Editor (center) ───────────────────────────────── */}
      <div className="col-span-5 space-y-5">
        {!selected ? (
          <div className="text-gray-400 text-center py-12">Sélectionne un agent</div>
        ) : (
          <>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              {AGENT_ICONS[selected.id]} Éditer {selected.display_name}
            </h3>

            {/* Identity */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Prénom</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Titre</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            {/* Avatar upload */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Photo avatar</label>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#1a1a2e] border border-white/10 flex items-center justify-center overflow-hidden">
                  {selected.avatar_url ? (
                    <img src={selected.avatar_url} alt="" className="w-full h-full object-cover rounded-full" />
                  ) : (
                    <span className="text-xl">{AGENT_ICONS[selected.id]}</span>
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="px-3 py-1.5 bg-purple-600/30 text-purple-300 rounded-lg text-sm hover:bg-purple-600/50 transition disabled:opacity-50"
                >
                  {uploading ? 'Upload...' : 'Changer'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleUpload}
                  className="hidden"
                />
              </div>
            </div>

            {/* Personality */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-300">Personnalité</h4>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Ton (ex: confiant, stratégique, visionnaire)</label>
                <input
                  type="text"
                  value={editTone}
                  onChange={e => setEditTone(e.target.value)}
                  className="w-full bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Niveau de détail</label>
                  <select
                    value={editVerbosity}
                    onChange={e => setEditVerbosity(e.target.value as any)}
                    className="w-full bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  >
                    <option value="concis">Concis</option>
                    <option value="normal">Normal</option>
                    <option value="détaillé">Détaillé</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Emojis</label>
                  <select
                    value={editEmoji}
                    onChange={e => setEditEmoji(e.target.value as any)}
                    className="w-full bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  >
                    <option value="aucun">Aucun</option>
                    <option value="subtil">Subtil</option>
                    <option value="modéré">Modéré</option>
                    <option value="expressif">Expressif</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Humour</label>
                  <select
                    value={editHumor}
                    onChange={e => setEditHumor(e.target.value as any)}
                    className="w-full bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  >
                    <option value="aucun">Aucun</option>
                    <option value="léger">Léger</option>
                    <option value="modéré">Modéré</option>
                    <option value="blagueur">Blagueur</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Expertises (séparées par virgule)</label>
                <input
                  type="text"
                  value={editExpertise}
                  onChange={e => setEditExpertise(e.target.value)}
                  className="w-full bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  placeholder="stratégie, growth, data"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Style de langage</label>
                <input
                  type="text"
                  value={editLanguageStyle}
                  onChange={e => setEditLanguageStyle(e.target.value)}
                  className="w-full bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  placeholder="professionnel tutoiement"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Catchphrase / Signature</label>
                <input
                  type="text"
                  value={editCatchphrase}
                  onChange={e => setEditCatchphrase(e.target.value)}
                  className="w-full bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                  placeholder="On scale. 🚀"
                />
              </div>
            </div>

            {/* Custom instructions */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Instructions personnalisées (override fondateur)</label>
              <textarea
                value={editInstructions}
                onChange={e => setEditInstructions(e.target.value)}
                rows={3}
                className="w-full bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500 resize-none"
                placeholder="Instructions spéciales qui seront injectées dans le prompt de cet agent..."
              />
            </div>

            {/* Save button */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-indigo-700 transition disabled:opacity-50"
              >
                {saving ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
              {saveMsg && (
                <span className={`text-sm ${saveMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                  {saveMsg.text}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* ─── Preview (right) ───────────────────────────────── */}
      <div className="col-span-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Aperçu</h3>
        {renderPreview()}

        {/* Prompt preview */}
        {selected && (
          <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Bloc prompt injecté</h4>
            <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
{`━━━ TON IDENTITÉ ━━━
Tu es ${editName}, ${editTitle} chez KeiroAI.

Ton style de communication :
- Ton : ${editTone}
- Niveau de détail : ${editVerbosity}
- Emojis : ${editEmoji}
- Humour : ${editHumor}
- Style : ${editLanguageStyle}${
  editExpertise ? `\n- Tes domaines d'expertise : ${editExpertise}` : ''
}${
  editCatchphrase ? `\n- Ta signature : "${editCatchphrase}"` : ''
}${
  editInstructions ? `\n\nINSTRUCTIONS SPÉCIALES DU FONDATEUR :\n${editInstructions}` : ''
}

IMPORTANT : Reste toujours fidèle à ta personnalité. Tu ES ${editName}. Chaque message doit refléter ton caractère unique.`}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
