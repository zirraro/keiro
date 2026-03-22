'use client';

import { useState, useEffect, useRef } from 'react';
import Avatar3DCard from './Avatar3DCard';

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
  avatar_3d_url: string | null;
  animation_type: string;
  gradient_from: string;
  gradient_to: string;
  badge_color: string;
  personality: AgentPersonality;
  custom_instructions: string;
  is_active: boolean;
}

const AGENT_ICONS: Record<string, string> = {
  ceo: '🧠', commercial: '🎯', email: '📧', content: '⚡',
  seo: '🔍', onboarding: '🚀', retention: '💎', marketing: '📊',
  ops: '📱', ads: '🔥', rh: '⚖️',
};

const ANIMATION_OPTIONS = [
  { value: 'idle', label: 'Standard', desc: 'Hover 3D parallax + glow' },
  { value: 'none', label: 'Statique', desc: 'Pas d\'effet' },
];

const PRESET_GRADIENTS = [
  { from: '#7c3aed', to: '#4338ca', label: 'Violet' },
  { from: '#2563eb', to: '#0891b2', label: 'Bleu-Cyan' },
  { from: '#059669', to: '#10b981', label: 'Vert' },
  { from: '#db2777', to: '#e11d48', label: 'Rose' },
  { from: '#d97706', to: '#ea580c', label: 'Orange' },
  { from: '#dc2626', to: '#ea580c', label: 'Rouge' },
  { from: '#0d9488', to: '#059669', label: 'Teal' },
  { from: '#475569', to: '#334155', label: 'Slate' },
  { from: '#0c1a3a', to: '#1e3a5f', label: 'Navy' },
  { from: '#f59e0b', to: '#f97316', label: 'Ambre' },
];

export default function AvatarEditor() {
  const [avatars, setAvatars] = useState<AgentAvatar[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploading3D, setUploading3D] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const file3DInputRef = useRef<HTMLInputElement>(null);

  // Editable fields
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
  // 3D fields
  const [editAnimation, setEditAnimation] = useState('idle');
  const [editGradientFrom, setEditGradientFrom] = useState('#7c3aed');
  const [editGradientTo, setEditGradientTo] = useState('#4f46e5');
  const [editBadgeColor, setEditBadgeColor] = useState('#7c3aed');

  useEffect(() => { fetchAvatars(); }, []);

  async function fetchAvatars() {
    try {
      const res = await fetch('/api/admin/avatars');
      const data = await res.json();
      if (data.avatars) {
        setAvatars(data.avatars);
        if (!selectedId && data.avatars.length > 0) selectAvatar(data.avatars[0]);
      }
    } catch (err) { console.error('Failed to load avatars:', err); }
    finally { setLoading(false); }
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
    setEditAnimation(avatar.animation_type || 'idle');
    setEditGradientFrom(avatar.gradient_from || '#7c3aed');
    setEditGradientTo(avatar.gradient_to || '#4f46e5');
    setEditBadgeColor(avatar.badge_color || '#7c3aed');
    setSaveMsg(null);
  }

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
          animation_type: editAnimation,
          gradient_from: editGradientFrom,
          gradient_to: editGradientTo,
          badge_color: editBadgeColor,
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
      if (data.success) { setSaveMsg({ ok: true, text: 'Sauvegardé !' }); fetchAvatars(); }
      else setSaveMsg({ ok: false, text: data.error || 'Erreur' });
    } catch (err: any) { setSaveMsg({ ok: false, text: err.message }); }
    finally { setSaving(false); }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>, is3D: boolean) {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    const setter = is3D ? setUploading3D : setUploading;
    setter(true);
    try {
      const formData = new FormData();
      formData.append('id', selectedId);
      formData.append('file', file);
      if (is3D) formData.append('type', '3d');
      const res = await fetch('/api/admin/avatars', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) { setSaveMsg({ ok: true, text: is3D ? 'Avatar 3D uploadé !' : 'Avatar uploadé !' }); fetchAvatars(); }
      else setSaveMsg({ ok: false, text: data.error || 'Upload failed' });
    } catch (err: any) { setSaveMsg({ ok: false, text: err.message }); }
    finally {
      setter(false);
      if (is3D && file3DInputRef.current) file3DInputRef.current.value = '';
      if (!is3D && fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const selected = avatars.find(a => a.id === selectedId);

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement des avatars...</div>;

  return (
    <div className="space-y-6">
      {/* ─── Limova-style 3D Grid ─────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Ton Equipe IA</h3>
        <div className="flex flex-wrap gap-4 justify-center">
          {avatars.filter(a => a.is_active).map(avatar => (
            <Avatar3DCard
              key={avatar.id}
              name={avatar.display_name}
              title={avatar.title}
              avatarUrl={avatar.avatar_url}
              avatar3dUrl={avatar.avatar_3d_url}
              gradientFrom={avatar.gradient_from}
              gradientTo={avatar.gradient_to}
              badgeColor={avatar.badge_color}
              animation={avatar.animation_type}
              icon={AGENT_ICONS[avatar.id]}
              size="md"
              onClick={() => selectAvatar(avatar)}
              selected={avatar.id === selectedId}
            />
          ))}
        </div>
      </div>

      {/* ─── Editor Panel ──────────────────────────────────────── */}
      {selected && (
        <div className="grid grid-cols-12 gap-6 bg-[#0f0f1a] rounded-2xl border border-white/10 p-6">
          {/* Left: Form */}
          <div className="col-span-7 space-y-5">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              {AGENT_ICONS[selected.id]} Personnaliser {editName}
            </h3>

            {/* Identity */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Prénom" value={editName} onChange={setEditName} />
              <Field label="Titre / Rôle" value={editTitle} onChange={setEditTitle} />
            </div>

            {/* Avatar uploads */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-2">Avatar classique (cercle)</label>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#1a1a2e] border border-white/10 flex items-center justify-center overflow-hidden">
                    {selected.avatar_url ? (
                      <img src={selected.avatar_url} alt="" className="w-full h-full object-cover rounded-full" />
                    ) : <span className="text-xl">{AGENT_ICONS[selected.id]}</span>}
                  </div>
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                    className="px-3 py-1.5 bg-purple-600/30 text-purple-300 rounded-lg text-sm hover:bg-purple-600/50 transition disabled:opacity-50">
                    {uploading ? 'Upload...' : 'Changer'}
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={e => handleUpload(e, false)} className="hidden" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-2">Avatar 3D (PNG transparent)</label>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-[#1a1a2e] border border-white/10 flex items-center justify-center overflow-hidden"
                    style={{ background: `linear-gradient(135deg, ${editGradientFrom}, ${editGradientTo})` }}>
                    {selected.avatar_3d_url ? (
                      <img src={selected.avatar_3d_url} alt="" className="w-full h-full object-contain" />
                    ) : <span className="text-xl">🖼️</span>}
                  </div>
                  <button onClick={() => file3DInputRef.current?.click()} disabled={uploading3D}
                    className="px-3 py-1.5 bg-cyan-600/30 text-cyan-300 rounded-lg text-sm hover:bg-cyan-600/50 transition disabled:opacity-50">
                    {uploading3D ? 'Upload...' : 'Upload 3D'}
                  </button>
                  <input ref={file3DInputRef} type="file" accept="image/png,image/webp" onChange={e => handleUpload(e, true)} className="hidden" />
                </div>
              </div>
            </div>

            {/* Gradient & Animation */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-300">Apparence 3D</h4>

              {/* Preset gradients */}
              <div>
                <label className="block text-xs text-gray-400 mb-2">Gradient de fond</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_GRADIENTS.map(g => (
                    <button key={g.label} onClick={() => { setEditGradientFrom(g.from); setEditGradientTo(g.to); setEditBadgeColor(g.from); }}
                      className={`w-8 h-8 rounded-lg border-2 transition-all ${
                        editGradientFrom === g.from && editGradientTo === g.to ? 'border-white scale-110' : 'border-transparent hover:border-white/50'
                      }`}
                      style={{ background: `linear-gradient(135deg, ${g.from}, ${g.to})` }}
                      title={g.label}
                    />
                  ))}
                </div>
                {/* Custom color inputs */}
                <div className="flex gap-3 mt-2">
                  <div className="flex items-center gap-2">
                    <input type="color" value={editGradientFrom} onChange={e => setEditGradientFrom(e.target.value)}
                      className="w-8 h-8 rounded border-none cursor-pointer" />
                    <span className="text-xs text-gray-500">De</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="color" value={editGradientTo} onChange={e => setEditGradientTo(e.target.value)}
                      className="w-8 h-8 rounded border-none cursor-pointer" />
                    <span className="text-xs text-gray-500">Vers</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="color" value={editBadgeColor} onChange={e => setEditBadgeColor(e.target.value)}
                      className="w-8 h-8 rounded border-none cursor-pointer" />
                    <span className="text-xs text-gray-500">Badge</span>
                  </div>
                </div>
              </div>

              {/* Animation picker */}
              <div>
                <label className="block text-xs text-gray-400 mb-2">Animation</label>
                <div className="grid grid-cols-5 gap-2">
                  {ANIMATION_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setEditAnimation(opt.value)}
                      className={`px-2 py-2 rounded-lg text-xs text-center transition-all ${
                        editAnimation === opt.value
                          ? 'bg-purple-600 text-white'
                          : 'bg-[#1a1a2e] text-gray-400 hover:bg-[#252540]'
                      }`}>
                      <div className="font-medium">{opt.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Personality */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-300">Personnalité</h4>
              <Field label="Ton (ex: confiant, stratégique, visionnaire)" value={editTone} onChange={setEditTone} />
              <div className="grid grid-cols-3 gap-3">
                <Select label="Détail" value={editVerbosity} onChange={v => setEditVerbosity(v as any)}
                  options={[['concis','Concis'],['normal','Normal'],['détaillé','Détaillé']]} />
                <Select label="Emojis" value={editEmoji} onChange={v => setEditEmoji(v as any)}
                  options={[['aucun','Aucun'],['subtil','Subtil'],['modéré','Modéré'],['expressif','Expressif']]} />
                <Select label="Humour" value={editHumor} onChange={v => setEditHumor(v as any)}
                  options={[['aucun','Aucun'],['léger','Léger'],['modéré','Modéré'],['blagueur','Blagueur']]} />
              </div>
              <Field label="Expertises (virgule)" value={editExpertise} onChange={setEditExpertise} placeholder="stratégie, growth, data" />
              <Field label="Style langage" value={editLanguageStyle} onChange={setEditLanguageStyle} placeholder="professionnel tutoiement" />
              <Field label="Catchphrase" value={editCatchphrase} onChange={setEditCatchphrase} placeholder="On scale. 🚀" />
            </div>

            {/* Instructions */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Instructions personnalisées</label>
              <textarea value={editInstructions} onChange={e => setEditInstructions(e.target.value)} rows={3}
                className="w-full bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500 resize-none"
                placeholder="Instructions injectées dans le prompt de cet agent..." />
            </div>

            {/* Save */}
            <div className="flex items-center gap-3">
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-indigo-700 transition disabled:opacity-50">
                {saving ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
              {saveMsg && <span className={`text-sm ${saveMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{saveMsg.text}</span>}
            </div>
          </div>

          {/* Right: Live Preview */}
          <div className="col-span-5 space-y-4">
            <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Aperçu Live</h4>

            {/* Large 3D card preview */}
            <div className="flex justify-center">
              <Avatar3DCard
                name={editName}
                title={editTitle}
                avatarUrl={selected.avatar_url}
                avatar3dUrl={selected.avatar_3d_url}
                gradientFrom={editGradientFrom}
                gradientTo={editGradientTo}
                badgeColor={editBadgeColor}
                animation={editAnimation}
                icon={AGENT_ICONS[selected.id]}
                size="lg"
              />
            </div>

            {/* Prompt preview */}
            <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-4 max-h-64 overflow-y-auto">
              <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Prompt injecté</h4>
              <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
{`━━━ TON IDENTITÉ ━━━
Tu es ${editName}, ${editTitle} chez KeiroAI.

Ton style de communication :
- Ton : ${editTone}
- Niveau de détail : ${editVerbosity}
- Emojis : ${editEmoji}
- Humour : ${editHumor}
- Style : ${editLanguageStyle}${editExpertise ? `\n- Expertises : ${editExpertise}` : ''}${editCatchphrase ? `\n- Signature : "${editCatchphrase}"` : ''}${editInstructions ? `\n\nINSTRUCTIONS SPÉCIALES :\n${editInstructions}` : ''}`}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Reusable form components ─────────────────────────────────

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[][] }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
