'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { BusinessDossier } from '@/lib/agents/client-context';

// ─── Constants ──────────────────────────────────────────
const BUSINESS_TYPES = [
  'Restaurant',
  'Boulangerie / Patisserie',
  'Coiffeur / Salon de beaute',
  'Boutique / Commerce de detail',
  'Coach / Consultant',
  'Artisan',
  'Caviste',
  'Fleuriste',
  'Institut de beaute / Spa',
  'Salle de sport / Fitness',
  'Photographe / Videaste',
  'Agence immobiliere',
  'Cabinet medical / Paramedical',
  'Auto-entrepreneur',
  'E-commerce',
  'Autre',
];

const BRAND_TONES = [
  { value: 'professionnel', label: 'Professionnel' },
  { value: 'chaleureux', label: 'Chaleureux' },
  { value: 'decontracte', label: 'Decontracte' },
  { value: 'luxe', label: 'Luxe' },
  { value: 'fun', label: 'Fun / Dynamique' },
];

const DOSSIER_FIELDS: Array<keyof BusinessDossier> = [
  'company_name',
  'company_description',
  'business_type',
  'target_audience',
  'brand_tone',
  'main_products',
  'instagram_handle',
  'tiktok_handle',
  'linkedin_url',
  'website_url',
  'google_maps_url',
  'logo_url',
];

function computeCompleteness(dossier: Partial<BusinessDossier>): number {
  let filled = 0;
  for (const f of DOSSIER_FIELDS) {
    const val = dossier[f];
    if (val && (typeof val !== 'string' || val.trim().length > 0)) {
      filled++;
    }
  }
  return Math.round((filled / DOSSIER_FIELDS.length) * 100);
}

// ─── Types ──────────────────────────────────────────────
interface UploadedFile {
  name: string;
  url: string;
  type: string;
  uploaded_at: string;
}

// ─── Main Component ─────────────────────────────────────
export default function DossierPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Dossier fields
  const [companyName, setCompanyName] = useState('');
  const [companyDescription, setCompanyDescription] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [brandTone, setBrandTone] = useState('');
  const [mainProducts, setMainProducts] = useState('');
  const [competitors, setCompetitors] = useState('');
  const [uniqueSellingPoints, setUniqueSellingPoints] = useState('');
  const [businessGoals, setBusinessGoals] = useState('');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [tiktokHandle, setTiktokHandle] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [dossierExtra, setDossierExtra] = useState<Record<string, string>>({});
  const [currentStep, setCurrentStep] = useState(0);
  const [conversationMode, setConversationMode] = useState(true); // Start with conversation
  const [conversationAnswers, setConversationAnswers] = useState<string[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);

  const CONVERSATION_QUESTIONS = [
    { question: 'Comment s\'appelle votre entreprise et que faites-vous ?', placeholder: 'Ex: Je suis boulanger a Lyon, je vends du pain artisanal et des viennoiseries...', icon: '\uD83C\uDFE2' },
    { question: 'Qui sont vos clients ideaux ?', placeholder: 'Ex: Les familles du quartier, les gens qui aiment le bio, les 25-55 ans...', icon: '\uD83C\uDFAF' },
    { question: 'Qu\'est-ce qui vous differencie de vos concurrents ?', placeholder: 'Ex: On utilise que du levain naturel, on livre a velo, on a 4.8 sur Google...', icon: '\u2B50' },
    { question: 'Ou etes-vous present en ligne ? (Instagram, site web, Google Maps...)', placeholder: 'Ex: Instagram @maboulangerie, site maboulangerie.fr, Google Maps...', icon: '\uD83C\uDF10' },
    { question: 'Quel est votre objectif principal avec KeiroAI ?', placeholder: 'Ex: Plus de clients, publier regulierement sur les reseaux, automatiser ma prospection...', icon: '\uD83D\uDE80' },
  ];

  const STEPS = [
    { title: 'Parlez-nous de vous', icon: '\uD83D\uDCAC', description: 'Repondez a 5 questions rapides (ecrit ou vocal)' },
    { title: 'Votre entreprise', icon: '\uD83C\uDFE2', description: 'Verifiez et completez les infos' },
    { title: 'Cible & positionnement', icon: '\uD83C\uDFAF', description: 'Public cible et ton de communication' },
    { title: 'Presence en ligne', icon: '\uD83C\uDF10', description: 'Reseaux sociaux et site web' },
    { title: 'Direction artistique', icon: '\uD83C\uDFA8', description: 'Couleurs, polices et style visuel' },
    { title: 'Logo & Documents', icon: '\uD83D\uDCC1', description: 'Logo et documents utiles' },
  ];

  // Voice-to-text using Web Speech API
  const startListening = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('La reconnaissance vocale n\'est pas supportee par votre navigateur. Utilisez Chrome.');
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setCurrentAnswer(prev => prev ? `${prev} ${transcript}` : transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.start();
  };

  // Submit conversation answer and move to next question
  const submitAnswer = () => {
    if (!currentAnswer.trim()) return;
    const newAnswers = [...conversationAnswers, currentAnswer.trim()];
    setConversationAnswers(newAnswers);
    setCurrentAnswer('');

    if (newAnswers.length >= CONVERSATION_QUESTIONS.length) {
      // All questions answered — AI processes answers to fill dossier
      processConversation(newAnswers);
    }
  };

  // AI processes the 5 answers to auto-fill the dossier
  const processConversation = async (answers: string[]) => {
    setAiProcessing(true);
    try {
      const res = await fetch('/api/agents/client-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          agent_id: 'onboarding',
          message: `ONBOARDING AUTO-SETUP. Voici les reponses du client aux 5 questions d'onboarding. Analyse et extrais les informations pour remplir son profil business.

Q1 (Entreprise): ${answers[0]}
Q2 (Clients ideaux): ${answers[1]}
Q3 (Differenciateurs): ${answers[2]}
Q4 (Presence en ligne): ${answers[3]}
Q5 (Objectif): ${answers[4]}

Reponds en JSON strict:
{
  "company_name": "...",
  "company_description": "...",
  "business_type": "...",
  "target_audience": "...",
  "brand_tone": "chaleureux|professionnel|decontracte|luxe|fun",
  "main_products": "...",
  "unique_selling_points": "...",
  "business_goals": "...",
  "instagram_handle": "..." ou null,
  "website_url": "..." ou null,
  "google_maps_url": "..." ou null,
  "recommended_agents": ["agent_id_1", "agent_id_2", "agent_id_3"]
}`,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const reply = data.message || '';
        // Try to parse JSON from reply
        try {
          const jsonMatch = reply.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            // Auto-fill the dossier fields
            if (parsed.company_name) setCompanyName(parsed.company_name);
            if (parsed.company_description) setCompanyDescription(parsed.company_description);
            if (parsed.business_type) setBusinessType(parsed.business_type);
            if (parsed.target_audience) setTargetAudience(parsed.target_audience);
            if (parsed.brand_tone) setBrandTone(parsed.brand_tone);
            if (parsed.main_products) setMainProducts(parsed.main_products);
            if (parsed.unique_selling_points) setUniqueSellingPoints(parsed.unique_selling_points);
            if (parsed.business_goals) setBusinessGoals(parsed.business_goals);
            if (parsed.instagram_handle) setInstagramHandle(parsed.instagram_handle.replace('@', ''));
            if (parsed.website_url) setWebsiteUrl(parsed.website_url);
            if (parsed.google_maps_url) setGoogleMapsUrl(parsed.google_maps_url);
          }
        } catch { /* AI didn't return valid JSON, that's OK */ }
      }
    } catch { /* silent */ }

    setAiProcessing(false);
    setSetupComplete(true);
    setConversationMode(false);
    setCurrentStep(1); // Go to verification step
    // Auto-save
    setTimeout(() => saveDossier(), 500);
  };

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Auth + Load dossier ──────────────────────────────
  useEffect(() => {
    async function init() {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        // Load dossier via API
        try {
          const res = await fetch('/api/business-dossier', { credentials: 'include' });
          if (res.ok) {
            const data = await res.json();
            if (data.dossier) {
              const d = data.dossier;
              setCompanyName(d.company_name || '');
              setCompanyDescription(d.company_description || '');
              setBusinessType(d.business_type || '');
              setTargetAudience(d.target_audience || '');
              setBrandTone(d.brand_tone || '');
              setMainProducts(d.main_products || '');
              setCompetitors(d.competitors || '');
              setUniqueSellingPoints(d.unique_selling_points || '');
              setBusinessGoals(d.business_goals || '');
              setInstagramHandle(d.instagram_handle || '');
              setTiktokHandle(d.tiktok_handle || '');
              setLinkedinUrl(d.linkedin_url || '');
              setWebsiteUrl(d.website_url || '');
              setGoogleMapsUrl(d.google_maps_url || '');
              setLogoUrl(d.logo_url || '');
              setUploadedFiles(Array.isArray(d.uploaded_files) ? d.uploaded_files : []);
            }
          }
        } catch {
          // Dossier doesn't exist yet — blank form
        }
      }

      setLoading(false);
    }
    init();
  }, []);

  // ─── Auto-save with debounce ──────────────────────────
  const saveDossier = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    setSaved(false);

    const dossierData: Partial<BusinessDossier> = {
      company_name: companyName || null,
      company_description: companyDescription || null,
      business_type: businessType || null,
      target_audience: targetAudience || null,
      brand_tone: brandTone || null,
      main_products: mainProducts || null,
      competitors: competitors || null,
      unique_selling_points: uniqueSellingPoints || null,
      business_goals: businessGoals || null,
      instagram_handle: instagramHandle || null,
      tiktok_handle: tiktokHandle || null,
      linkedin_url: linkedinUrl || null,
      website_url: websiteUrl || null,
      google_maps_url: googleMapsUrl || null,
      logo_url: logoUrl || null,
      uploaded_files: uploadedFiles,
    };

    try {
      await fetch('/api/business-dossier', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(dossierData),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Silent fail
    } finally {
      setSaving(false);
    }
  }, [user, companyName, companyDescription, businessType, targetAudience, brandTone, mainProducts, competitors, uniqueSellingPoints, businessGoals, instagramHandle, tiktokHandle, linkedinUrl, websiteUrl, googleMapsUrl, logoUrl, uploadedFiles]);

  // Debounced auto-save
  const triggerAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveDossier();
    }, 1500);
  }, [saveDossier]);

  // Trigger auto-save on any field change (after initial load)
  const isInitialLoad = useRef(true);
  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    if (!loading && user) {
      triggerAutoSave();
    }
  }, [companyName, companyDescription, businessType, targetAudience, brandTone, mainProducts, competitors, uniqueSellingPoints, businessGoals, instagramHandle, tiktokHandle, linkedinUrl, websiteUrl, googleMapsUrl, triggerAutoSave, loading, user]);

  // ─── Logo upload ──────────────────────────────────────
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Le fichier est trop volumineux (max 5 Mo)');
      return;
    }

    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'logo');

      const res = await fetch('/api/business-dossier/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setLogoUrl(data.url);
        // Trigger save
        setTimeout(() => saveDossier(), 500);
      } else {
        alert('Erreur lors du telechargement du logo');
      }
    } catch {
      alert('Erreur de connexion');
    } finally {
      setUploadingLogo(false);
    }
  };

  // ─── File upload ──────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;

    if (uploadedFiles.length + files.length > 10) {
      alert('Maximum 10 fichiers par dossier');
      return;
    }

    setUploadingFile(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024) {
          alert(`${file.name} est trop volumineux (max 5 Mo)`);
          continue;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', 'document');

        const res = await fetch('/api/business-dossier/upload', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          setUploadedFiles(prev => [...prev, {
            name: file.name,
            url: data.url,
            type: file.type,
            uploaded_at: new Date().toISOString(),
          }]);
        }
      }
      // Trigger save after all uploads
      setTimeout(() => saveDossier(), 500);
    } catch {
      alert('Erreur de connexion');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
    setTimeout(() => saveDossier(), 500);
  };

  // ─── Completeness ─────────────────────────────────────
  const completeness = computeCompleteness({
    company_name: companyName || null,
    company_description: companyDescription || null,
    business_type: businessType || null,
    target_audience: targetAudience || null,
    brand_tone: brandTone || null,
    main_products: mainProducts || null,
    instagram_handle: instagramHandle || null,
    tiktok_handle: tiktokHandle || null,
    linkedin_url: linkedinUrl || null,
    website_url: websiteUrl || null,
    google_maps_url: googleMapsUrl || null,
    logo_url: logoUrl || null,
  } as Partial<BusinessDossier>);

  // ─── Loading ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c1a3a] pt-16 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-400" />
      </div>
    );
  }

  // ─── Not logged in ────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0c1a3a] pt-16 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <h1 className="text-white font-bold text-xl mb-2">Dossier Business</h1>
          <p className="text-white/60 text-sm mb-6">Connectez-vous pour remplir votre dossier business.</p>
          <a href="/login" className="inline-block px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-xl">
            Se connecter
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0c1a3a] pt-16 pb-24 lg:pb-8">
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => currentStep > 0 ? setCurrentStep(currentStep - 1) : router.push('/assistant')}
            className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-xl">Dossier Business</h1>
            <p className="text-white/50 text-xs">
              {saving ? 'Sauvegarde...' : saved ? '\u2705 Sauvegarde !' : `Etape ${currentStep + 1}/${STEPS.length} — ${STEPS[currentStep].title}`}
            </p>
          </div>
          <span className="text-white font-bold text-sm">{completeness}%</span>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1 mb-6">
          {STEPS.map((step, i) => (
            <button
              key={i}
              onClick={() => setCurrentStep(i)}
              className="flex-1 group"
              title={step.title}
            >
              <div className={`h-1.5 rounded-full transition-all ${
                i < currentStep ? 'bg-green-500' : i === currentStep ? 'bg-purple-500' : 'bg-white/10'
              }`} />
              <div className={`text-center mt-1 hidden sm:block ${i === currentStep ? 'text-white/70' : 'text-white/20'}`}>
                <span className="text-[9px]">{step.icon}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Step title card */}
        <div className="bg-gradient-to-r from-purple-600/10 to-blue-600/10 border border-purple-500/20 rounded-xl px-4 py-3 mb-6 flex items-center gap-3">
          <span className="text-2xl">{STEPS[currentStep].icon}</span>
          <div>
            <div className="text-white font-bold text-sm">{STEPS[currentStep].title}</div>
            <div className="text-white/40 text-xs">{STEPS[currentStep].description}</div>
          </div>
        </div>

        {/* ═══ STEP 0: Conversation onboarding ═══ */}
        {currentStep === 0 && conversationMode && (
          <div className="space-y-4">
            {/* Previous answers */}
            {conversationAnswers.map((answer, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-start gap-3">
                  <span className="text-lg">{CONVERSATION_QUESTIONS[i].icon}</span>
                  <p className="text-white/60 text-sm font-medium">{CONVERSATION_QUESTIONS[i].question}</p>
                </div>
                <div className="ml-9 bg-purple-600/10 border border-purple-500/20 rounded-xl px-4 py-3">
                  <p className="text-white text-sm">{answer}</p>
                </div>
              </div>
            ))}

            {/* Current question */}
            {conversationAnswers.length < CONVERSATION_QUESTIONS.length && !aiProcessing && (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{CONVERSATION_QUESTIONS[conversationAnswers.length].icon}</span>
                  <div>
                    <p className="text-white font-bold text-base">{CONVERSATION_QUESTIONS[conversationAnswers.length].question}</p>
                    <p className="text-white/30 text-xs mt-0.5">Question {conversationAnswers.length + 1}/{CONVERSATION_QUESTIONS.length}</p>
                  </div>
                </div>

                <div className="relative">
                  <textarea
                    value={currentAnswer}
                    onChange={(e) => setCurrentAnswer(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAnswer(); } }}
                    placeholder={CONVERSATION_QUESTIONS[conversationAnswers.length].placeholder}
                    rows={3}
                    className="w-full px-4 py-3 bg-white/5 border border-white/15 rounded-xl text-white text-sm placeholder-white/25 focus:ring-2 focus:ring-purple-500/50 focus:border-transparent outline-none resize-none pr-24"
                    autoFocus
                  />
                  <div className="absolute right-2 bottom-2 flex items-center gap-1.5">
                    {/* Voice button */}
                    <button
                      onClick={startListening}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                        isListening
                          ? 'bg-red-500 text-white animate-pulse'
                          : 'bg-white/10 text-white/50 hover:bg-white/20'
                      }`}
                      title="Dicter votre reponse"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    </button>
                    {/* Send button */}
                    <button
                      onClick={submitAnswer}
                      disabled={!currentAnswer.trim()}
                      className="w-10 h-10 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white flex items-center justify-center disabled:opacity-30 transition-all"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </button>
                  </div>
                </div>

                {isListening && (
                  <div className="flex items-center gap-2 text-red-400 text-xs">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    Ecoute en cours... parlez maintenant
                  </div>
                )}
              </div>
            )}

            {/* AI Processing */}
            {aiProcessing && (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-400 mx-auto mb-4" />
                <p className="text-white font-semibold text-sm">Clara analyse vos reponses...</p>
                <p className="text-white/40 text-xs mt-1">Configuration automatique de votre espace en cours</p>
              </div>
            )}

            {/* Setup complete */}
            {setupComplete && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6 text-center">
                <div className="text-3xl mb-2">{'\u2705'}</div>
                <p className="text-green-400 font-bold text-base">Espace configure automatiquement !</p>
                <p className="text-white/40 text-xs mt-1">Verifiez et completez les informations ci-dessous</p>
                <button onClick={() => { setConversationMode(false); setCurrentStep(1); }} className="mt-4 px-6 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-xl text-sm">
                  Verifier mon profil {'\u2192'}
                </button>
              </div>
            )}

            {/* Skip conversation */}
            {!aiProcessing && !setupComplete && (
              <button
                onClick={() => { setConversationMode(false); setCurrentStep(1); }}
                className="w-full text-center text-white/30 text-xs hover:text-white/50 transition-colors py-2"
              >
                Passer et remplir manuellement {'\u2192'}
              </button>
            )}
          </div>
        )}

        {/* ═══ STEP 1: Informations generales ═══ */}
        {currentStep === 1 && (<>
        <SectionTitle title="Informations generales" icon="building" />

        <FormField label="Nom de l'entreprise" required>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Ex: Boulangerie du Marche"
            className="form-input-dark"
          />
        </FormField>

        <FormField label="Type d'activite" required>
          <select
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
            className="form-input-dark"
          >
            <option value="">Selectionner...</option>
            {BUSINESS_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Description de votre activite" required>
          <textarea
            value={companyDescription}
            onChange={(e) => setCompanyDescription(e.target.value)}
            placeholder="Decrivez votre activite en quelques phrases..."
            rows={3}
            className="form-input-dark resize-none"
          />
        </FormField>

        <FormField label="Produits / Services principaux" required>
          <textarea
            value={mainProducts}
            onChange={(e) => setMainProducts(e.target.value)}
            placeholder="Ex: Pains artisanaux, viennoiseries, patisseries fines..."
            rows={2}
            className="form-input-dark resize-none"
          />
        </FormField>

        </>)}

        {/* ═══ STEP 2: Cible & Positionnement ═══ */}
        {currentStep === 2 && (<>
        <SectionTitle title="Cible & Positionnement" icon="target" />

        <FormField label="Public cible" required>
          <textarea
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
            placeholder="Ex: Familles du quartier, 25-55 ans, soucieuses de la qualite..."
            rows={2}
            className="form-input-dark resize-none"
          />
        </FormField>

        <FormField label="Ton de communication" required>
          <div className="flex flex-wrap gap-2">
            {BRAND_TONES.map(tone => (
              <button
                key={tone.value}
                onClick={() => setBrandTone(tone.value)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  brandTone === tone.value
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                {tone.label}
              </button>
            ))}
          </div>
        </FormField>

        <FormField label="Points forts / Avantages concurrentiels">
          <textarea
            value={uniqueSellingPoints}
            onChange={(e) => setUniqueSellingPoints(e.target.value)}
            placeholder="Qu'est-ce qui vous differencie de vos concurrents ?"
            rows={2}
            className="form-input-dark resize-none"
          />
        </FormField>

        <FormField label="Concurrents principaux">
          <input
            type="text"
            value={competitors}
            onChange={(e) => setCompetitors(e.target.value)}
            placeholder="Ex: La Mie Caline, Paul, la boulangerie d'en face..."
            className="form-input-dark"
          />
        </FormField>

        <FormField label="Objectifs business">
          <textarea
            value={businessGoals}
            onChange={(e) => setBusinessGoals(e.target.value)}
            placeholder="Ex: Augmenter le trafic en boutique de 20%, lancer la livraison..."
            rows={2}
            className="form-input-dark resize-none"
          />
        </FormField>

        </>)}

        {/* ═══ STEP 3: Presence en ligne ═══ */}
        {currentStep === 3 && (<>
        <SectionTitle title="Presence en ligne" icon="globe" />

        <FormField label="Compte Instagram">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">@</span>
            <input
              type="text"
              value={instagramHandle}
              onChange={(e) => setInstagramHandle(e.target.value.replace('@', ''))}
              placeholder="votre_compte"
              className="form-input-dark pl-8"
            />
          </div>
        </FormField>

        <FormField label="Compte TikTok">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">@</span>
            <input
              type="text"
              value={tiktokHandle}
              onChange={(e) => setTiktokHandle(e.target.value.replace('@', ''))}
              placeholder="votre_compte"
              className="form-input-dark pl-8"
            />
          </div>
        </FormField>

        <FormField label="Page LinkedIn">
          <input
            type="url"
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            placeholder="https://linkedin.com/company/..."
            className="form-input-dark"
          />
        </FormField>

        <FormField label="Site web">
          <input
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://www.monsite.fr"
            className="form-input-dark"
          />
        </FormField>

        <FormField label="Fiche Google Maps">
          <input
            type="url"
            value={googleMapsUrl}
            onChange={(e) => setGoogleMapsUrl(e.target.value)}
            placeholder="https://maps.google.com/..."
            className="form-input-dark"
          />
        </FormField>

        </>)}

        {/* ═══ STEP 4: Direction Artistique ═══ */}
        {currentStep === 4 && (<>
        <SectionTitle title="Direction Artistique (DA)" icon="palette" />

        <div className="bg-gradient-to-r from-purple-600/10 to-blue-600/10 border border-purple-500/20 rounded-xl p-4 mb-4">
          <p className="text-purple-300 text-xs font-semibold mb-1">{'\uD83C\uDFA8'} Pourquoi c&apos;est important ?</p>
          <p className="text-white/40 text-[11px]">Vos agents utilisent ces informations pour creer du contenu fidele a votre marque : posts Instagram, emails, visuels publicitaires, etc.</p>
        </div>

        <FormField label="Couleurs de marque (codes hex)">
          <input
            type="text"
            value={(dossierExtra as any).brand_colors || ''}
            onChange={(e) => { setDossierExtra(prev => ({ ...prev, brand_colors: e.target.value })); triggerAutoSave(); }}
            placeholder="Ex: #FF5733, #2E86AB, #FFFFFF"
            className="form-input-dark"
          />
        </FormField>

        <FormField label="Polices / Typographie">
          <input
            type="text"
            value={(dossierExtra as any).brand_fonts || ''}
            onChange={(e) => { setDossierExtra(prev => ({ ...prev, brand_fonts: e.target.value })); triggerAutoSave(); }}
            placeholder="Ex: Montserrat pour les titres, Open Sans pour le texte"
            className="form-input-dark"
          />
        </FormField>

        <FormField label="Style visuel prefere">
          <div className="flex flex-wrap gap-2">
            {['Minimaliste', 'Moderne/Tech', 'Luxe/Elegant', 'Coloré/Fun', 'Nature/Organique', 'Retro/Vintage', 'Photo realiste', 'Illustration'].map(style => (
              <button
                key={style}
                onClick={() => { setDossierExtra(prev => ({ ...prev, visual_style: style })); triggerAutoSave(); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  (dossierExtra as any).visual_style === style
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                }`}
              >
                {style}
              </button>
            ))}
          </div>
        </FormField>

        </>)}

        {/* ═══ STEP 5: Logo & Documents ═══ */}
        {currentStep === 5 && (<>
        <SectionTitle title="Logo & Documents" icon="upload" />

        {/* Recommended documents */}
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 mb-4">
          <p className="text-white/60 text-xs font-semibold mb-2">{'\uD83D\uDCCB'} Documents recommandes pour une personnalisation optimale :</p>
          <div className="space-y-1.5">
            {[
              { doc: 'Logo (PNG/SVG haute resolution)', priority: 'Essentiel', icon: '\uD83C\uDFA8' },
              { doc: 'Charte graphique / Brand book', priority: 'Recommande', icon: '\uD83D\uDCD6' },
              { doc: 'Photos de vos produits/services', priority: 'Recommande', icon: '\uD83D\uDCF8' },
              { doc: 'Menu / Catalogue / Tarifs', priority: 'Utile', icon: '\uD83D\uDCCB' },
              { doc: 'Photos de votre equipe/local', priority: 'Utile', icon: '\uD83C\uDFE2' },
              { doc: 'Exemples de posts que vous aimez', priority: 'Bonus', icon: '\u2B50' },
              { doc: 'Temoignages clients', priority: 'Bonus', icon: '\uD83D\uDCAC' },
            ].map(item => (
              <div key={item.doc} className="flex items-center gap-2 text-[11px]">
                <span>{item.icon}</span>
                <span className="text-white/70 flex-1">{item.doc}</span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                  item.priority === 'Essentiel' ? 'bg-red-500/20 text-red-400'
                  : item.priority === 'Recommande' ? 'bg-purple-500/20 text-purple-300'
                  : item.priority === 'Utile' ? 'bg-blue-500/20 text-blue-300'
                  : 'bg-white/10 text-white/40'
                }`}>{item.priority}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Logo upload */}
        <FormField label="Logo de l'entreprise">
          <div className="flex items-center gap-4">
            {logoUrl ? (
              <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-white/10 flex-shrink-0">
                <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
                <button
                  onClick={() => { setLogoUrl(''); triggerAutoSave(); }}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"
                >
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-3 px-4 py-3 bg-white/5 border border-dashed border-white/20 rounded-xl cursor-pointer hover:bg-white/10 transition-colors w-full">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                  disabled={uploadingLogo}
                />
                {uploadingLogo ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-400" />
                ) : (
                  <svg className="w-5 h-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
                <span className="text-white/50 text-sm">
                  {uploadingLogo ? 'Telechargement...' : 'Telecharger votre logo (PNG, JPG, max 5 Mo)'}
                </span>
              </label>
            )}
          </div>
        </FormField>

        {/* Documents upload */}
        <FormField label="Documents (charte graphique, menu, catalogue...)">
          <label className="flex items-center gap-3 px-4 py-3 bg-white/5 border border-dashed border-white/20 rounded-xl cursor-pointer hover:bg-white/10 transition-colors w-full mb-3">
            <input
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
              multiple
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploadingFile || uploadedFiles.length >= 10}
            />
            {uploadingFile ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-400" />
            ) : (
              <svg className="w-5 h-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            )}
            <span className="text-white/50 text-sm">
              {uploadingFile
                ? 'Telechargement...'
                : uploadedFiles.length >= 10
                  ? 'Maximum 10 fichiers atteint'
                  : `Ajouter des fichiers (${uploadedFiles.length}/10)`
              }
            </span>
          </label>

          {/* Uploaded files list */}
          {uploadedFiles.length > 0 && (
            <div className="space-y-2">
              {uploadedFiles.map((file, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 bg-white/5 rounded-lg">
                  <svg className="w-4 h-4 text-white/40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-white/70 text-sm flex-1 truncate">{file.name}</span>
                  <button
                    onClick={() => handleRemoveFile(i)}
                    className="text-white/30 hover:text-red-400 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </FormField>

        </>)}

        {/* Navigation buttons */}
        <div className="mt-8 flex gap-3">
          {currentStep > 0 && (
            <button
              onClick={() => setCurrentStep(currentStep - 1)}
              className="flex-1 py-3.5 bg-white/10 text-white/70 font-semibold rounded-xl hover:bg-white/20 transition-all text-sm"
            >
              {'\u2190'} Precedent
            </button>
          )}
          {currentStep < STEPS.length - 1 ? (
            <button
              onClick={() => { saveDossier(); setCurrentStep(currentStep + 1); }}
              className="flex-1 py-3.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-purple-500/20 transition-all text-sm"
            >
              Suivant {'\u2192'}
            </button>
          ) : (
            <button
              onClick={() => { saveDossier(); router.push('/assistant'); }}
              disabled={saving}
              className="flex-1 py-3.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-green-500/20 disabled:opacity-60 transition-all text-sm"
            >
              {saving ? 'Sauvegarde...' : '\u2705 Terminer et lancer mes agents'}
            </button>
          )}
        </div>
      </div>

      {/* Global styles */}
      <style jsx global>{`
        .form-input-dark {
          width: 100%;
          padding: 0.75rem 1rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 0.75rem;
          color: white;
          font-size: 0.875rem;
          outline: none;
          transition: all 0.2s;
        }
        .form-input-dark:focus {
          border-color: rgba(168, 85, 247, 0.5);
          box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.1);
        }
        .form-input-dark::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }
        .form-input-dark option {
          background: #0c1a3a;
          color: white;
        }
      `}</style>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────

function SectionTitle({ title, icon }: { title: string; icon: string }) {
  const icons: Record<string, React.ReactNode> = {
    building: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    target: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    globe: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
      </svg>
    ),
    upload: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    ),
    palette: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
      </svg>
    ),
  };

  return (
    <div className="flex items-center gap-2 mb-4 mt-8 first:mt-0">
      <div className="w-8 h-8 rounded-lg bg-purple-600/20 flex items-center justify-center text-purple-400">
        {icons[icon]}
      </div>
      <h2 className="text-white font-semibold text-base">{title}</h2>
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-white/70 text-sm font-medium mb-1.5">
        {label}
        {required && <span className="text-purple-400 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}
