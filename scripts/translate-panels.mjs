/**
 * One-shot batch translator: replace hardcoded French strings in simple
 * agent panels with t.panels.xxx lookups. Each panel already has the
 * useLanguage hook wired — this script only replaces string literals.
 */
import fs from 'fs';
import path from 'path';

const PANELS_DIR = 'app/assistant/agent/[id]/components/panels';

const replacements = {
  'SeoPanel.tsx': [
    ['label="Articles blog"', 'label={p.seoKpiArticles}'],
    ['label="Mots-cles suivis"', 'label={p.seoKpiKeywords}'],
    ['label="Actions SEO"', 'label={p.seoKpiActions}'],
    ['<SectionTitle>Workflow SEO</SectionTitle>', '<SectionTitle>{p.seoSectionWorkflow}</SectionTitle>'],
    [`{ label: 'Mots-cles',`, `{ label: p.seoLabelKeywords,`],
    [`{ label: 'Articles',`, `{ label: p.seoLabelArticles,`],
    [`{ label: 'Indexes',`, `{ label: p.seoLabelIndexed,`],
    [`{ label: 'Trafic',`, `{ label: p.seoLabelTraffic,`],
    ['Les articles <strong className="text-emerald-400">indexes</strong> generent du trafic organique en continu', '{p.seoWorkflowNote}'],
    ['Voir le blog', '{p.seoBtnViewBlog}'],
    ['Générer un article', '{p.seoBtnGenerateArticle}'],
    ['<SectionTitle>Actions SEO recentes</SectionTitle>', '<SectionTitle>{p.seoSectionActions}</SectionTitle>'],
    ['<SectionTitle>Suivi mots-cles</SectionTitle>', '<SectionTitle>{p.seoSectionTracking}</SectionTitle>'],
    ['Le suivi detaille des mots-cles arrive bientot.', '{p.seoTrackingComingSoon}'],
    ['Demandez a {agentName} vos positions actuelles.', '{p.seoTrackingAsk.replace(\'{agent}\', agentName)}'],
  ],
  'RhPanel.tsx': [
    ['label="Docs generes"', 'label={p.rhKpiDocs}'],
    ['label="Questions repondues"', 'label={p.rhKpiQuestions}'],
    ['label="Contrats actifs"', 'label={p.rhKpiContracts}'],
    ['<SectionTitle>Documents recents</SectionTitle>', '<SectionTitle>{p.rhSectionRecent}</SectionTitle>'],
    ['Générer un document', '{p.rhBtnGenerate}'],
    ['Voir le CRM', '{p.viewCrm}'],
    ['label="Générer un document"', 'label={p.rhBtnGenerate}'],
  ],
  'FinancePanel.tsx': [
    ['label="Chiffre d\'affaires"', 'label={p.financeKpiRevenue}'],
    ['label="Depenses"', 'label={p.financeKpiExpenses}'],
    ['label="Marge"', 'label={p.financeKpiMargin}'],
    ['<SectionTitle>Revenus vs Depenses</SectionTitle>', '<SectionTitle>{p.financeSectionPerf}</SectionTitle>'],
    ['>Revenus<', '>{p.financeLabelRevenue}<'],
    ['>Depenses<', '>{p.financeLabelExpenses}<'],
    ['<SectionTitle>Transactions recentes</SectionTitle>', '<SectionTitle>{p.financeSectionRecent}</SectionTitle>'],
    ['Voir le CRM', '{p.viewCrm}'],
    ['Générer un rapport', '{p.generateReport}'],
  ],
  'GenericPanel.tsx': [
    ['label="Messages echanges"', 'label={p.genericKpiMessages}'],
    ['label="Recommandations"', 'label={p.genericKpiRec}'],
    ['label="Score engagement"', 'label={p.genericKpiScore}'],
    ['<SectionTitle>Recommandations recentes</SectionTitle>', '<SectionTitle>{p.genericSectionRec}</SectionTitle>'],
    ['{agentName} a analyse {fmt(data.totalMessages || 0)} donnees cette semaine.', '{p.genericWeeklySummary.replace(\'{agent}\', agentName).replace(\'{n}\', fmt(data.totalMessages || 0))}'],
    ['Générer du contenu', '{p.createContent}'],
    ['Voir le CRM', '{p.viewCrm}'],
  ],
  'ChatbotPanel.tsx': [
    ['label="Visiteurs accueillis"', 'label={p.chatbotKpiVisitors}'],
    ['label="Leads captes"', 'label={p.chatbotKpiLeads}'],
    ['label="Taux conversion"', 'label={p.chatbotKpiConv}'],
    ['<SectionTitle>Entonnoir de conversion</SectionTitle>', '<SectionTitle>{p.chatbotSectionFunnel}</SectionTitle>'],
    ['<SectionTitle>Sessions recentes</SectionTitle>', '<SectionTitle>{p.chatbotSectionRecent}</SectionTitle>'],
    [`{ label: 'Visiteurs', value: visitors },`, `{ label: p.chatbotLabelVisitors, value: visitors },`],
    [`{ label: 'Leads', value: leads },`, `{ label: p.chatbotLabelLeads, value: leads },`],
    [`{ label: 'Convertis', value: Math.round(leads * (stats.conversionRate / 100)) },`, `{ label: p.chatbotLabelConverted, value: Math.round(leads * (stats.conversionRate / 100)) },`],
    ['Personnaliser les messages', '{p.chatbotBtnPersonalize}'],
    ['Voir le CRM', '{p.viewCrm}'],
    ['label="Configurer le chatbot"', 'label={p.chatbotBtnConfigure}'],
  ],
  'WhatsAppPanel.tsx': [
    ['label="Messages envoyes"', 'label={p.whatsappKpiSent}'],
    ['label="Messages recus"', 'label={p.whatsappKpiReceived}'],
    ['label="Taux reponse"', 'label={p.whatsappKpiRate}'],
    ['label="Leads generes"', 'label={p.whatsappKpiLeads}'],
    ['<SectionTitle>Performance</SectionTitle>', '<SectionTitle>{p.whatsappSectionPerf}</SectionTitle>'],
    ['<SectionTitle>Conversations actives ({stats.conversationsActive})</SectionTitle>', '<SectionTitle>{p.whatsappSectionActive.replace(\'{n}\', String(stats.conversationsActive))}</SectionTitle>'],
    ['Aucune conversation recente', '{p.whatsappNoConvs}'],
    ['Creer un template WhatsApp', '{p.whatsappBtnCreateTemplate}'],
    ['Voir le CRM', '{p.viewCrm}'],
    [`label: 'Envoyés'`, `label: p.whatsappLabelSent`],
    [`label: 'Recus'`, `label: p.whatsappLabelReceived`],
    [`label: 'Leads'`, `label: p.whatsappLabelLeads`],
    ['label="Conversion leads"', 'label={p.whatsappLabelLeadRate}'],
    ['label="Conversations actives"', 'label={p.whatsappLabelConvsActive}'],
  ],
  'TiktokCommentsPanel.tsx': [
    ['<span className="text-white/30 text-[10px]">Videos</span>', '<span className="text-white/30 text-[10px]">{p.tiktokKpiVideos}</span>'],
    ['<span className="text-white/30 text-[10px]">Vues</span>', '<span className="text-white/30 text-[10px]">{p.tiktokKpiViews}</span>'],
    ['<span className="text-white/30 text-[10px]">Engagement</span>', '<span className="text-white/30 text-[10px]">{p.tiktokKpiEngagement}</span>'],
    ['<span className="text-white/30 text-[10px]">Followers</span>', '<span className="text-white/30 text-[10px]">{p.tiktokKpiFollowers}</span>'],
    ['<SectionTitle>Commentaires TikTok</SectionTitle>', '<SectionTitle>{p.tiktokSectionComments}</SectionTitle>'],
    ['Creer du contenu TikTok', '{p.tiktokBtnCreate}'],
    ['Voir le CRM', '{p.viewCrm}'],
    ['label="Configurer l\'engagement"', 'label={p.tiktokBtnConfigure}'],
    ['autoLabel="Engagement automatique" manualLabel="Engagement manuel" autoDesc="Axel commente et engage automatiquement" manualDesc="Tu valides chaque interaction"', 'autoLabel={p.tiktokToggleAutoLabel} manualLabel={p.tiktokToggleManualLabel} autoDesc={p.tiktokToggleAutoDesc} manualDesc={p.tiktokToggleManualDesc}'],
    ['<SectionTitle>Actions recentes</SectionTitle>', '<SectionTitle>{p.recentActions}</SectionTitle>'],
  ],
  'AdsPanel.tsx': [
    ['label="Campagnes actives"', 'label={p.adsKpiActive}'],
    ['label="Budget total"', 'label={p.adsKpiBudget}'],
    ['label="ROAS moyen"', 'label={p.adsKpiRoas}'],
    ['<SectionTitle>Performance visuelle</SectionTitle>', '<SectionTitle>{p.adsSectionPerf}</SectionTitle>'],
    ['<SectionTitle>Campagnes</SectionTitle>', '<SectionTitle>{p.adsSectionCampaigns}</SectionTitle>'],
    ['<SectionTitle>Repartition budget</SectionTitle>', '<SectionTitle>{p.adsSectionBudget}</SectionTitle>'],
    ['Creer une campagne', '{p.adsBtnCreate}'],
    ['Voir le CRM', '{p.viewCrm}'],
    ['Aucune campagne', '{p.adsNoCampaign}'],
  ],
  'CeoPanel.tsx': [
    ['label="Prospects"', 'label={p.ceoKpiProspects}'],
    ['label="Chauds"', 'label={p.ceoKpiHot}'],
    ['label="Emails envoyes"', 'label={p.ceoKpiEmailsSent}'],
    ['label="Taux ouverture"', 'label={p.ceoKpiOpenRate}'],
    ['<SectionTitle>Performance des agents</SectionTitle>', '<SectionTitle>{p.ceoSectionAgents}</SectionTitle>'],
    ['<SectionTitle>Canaux actifs</SectionTitle>', '<SectionTitle>{p.ceoSectionChannels}</SectionTitle>'],
    ['<SectionTitle>Strategie en cours</SectionTitle>', '<SectionTitle>{p.ceoSectionStrategy}</SectionTitle>'],
    ['>DMs envoyes<', '>{p.ceoStatDmsSent}<'],
    ['>Publications<', '>{p.ceoStatPublications}<'],
    ['>Emails<', '>{p.ceoStatEmails}<'],
    ['>Prospects chauds<', '>{p.ceoStatHotProspects}<'],
    ['Aucune strategie definie — va dans Clara pour en choisir une', '{p.ceoStrategyEmpty}'],
    ['label="Parler a Noah"', 'label={p.ceoBtnTalk}'],
    [`status === 'erreur' ? 'text-red-400' : status === 'actif' ? 'text-green-400' : 'text-white/20'}\`>
                {status || 'en attente'}`, `status === 'erreur' ? 'text-red-400' : status === 'actif' ? 'text-green-400' : 'text-white/20'}\`>
                {status === 'erreur' ? p.ceoStatusError : status === 'actif' ? p.ceoStatusActive : p.ceoStatusWaiting}`],
  ],
  'CommercialPanel.tsx': [
    ['label="Total prospects"', 'label={p.commercialKpiTotal}'],
    ['label="Ajoutes aujourd\'hui"', 'label={p.commercialKpiToday}'],
    ['label="Chauds"', 'label={p.commercialKpiHot}'],
    ['label="Tiedes"', 'label={p.commercialKpiWarm}'],
    ['label="Conversion"', 'label={p.commercialKpiConversion}'],
    ['<SectionTitle>Activite par periode</SectionTitle>', '<SectionTitle>{p.commercialSectionPeriod}</SectionTitle>'],
    ['>Aujourd\'hui<', '>{p.commercialLabelToday}<'],
    ['>Cette semaine<', '>{p.commercialLabelThisWeek}<'],
    ['>Ce mois<', '>{p.commercialLabelThisMonth}<'],
    ['<SectionTitle>Prospects par canal</SectionTitle>', '<SectionTitle>{p.commercialSectionChannel}</SectionTitle>'],
    ['>Avec email<', '>{p.commercialWithEmail}<'],
    ['>Avec Instagram<', '>{p.commercialWithInstagram}<'],
    ['>Avec TikTok<', '>{p.commercialWithTiktok}<'],
    ['>Avec LinkedIn<', '>{p.commercialWithLinkedin}<'],
    ['<SectionTitle>Funnel prospection</SectionTitle>', '<SectionTitle>{p.commercialSectionFunnel}</SectionTitle>'],
    ['>Identifies<', '>{p.commercialLabelIdentified}<'],
    ['>Contactes<', '>{p.commercialLabelContacted}<'],
    ['>Qualifies<', '>{p.commercialLabelQualified}<'],
    ['<SectionTitle>Pipeline</SectionTitle>', '<SectionTitle>{p.commercialSectionPipeline}</SectionTitle>'],
    ['<SectionTitle>Actions rapides</SectionTitle>', '<SectionTitle>{p.commercialSectionQuickActions}</SectionTitle>'],
    ['<SectionTitle>Dernieres actions</SectionTitle>', '<SectionTitle>{p.recentActions}</SectionTitle>'],
    ['placeholder="Type de commerce, ville... (optionnel)"', 'placeholder={p.commercialLaunchInput}'],
    ['{\'\\uD83D\\uDD0D\'} Prospecter', `{'\\uD83D\\uDD0D'} {p.commercialLaunchBtn}`],
  ],
  'GmapsPanel.tsx': [
    ['label="Avis repondus"', 'label={p.gmapsKpiAnswered}'],
    ['label="Note Google"', 'label={p.gmapsKpiRating}'],
    ['label="Clics fiche GMB"', 'label={p.gmapsKpiClicks}'],
    ['<SectionTitle>Note moyenne ({fmt(stats.totalReviews)} avis)</SectionTitle>', '<SectionTitle>{p.gmapsSectionAvg.replace(\'{n}\', fmt(stats.totalReviews))}</SectionTitle>'],
    ['connectLabel="Connecter Google Business"', 'connectLabel={p.gmapsConnectLabel}'],
    ['claraMessage="Voici un apercu de ton espace avis Google. Tu pourras voir tes avis, repondre avec l\'IA et meme activer les réponses automatiques. 1 clic et c\'est parti !"', 'claraMessage={p.gmapsConnectMessage}'],
    ['<h4 className="text-amber-300 font-bold text-sm mb-1">Google Business connecte, mais aucun etablissement</h4>', '<h4 className="text-amber-300 font-bold text-sm mb-1">{p.gmapsNeedsLocationTitle}</h4>'],
    ['Ton compte Google est bien lie mais n\'a pas encore d\'etablissement enregistre.\n                Ajoute ton commerce sur', '{p.gmapsNeedsLocationDesc.split(\'business.google.com\')[0]}'],
    ['Reconnecter / rafraichir', '{p.gmapsNeedsLocationBtn}'],
    ['autoLabel="Reponses automatiques" manualLabel="Reponses manuelles" autoDesc="Theo repond a chaque nouvel avis automatiquement" manualDesc="Tu choisis quand et quoi repondre"', 'autoLabel={p.gmapsToggleAutoLabel} manualLabel={p.gmapsToggleManualLabel} autoDesc={p.gmapsToggleAutoDesc} manualDesc={p.gmapsToggleManualDesc}'],
    ['<SectionTitle>{googleConnected ? `Avis Google (${googleReviews.length})` : \'Avis Google (apercu)\'}</SectionTitle>', '<SectionTitle>{googleConnected ? p.gmapsSectionAvisConnected.replace(\'{n}\', String(googleReviews.length)) : p.gmapsSectionAvisPreview}</SectionTitle>'],
    ['{(stats.recentReviews?.length || 0) > 0 && <SectionTitle>Avis recents</SectionTitle>}', '{(stats.recentReviews?.length || 0) > 0 && <SectionTitle>{p.gmapsSectionRecentAvis}</SectionTitle>}'],
    ['Générer des réponses', '{p.generate}'],
    ['Voir le CRM', '{p.viewCrm}'],
    ['label="Voir ma fiche Google"', 'label={p.gmapsBtnViewPage}'],
  ],
};

let total = 0;
let missed = 0;
for (const [rel, reps] of Object.entries(replacements)) {
  const filePath = path.join(PANELS_DIR, rel);
  let src = fs.readFileSync(filePath, 'utf8');
  let count = 0;
  for (const [from, to] of reps) {
    if (src.includes(from)) {
      src = src.split(from).join(to);
      count++;
    } else {
      console.log('MISS', rel, '|', from.slice(0, 70));
      missed++;
    }
  }
  fs.writeFileSync(filePath, src);
  console.log('OK', rel, '-', count + '/' + reps.length);
  total += count;
}
console.log('\nTotal replaced:', total, '| missed:', missed);
