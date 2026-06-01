# Meta App Review v4 — Final copy-paste package (2026-05-31)

> Stratégie v4 : **ne pas refilmer**. Les vidéos sont OK (grant FB complet, action E2E, résultat IG visible). Le rejet v3 vient du **mismatch entre les descriptions PDF et ce que les vidéos montrent**. v4 = réécrire les descriptions pour qu'elles correspondent exactement à ce qui est filmé + ajouter des credentials prêts à utiliser dans "Web reviewer instructions" (pour Human Agent).

---

## ⚡ Ordre de copier-coller dans le dashboard Meta

Pour CHACUNE des 4 permissions :

1. Champ **"Tell us how you're using this permission"** → copier le texte de la section correspondante ci-dessous
2. Champ **"Web reviewer instructions"** (commun aux 4 permissions, en bas du formulaire) → copier le texte de la section finale
3. Garder la **même vidéo Loom** que v3 (même URL)
4. Vérifier app = mode **Live** (pas Development)

---

## 1️⃣ `instagram_business_content_publish`

**Vidéo Loom** : la vidéo Publish v3 (grant à 1:01–1:09, panel à 1:29, caption à 1:34, post live IG à 2:53)

**Texte à coller dans "Tell us how you're using this permission" :**

```
KeiroAI is a SaaS workspace where small business owners (restaurants, 
hairdressers, florists, local shops) generate and publish Instagram 
posts for their own connected business account. The "Lena" agent uses 
instagram_business_content_publish to publish on behalf of the owner 
after an explicit click. End-to-end flow demonstrated in the screencast:

1. Sign in to KeiroAI with the test credentials provided in the 
   reviewer instructions section. Landing URL: 
   https://www.keiroai.com/login

2. Click "Connect Instagram". This launches the Facebook Login for 
   Business OAuth dialog. The reviewer can see the complete permission 
   grant screen at 1:01–1:09 of the screencast, including the 
   instagram_business_content_publish line item shown as "Importer 
   du contenu multimédia et créer des publications pour le compte 
   Instagram sélectionné".

3. Navigate to Gallery & Posts → "Préparer un post" / "Prepare a post". 
   The panel opens at 1:29 of the screencast.

4. Select an image from the workspace gallery, choose a content angle 
   (Informative, Promo, etc.), and click "Suggest description and 
   hashtags". Lena generates an AI-written caption tailored to the 
   image and the connected business profile. Visible at 1:34.

5. Click "Publish". This triggers a server-to-server call to the 
   Instagram Graph API: POST /{ig-user-id}/media to create the media 
   container, then POST /{ig-user-id}/media_publish to publish it on 
   the connected feed. The publish call is entirely backend, using 
   the long-lived page access token obtained during the OAuth grant 
   in step 2. There is no additional frontend Meta authentication 
   between the grant and the publish.

6. The published post is immediately visible on the connected 
   @keiro_ai Instagram account, shown live in the split-screen at 
   2:53 of the screencast. The same post also appears in KeiroAI's 
   Gallery & Posts page at 2:29.

Why this permission is essential: without 
instagram_business_content_publish, KeiroAI cannot deliver the value 
small business owners pay for — turning a 10-hour-per-week content 
workflow into a 5-minute approval flow. Every publish is initiated by 
an explicit "Publish" click from the business owner; no automated 
posting happens without that human action.

Server-to-server note (per Meta's screencast guide): the actual 
Graph API publish in step 5 is a backend call, not visible in the 
frontend. The only frontend Meta authentication shown in the 
screencast is the OAuth grant at 1:01–1:09. The publish itself uses 
the token granted during that step.

UI language note: the KeiroAI workspace is bilingual (FR/EN). The 
reviewer can switch to English via the EN toggle in the top header. 
The Facebook OAuth grant screen at 1:01–1:09 is displayed in the 
reviewer's Facebook account language preference.
```

**Ce que ce texte fixe vs v3 :** plus de promesses non filmées (onboarding, editorial calendar, review/approve workflow, Published badge). Timestamps précis. Note S2S explicite. Mention bilingue préemptive.

---

## 2️⃣ `instagram_business_manage_insights`

**Vidéo Loom** : la vidéo Insights v3 (grant à 0:39–0:42, KPI à 1:44)

**Texte à coller dans "Tell us how you're using this permission" :**

```
KeiroAI displays the connected Instagram business account's performance 
metrics inside the Lena agent dashboard. The business owner uses these 
insights to understand which content formats and timings work best for 
their account. End-to-end flow demonstrated in the screencast:

1. Sign in to KeiroAI with the test credentials from the reviewer 
   instructions section. Landing URL: https://www.keiroai.com/login

2. Click "Connect Instagram". This launches the Facebook Login for 
   Business OAuth dialog. The reviewer can see the complete permission 
   grant screen at 0:39–0:42 of the screencast, including the 
   instagram_business_manage_insights line item shown as "Accéder aux 
   statistiques du compte Instagram".

3. After granting, the reviewer is redirected back to KeiroAI. Grant 
   confirmation is visible at 0:44 of the screencast ("Oussama Zirrar 
   a été associé à KEIROAI").

4. Open the Lena agent → Instagram tab. The dashboard fetches insights 
   from the connected account via the Instagram Graph API. At 1:44 of 
   the screencast, the dashboard displays the real, live data of the 
   connected @keiro_ai account:
   - POSTS: 178
   - FOLLOWERS: 3
   - LIKES: 27 (total)
   - ENGAGEMENT: 18%

5. Just below the KPI row, the dashboard shows Lena's playbook for the 
   account's sector, computed entirely from the insights data:
   - BEST SLOT (when this account historically performs best):
     Sun 7h-9h, Sat 7h-9h
   - FORMAT MIX (distribution of the account's published media):
     11% Reels, 22% Carousels, 67% Static
   - CAPTION LENGTH (average over recent posts):
     90-130 chars + 5-8 hashtags
   - SECTOR PEERS benchmark: ~1.6k median followers in this niche

6. All insights data is displayed solely within the business owner's 
   private workspace dashboard. We never share insights data with 
   third parties, we never use it for advertising, and we do not 
   re-identify any individual user from aggregated data.

Why this permission is essential: small business owners do not have time 
to compute their own Instagram metrics. KeiroAI uses 
instagram_business_manage_insights to (a) surface the headline KPIs on 
the agent dashboard at every login, (b) compute the format mix and best 
publishing slot from the account's actual history, and (c) keep Lena's 
content plan oriented toward what the audience already engages with. 
Without this permission the dashboard cannot display the numbers shown 
at 1:44 of the screencast.

Server-to-server note (per Meta's screencast guide): the Graph API 
insights endpoints (GET /{ig-user-id}, GET /{ig-user-id}/insights, 
GET /{ig-media-id}/insights with fields including reach, likes, 
comments, follower_count, media_count) are called from the KeiroAI 
backend using the long-lived page access token obtained during the 
OAuth grant in step 2. There is no additional frontend Meta 
authentication between the grant and the insights fetch. The only 
frontend Meta auth visible in the screencast is the OAuth grant at 
0:39–0:42.

UI language note: the KeiroAI workspace is bilingual. The reviewer 
can switch to English via the EN toggle in the top header. Facebook's 
OAuth dialog at 0:39–0:42 is rendered in the reviewer's own Facebook 
language preference.
```

**Ce que ce texte fixe vs v3 :** dit **Lena** (pas AMI — cohérent avec la vidéo). Ne promet plus "weekly reports" ni "compares performance across posts". Décrit le playbook qui est réellement filmé. Vrais chiffres du @keiro_ai vérifiables par le reviewer.

---

## 3️⃣ `instagram_business_manage_comments`

**Vidéo Loom** : la vidéo Comments v3 (grant à 0:48–0:54, Commentaires tab à 1:24, Replied à 2:04)

**Texte à coller dans "Tell us how you're using this permission" :**

```
KeiroAI lets a business owner manage comments on their connected 
Instagram business account directly from the Jade agent workspace. 
End-to-end flow demonstrated in the screencast:

1. Sign in to KeiroAI with the test credentials provided in the 
   reviewer instructions section. Landing URL: 
   https://www.keiroai.com/login

2. Open the Jade agent dashboard. The "Connect Instagram" button is 
   visible at 0:40 of the screencast.

3. Click "Connect Instagram". This launches the Facebook Login for 
   Business OAuth dialog. The reviewer can see the complete permission 
   grant screen at 0:48–0:54 of the screencast, including the 
   instagram_business_manage_comments line item shown as "Gérer les 
   commentaires pour le compte Instagram sélectionné". The reviewer 
   accepts and is redirected to the Jade dashboard.

4. Click the "Commentaires" tab. At 1:24 of the screencast, the 
   dashboard fetches comments from posts on the connected @keiro_ai 
   account and displays three sub-tabs:
   - À répondre (pending replies): 16
   - Tous (all fetched comments): 16
   - Répondus (already replied): 0

5. The Jade workspace runs in "Auto-reply OFF — tu valides chaque 
   réponse" mode by default (visible banner at 1:24), meaning the 
   business owner reviews every reply before it leaves the platform. 
   For each pending comment, Jade pre-fills a draft reply tailored 
   to the business's knowledge base (services, tone, brand dossier).

6. The owner edits the suggestion in the textarea if needed, then 
   clicks "Send". This triggers a server-to-server call to 
   POST /{ig-comment-id}/replies on the Instagram Graph API. The 
   reply is published on the original Instagram post under the 
   business's identity.

7. The replied comment immediately moves to the "Répondus" sub-tab 
   with the "Replied" status badge and the reply text visible. 
   Confirmed at 2:04 of the screencast: the comment "Vive les Lakers!!" 
   by @instagram_user shows the reply "Merci beaucoup, on les 
   supporte aussi!!! Vive les lakers!!".

8. The owner remains in control at every step. They can edit any 
   suggested reply, dismiss it via the close button, or simply not 
   click Send. No reply is ever published without an explicit owner 
   action.

KeiroAI is a multi-tenant platform. Each client connects their own 
Instagram business account via the Facebook Login OAuth flow shown 
in step 3 — we never access an account without explicit owner 
consent. Comment data is strictly isolated per client and used only 
to display the comments inside that client's own private workspace 
and to post owner-approved replies on their behalf.

Why this permission is essential: small business owners regularly 
receive 10–30 comments per week across their posts. Without 
instagram_business_manage_comments, KeiroAI cannot fetch those 
comments into the workspace and cannot post replies on the owner's 
behalf — forcing the owner to switch to the Instagram mobile app 
every time, defeating the value of the agent workspace. The 
comments management surface shown at 1:24 and the published reply 
at 2:04 demonstrate the full lifecycle this permission enables.

Server-to-server note (per Meta's screencast guide): all comment 
fetches (GET /{ig-user-id}/media followed by 
GET /{ig-media-id}/comments) and the reply publish 
(POST /{ig-comment-id}/replies) are server-to-server backend calls 
using the long-lived page access token obtained during the OAuth 
grant at 0:48–0:54. There is no additional frontend Meta 
authentication between the grant and the comment operations.

UI language note: the KeiroAI workspace is bilingual. The reviewer 
can switch to English via the EN toggle in the top header of the 
workspace. Facebook's OAuth dialog at 0:48–0:54 is rendered in the 
reviewer's own Facebook language preference.
```

**Ce que ce texte fixe vs v3 :** ne promet plus 3 boutons (Répondre auto / Répondre / Répondre à tous) — décrit le **"Auto-reply OFF" banner** qui est vraiment dans la vidéo. Pas de promesse "negative comments owner notification" non filmée. Multi-tenant intégré au flow.

---

## 4️⃣ `Human Agent`

**Vidéo Loom** : la vidéo Human Agent v3 (login à 1:04, "Send (Human Agent)" à 2:04, message sur IG natif à 3:04)

**Texte à coller dans "Tell us how you're using this permission" :**

```
USE CASE — Human customer-service assistance for small local 
businesses

KeiroAI is a workspace for solo shop owners, restaurant managers, 
hairdressers, florists, and similar small local businesses. These 
owners receive Instagram DMs from prospects and customers asking 
about menu items, opening hours, reservations, custom orders, etc. 
They cannot respond within the 24-hour standard messaging window 
because they spend their day running the shop. Replies legitimately 
happen 25–72h after the customer's message — not because we 
automate, but because the human owner is running a physical 
business and only checks DMs between tasks.

human-in-the-loop architecture (no automation):

1. Instagram DM arrives → KeiroAI stores it in the workspace inbox.
2. Jade composes a DRAFT reply tailored to the business dossier 
   (services, opening hours, prices, availability).
3. The draft is displayed in the KeiroAI workspace UI to the 
   business owner. A "Human Agent Protocol" banner reminds the 
   owner they are the customer service agent and that every send is 
   their explicit action (visible in the screencast at the Jade 
   dashboard top).
4. The owner REVIEWS the draft. They can edit it, replace it 
   entirely, or discard it. No reply leaves the platform without 
   the owner's review.
5. The owner clicks the "Send (Human Agent)" button — a manual 
   action per message. The button label itself makes the human 
   action explicit. This is the single trigger for the API call. 
   Visible in the screencast at 2:04 (Jade conversation thread, 
   "Outside 24h Human Agent mode" banner active above the 
   composer).
6. KeiroAI's backend then calls POST /me/messages with 
   messaging_type=MESSAGE_TAG and tag=HUMAN_AGENT to deliver the 
   exact reviewed message from the owner's connected Instagram 
   account. The Graph API call shown at the bottom of the composer 
   at 2:04 makes this explicit to the reviewer.
7. The delivered message appears on the customer's side in the 
   native Instagram app. Confirmed in the split-screen recording at 
   3:04 of the screencast (Instagram direct.com showing the message 
   "we were on some internal process, now we are available" 
   delivered to @samzirrar).

Step 5 is the critical human action. There is no automatic send, no 
cron, no scheduled delivery. The Graph API call happens only on the 
explicit click captured in the audit log (timestamp + user_id of 
the human who clicked).

Why this is the canonical human_agent use case:
- The business owner IS the human customer-service agent.
- Replies regularly need to happen 24–72h later due to the owner's 
  real-world schedule.
- No bot ever speaks to the customer. Jade only assists the human 
  by drafting suggested replies the human approves.
- The customer interacts with the actual owner on Instagram — 
  exactly the experience Meta's human_agent permission is designed 
  to protect.

Compliance commitments:
- The "Human Agent Protocol" banner is always visible in the Jade 
  workspace.
- We never auto-send outside an explicit owner click.
- Every send is logged with the user_id of the human who clicked.
- If Meta later determines a conversation should not have used 
  human_agent, we disable the extended window for that thread 
  within 24h.

What human_agent specifically unlocks:
Without this permission, a florist who gets a DM Saturday afternoon 
and reads it Sunday evening cannot reply via our workspace on 
Monday morning — Graph API refuses the send because >24h have 
passed. With human_agent, the florist CAN reply on Monday, because 
the app is acting strictly on behalf of a human agent handling 
customer service. The screencast at 2:04 shows the "Outside 24h 
Human Agent mode" indicator that confirms the human_agent tag is 
attached to the outbound message.

We do NOT use human_agent for proactive messaging. Cold prospecting 
and unsolicited first-contact outreach are handled entirely outside 
this permission and we will not claim human_agent coverage for 
those messages.

Server-to-server note (per Meta's screencast guide): the actual 
POST /me/messages call with the HUMAN_AGENT tag is a backend call 
from the KeiroAI server. The only frontend Meta authentication 
shown in the screencast is the OAuth grant at the start (the 
business owner connecting their Instagram Business account). All 
subsequent message sends use the long-lived page access token 
obtained during that grant.

UI language note: the KeiroAI workspace is bilingual. The reviewer 
can switch to English via the EN toggle in the top header. 
Facebook's OAuth dialog and Instagram's native UI are rendered in 
the reviewer's own account language preference.
```

**Ce que ce texte fixe vs v3 :** condensé, ajoute timestamps (2:04 pour Send, 3:04 pour IG natif). Note S2S explicite. Référence les éléments UI exacts (banner "Outside 24h", bouton "Send (Human Agent)", badge "Human Agent Protocol"). **MAIS le vrai bloqueur Human Agent était le champ "Web reviewer instructions" — voir section suivante.**

---

## 🔑 "Web reviewer instructions" — texte commun à coller (le vrai bloqueur Human Agent)

Ce champ est commun aux 4 permissions (en bas du formulaire Meta App Review). C'est ce qui débloque le rejet Human Agent v3 ("Invalid or Insufficient Credentials Provided").

```
🔑 READY-TO-USE TEST CREDENTIALS (no signup required — these are 
pre-configured and active right now)

   Email:    mrzirraro+metareview@gmail.com
   Password: METAREVIEW2026
   Plan:     Business (all features unlocked, valid until April 2027)
   Pre-confirmed: yes (email verified, no validation step required)

📍 LOGIN URL (in English):
https://www.keiroai.com/login?lang=en

After signing in, the reviewer lands on /assistant — the workspace 
dashboard where each AI agent has a card. No additional setup is 
required.

▶️ HOW TO REPRODUCE EACH PERMISSION

   instagram_business_basic
   → After login, click any agent card → Connect Instagram → 
     dashboard header shows the connected account's username, 
     profile picture, follower count.

   instagram_business_content_publish (see screencast 0:00–2:55)
   → Open Gallery & Posts → Préparer un post → select image → 
     Suggest description and hashtags → Publish → post live on 
     @keiro_ai (visible split-screen at 2:53).

   instagram_business_manage_insights (see screencast 0:00–2:18)
   → Open Lena agent → Instagram tab → KPI cards (POSTS, FOLLOWERS, 
     LIKES, ENGAGEMENT) + sector playbook visible at 1:44.

   instagram_business_manage_comments (see screencast 0:00–3:20)
   → Open Jade agent → Commentaires tab → suggested reply pre-filled 
     in textarea → edit → Send → comment moves to "Répondus" sub-tab 
     (visible at 2:04).

   Human Agent (see screencast 0:00–5:00)
   → Open Jade agent → DMs tab → select a conversation older than 
     24h → "Outside 24h · Human Agent mode" banner appears → human 
     edits the suggested draft → clicks "Send (Human Agent)" → 
     message delivered, visible in the customer's native Instagram 
     app (split-screen at 3:04).

If the reviewer experiences any access issue, please reply on this 
review thread; we respond within 2 hours during business hours 
(Paris, CET/CEST).
```

---

## ✅ Checklist avant de cliquer "Submit for review"

- [ ] App KeiroAI passée en mode **Live** (pas Development)
- [ ] URLs Privacy Policy + Terms toujours valides (keiroai.com/privacy, /terms)
- [ ] Compte `mrzirraro+metareview@gmail.com` testé en navigation privée (login OK, plan Business actif)
- [ ] Pour chacune des 4 permissions :
  - [ ] Texte v4 collé dans "Tell us how you're using this permission"
  - [ ] Vidéo Loom v3 réutilisée (même URL, publique sans password)
- [ ] Champ "Web reviewer instructions" rempli avec le texte unique ci-dessus (credentials en tête)
- [ ] @keiro_ai IG business account connecté au compte reviewer (pour permettre la reproduction des étapes)
- [ ] Tester en incognito : login avec les credentials → /assistant → Connect Instagram fonctionne

---

## 📊 Récap diagnostic v3 → fix v4

| Permission | Cause réelle du rejet v3 | Fix v4 |
|---|---|---|
| `content_publish` | PDF promettait 6 étapes (onboarding + calendar + review/edit/approve + Published badge), vidéo n'en montrait que 2 | Réécriture pour ne décrire QUE ce qui est filmé (grant + select + suggest + publish + visible IG) + timestamps |
| `manage_insights` | PDF promettait AMI + comparison + weekly reports, vidéo montrait Lena + KPI seuls | Réécriture avec **Lena** (cohérent vidéo) + description du playbook réellement filmé + vrais chiffres @keiro_ai |
| `manage_comments` | PDF promettait 3 boutons + flux negative comments, vidéo montrait Send + banner "Auto-reply OFF" | Réécriture avec banner réel + Send seul + multi-tenant intégré |
| `Human Agent` | **PAS la vidéo** — champ "Web reviewer instructions" disait "create an account" au lieu de fournir credentials | Credentials prêts à utiliser en tête du champ Web reviewer instructions + retouche description (timestamps + S2S note) |

**Ne pas refilmer.** Les vidéos sont conformes (grant FB complet visible, action E2E démontrée, résultat sur IG visible). Le seul changement = texte des descriptions + champ reviewer instructions.
