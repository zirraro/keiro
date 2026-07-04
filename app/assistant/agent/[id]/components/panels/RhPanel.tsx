'use client';

/**
 * Sara — RH & juridique dashboard panel.
 * Extracted from AgentDashboard.tsx.
 */

import {
  fmt, fmtDate,
  KpiCard, SectionTitle, EmptyState, ActionButton,
} from './Primitives';
import { useLanguage } from '@/lib/i18n/context';
import type { PanelProps } from './types';

export function RhPanel({ data, agentName, gradientFrom, gradientTo }: PanelProps) {
  const { t, locale } = useLanguage();
  const isEn = locale === 'en';
  const p = t.panels;
  // Ouvre le chat de Sara avec une demande pré-remplie (le doc se génère dans la
  // conversation). Fallback : ancre chat si pas de handler global.
  const askSara = (prompt: string) => {
    try {
      window.dispatchEvent(new CustomEvent('keiro:agent-chat', { detail: { agent: 'rh', prompt } }));
    } catch { /* noop */ }
    const el = document.querySelector('[data-agent-chat-input]') as HTMLTextAreaElement | HTMLInputElement | null;
    if (el) { (el as any).value = prompt; el.focus(); }
  };
  const stats: any = data.rhStats || { docsGenerated: 0, questionsAnswered: 0, activeContracts: 0, rgpdCompliant: true, alertsCount: 0, recentDocs: [] };

  const docTypeBadge: Record<string, string> = {
    contrat: '#60a5fa',
    avenant: '#e879f9',
    fiche_paie: '#34d399',
    attestation: '#fbbf24',
    reglement: '#f87171',
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label={p.rhKpiDocs} value={fmt(stats.docsGenerated)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label={p.rhKpiQuestions} value={fmt(stats.questionsAnswered)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <KpiCard label={p.rhKpiContracts} value={fmt(stats.activeContracts)} gradientFrom={gradientFrom} gradientTo={gradientTo} />
      </div>

      <SectionTitle>{p.rhSectionRecent}</SectionTitle>
      {stats.recentDocs.length === 0 ? (
        <EmptyState agentName={agentName} />
      ) : (
        <div className="flex flex-col gap-2">
          {(stats.recentDocs || []).slice(0, 5).map((doc: any, i: number) => (
            <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-4 flex items-center gap-3">
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                style={{
                  backgroundColor: `${docTypeBadge[doc.type] ?? '#a78bfa'}22`,
                  color: docTypeBadge[doc.type] ?? '#a78bfa',
                }}
              >
                {doc.type}
              </span>
              <span className="text-sm text-white/80 truncate flex-1">{doc.title}</span>
              <span className="text-xs text-white/40 shrink-0">{fmtDate(doc.date || doc.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Catalogue de documents \u2014 choix + exemples (founder 03/07). Un clic
          pr\u00e9-remplit la demande dans le chat, Sara g\u00e9n\u00e8re le document. */}
      {(() => {
        const docs = [
          { icon: '\ud83d\udcc4', cat: 'RH', title: isEn ? 'Employment contract (CDI/CDD)' : 'Contrat de travail (CDI/CDD)', ex: isEn ? 'Full-time CDI, 35h, 3-month trial' : 'CDI temps plein, 35h, essai 3 mois', ask: isEn ? 'Draft a full-time permanent employment contract (CDI)' : 'R\u00e9dige un contrat de travail CDI temps plein' },
          { icon: '\u270d\ufe0f', cat: 'RH', title: isEn ? 'Job offer letter' : 'Promesse d\u2019embauche', ex: isEn ? 'Role, salary, start date, deadline to accept' : 'Poste, salaire, date d\u2019entr\u00e9e, d\u00e9lai d\u2019acceptation', ask: isEn ? 'Draft a job offer letter' : 'R\u00e9dige une promesse d\u2019embauche' },
          { icon: '\ud83d\udd01', cat: 'RH', title: isEn ? 'Contract amendment' : 'Avenant au contrat', ex: isEn ? 'Switch to part-time 24h' : 'Passage \u00e0 temps partiel 24h', ask: isEn ? 'Draft a part-time amendment (24h)' : 'R\u00e9dige un avenant temps partiel 24h' },
          { icon: '\ud83d\udcdc', cat: 'RH', title: isEn ? 'Employer certificate' : 'Attestation employeur', ex: isEn ? 'Proof of employment for a rental/bank' : 'Preuve d\u2019emploi pour bailleur/banque', ask: isEn ? 'Draft an employer certificate' : 'R\u00e9dige une attestation employeur' },
          { icon: '\ud83e\udd1d', cat: 'RH', title: isEn ? 'Mutual termination' : 'Rupture conventionnelle', ex: isEn ? 'Steps + Cerfa + indemnity estimate' : '\u00c9tapes + Cerfa + estimation indemnit\u00e9', ask: isEn ? 'Guide me through a mutual termination and draft the documents' : 'Guide-moi pour une rupture conventionnelle et r\u00e9dige les documents' },
          { icon: '\ud83d\udcd5', cat: isEn ? 'Legal' : 'Juridique', title: isEn ? 'Internal rules' : 'R\u00e8glement int\u00e9rieur', ex: isEn ? 'Mandatory from 11+ employees' : 'Obligatoire d\u00e8s 11 salari\u00e9s', ask: isEn ? 'Draft internal company rules' : 'R\u00e9dige un r\u00e8glement int\u00e9rieur' },
          { icon: '\u2696\ufe0f', cat: isEn ? 'Legal' : 'Juridique', title: isEn ? 'Terms of sale (T&Cs)' : 'CGV / CGU', ex: isEn ? 'For your website / online orders' : 'Pour ton site / commandes en ligne', ask: isEn ? 'Draft terms and conditions of sale for my website' : 'R\u00e9dige des CGV pour mon site' },
          { icon: '\ud83d\udd12', cat: isEn ? 'Legal' : 'Juridique', title: isEn ? 'Privacy policy (GDPR)' : 'Politique RGPD & mentions l\u00e9gales', ex: isEn ? 'Data collected, rights, cookies' : 'Donn\u00e9es collect\u00e9es, droits, cookies', ask: isEn ? 'Draft a GDPR privacy policy and legal notice' : 'R\u00e9dige une politique RGPD et des mentions l\u00e9gales' },
        ];
        return (
          <div className="mt-4 rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/[0.05] p-3 sm:p-4">
            <div className="text-sm font-semibold text-white/90 mb-1">{isEn ? '\ud83d\udcc1 Documents Sara generates' : '\ud83d\udcc1 Les documents que Sara g\u00e9n\u00e8re'}</div>
            <p className="text-[11px] text-white/45 mb-3">{isEn ? 'Pick one \u2014 Sara drafts it in the chat, you brand it (logo + colors) and export to PDF/Word.' : 'Choisis-en un \u2014 Sara le r\u00e9dige dans le chat, tu le mets \u00e0 ta marque (logo + couleurs) et l\u2019exportes en PDF/Word.'}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {docs.map((d, i) => (
                <button key={i} type="button" onClick={() => askSara(d.ask)} className="text-left rounded-lg border border-white/10 bg-white/[0.03] p-2.5 hover:border-fuchsia-400/40 hover:bg-fuchsia-500/[0.06] transition">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-[12px] font-semibold text-white/85">{d.icon} {d.title}</span>
                    <span className="text-[9px] uppercase tracking-wide text-fuchsia-300/70 shrink-0">{d.cat}</span>
                  </div>
                  <div className="text-[10px] italic text-fuchsia-200/70 leading-relaxed">{d.ex}</div>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Questions RH & juridiques que Sara sait traiter (montrer la comp\u00e9tence) */}
      {(() => {
        const qa = [
          { cat: 'RH', q: isEn ? 'How do I handle job abandonment?' : 'Comment g\u00e9rer un abandon de poste ?', a: isEn ? 'Formal notice \u2192 presumption of resignation procedure, with the right delays.' : 'Mise en demeure \u2192 proc\u00e9dure de pr\u00e9somption de d\u00e9mission, avec les bons d\u00e9lais.' },
          { cat: 'RH', q: isEn ? 'How long can a CDI trial period last?' : 'Quelle dur\u00e9e pour une p\u00e9riode d\u2019essai en CDI ?', a: isEn ? '2 months (workers/employees) up to 4 (executives), renewal possible if the branch allows.' : '2 mois (ouvriers/employ\u00e9s) jusqu\u2019\u00e0 4 (cadres), renouvellement possible si la branche le pr\u00e9voit.' },
          { cat: isEn ? 'Legal' : 'Juridique', q: isEn ? 'Must I display legal notices on my site?' : 'Suis-je oblig\u00e9 d\u2019afficher des mentions l\u00e9gales ?', a: isEn ? 'Yes \u2014 identity, SIRET, host. Missing = fine up to \u20ac75k.' : 'Oui \u2014 identit\u00e9, SIRET, h\u00e9bergeur. Absentes = amende jusqu\u2019\u00e0 75k\u20ac.' },
          { cat: isEn ? 'Legal' : 'Juridique', q: isEn ? 'GDPR: a client asks to delete their data?' : 'RGPD : un client demande la suppression de ses donn\u00e9es ?', a: isEn ? 'Right to erasure \u2014 act within 1 month, document it, keep legal-obligation data.' : 'Droit \u00e0 l\u2019effacement \u2014 agir sous 1 mois, tracer, conserver ce qu\u2019impose la loi.' },
        ];
        return (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:p-4">
            <div className="text-sm font-semibold text-white/90 mb-2">{isEn ? '\ud83d\udcac Questions Sara can answer' : '\ud83d\udcac Des questions que Sara sait traiter'}</div>
            <div className="space-y-2">
              {qa.map((x, i) => (
                <button key={i} type="button" onClick={() => askSara(x.q)} className="w-full text-left rounded-lg border border-white/10 bg-white/[0.03] p-2.5 hover:border-white/20 transition">
                  <div className="text-[11px] font-medium text-white/85">{x.cat === 'RH' ? '\ud83d\udc65' : '\u2696\ufe0f'} {x.q}</div>
                  <div className="text-[10px] text-white/45 leading-relaxed mt-0.5">{x.a}</div>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <ActionButton label={p.rhBtnGenerate} gradientFrom={gradientFrom} gradientTo={gradientTo} />
        <a href="/assistant/crm" className="px-4 py-2 bg-white/10 text-white/70 text-xs font-medium rounded-xl hover:bg-white/15">
          {'\u{1F4CA}'} {p.viewCrm}
        </a>
      </div>
    </>
  );
}
