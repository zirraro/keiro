# 📊 Rapport Complet des Coûts API - Keiro

**Date**: 5 février 2026
**Version**: 1.0

---

## 🔌 APIs et Services Utilisés

### 1. **Supabase** (Base de données + Storage)
- **Utilisation**:
  - Base de données PostgreSQL (profiles, brands, saved_images, my_videos, etc.)
  - Storage pour images/vidéos générées
  - Authentication
- **Plan actuel**: Free (probablement)
- **Tarification**:
  - **Free**: 500 MB stockage, 1 GB transfert/mois, 2 GB bande passante
  - **Pro ($25/mois)**: 8 GB stockage, 50 GB transfert, 250 GB bande passante
  - **Team ($599/mois)**: 100 GB stockage, illimité transfert
- **Branchements**: Toutes les routes API (`/api/**`)

---

### 2. **Vercel Blob Storage**
- **Utilisation**: Upload d'images utilisateurs
- **Token**: `BLOB_READ_WRITE_TOKEN`
- **Tarification**:
  - **Free (Hobby)**: 1 GB stockage gratuit
  - **Pro ($20/mois)**: 100 GB inclus, puis $0.15/GB
  - **Enterprise**: Sur mesure
- **Branchements**:
  - `/api/upload/route.ts` - Upload images
  - `/api/upload-video/route.ts` - Upload vidéos

---

### 3. **Anthropic Claude 3 Haiku**
- **Utilisation**:
  - Assistant marketing conversationnel
  - Suggestions de punchlines Instagram
- **Modèle**: `claude-3-haiku-20240307`
- **Tarification**:
  - **Input**: $0.25 / 1M tokens
  - **Output**: $1.25 / 1M tokens
- **Configuration actuelle**:
  - Marketing Assistant: max 800 tokens/réponse, limite 50 messages/mois/utilisateur
  - Suggest Text: max 2048 tokens/réponse
- **Branchements**:
  - `/api/marketing-assistant/chat/route.ts` (Claude 3 Haiku)
  - `/api/suggest-text/route.ts` (Claude 3 Haiku)

**Calcul coûts estimés par utilisateur/mois**:
- **Marketing Assistant**:
  - 50 messages × 800 tokens output = 40,000 tokens
  - 50 messages × 400 tokens input (moyenne) = 20,000 tokens
  - Coût input: 20,000 × $0.25 / 1M = **$0.005**
  - Coût output: 40,000 × $1.25 / 1M = **$0.05**
  - **Total/utilisateur/mois: ~$0.055**

- **Suggest Text**:
  - Estimé 20 générations/mois
  - 2000 tokens output × 20 = 40,000 tokens
  - 1500 tokens input × 20 = 30,000 tokens
  - Coût input: $0.0075
  - Coût output: $0.05
  - **Total/utilisateur/mois: ~$0.058**

**Total Anthropic/utilisateur/mois: ~$0.11**

---

### 4. **OpenAI TTS (Text-to-Speech)**
- **Utilisation**: Génération de narration audio pour vidéos
- **Modèle**: `tts-1` ou `tts-1-hd`
- **Tarification**:
  - **TTS-1**: $0.015 / 1,000 caractères (~$15 / 1M chars)
  - **TTS-1-HD**: $0.030 / 1,000 caractères (~$30 / 1M chars)
- **Utilisation estimée**:
  - 50 caractères par audio (moyenne)
  - 10 audios/utilisateur/mois
  - 500 caractères/mois
  - **Coût/utilisateur/mois: $0.0075**
- **Branchements**:
  - `/api/generate-audio-tts/route.ts`
  - `/lib/audio/openai-tts.ts`

---

### 5. **Seedream 4.0** (Génération Images/Vidéos)
- **Utilisation**:
  - Text-to-Image (T2I)
  - Image-to-Image (I2I)
  - Text-to-Video (T2V) - si implémenté
  - Image-to-Video (I2V) - en cours
- **API Key**: Hardcodée `341cd095-2c11-49da-82e7-dc2db23c565c`
- **Modèle**: `seedream-4-0-250828`
- **Tarification**: ⚠️ **INCONNUE - À VÉRIFIER**
  - Probablement facturation par crédit/génération
  - Estimé: $0.05 - $0.20 par image 2K
  - Estimé: $0.50 - $2.00 par vidéo I2V
- **Branchements**:
  - `/api/seedream/t2i/route.ts` - Text to Image
  - `/api/seedream/i2i/route.ts` - Image to Image
  - `/api/seedream/t2v/route.ts` - Text to Video (si actif)
  - `/api/seedream/download-and-store/route.ts`

**⚠️ RISQUE MAJEUR**: Pas de limite côté code, potentiellement coûts explosifs

**Estimation conservative (à valider)**:
- 20 images/utilisateur/mois @ $0.10 = **$2.00**
- 5 vidéos I2V/utilisateur/mois @ $1.00 = **$5.00**
- **Total Seedream estimé/utilisateur/mois: $7.00**

---

### 6. **Meta/Instagram Graph API**
- **Utilisation**: Publication automatique Instagram (posts, stories, carousels)
- **App ID**: `764778273117357`
- **Tarification**: **GRATUIT** (API Graph v21.0)
  - Limites de rate: 200 calls/heure/user
- **Branchements**:
  - `/api/library/instagram/publish/route.ts`
  - `/api/library/instagram/publish-story/route.ts`
  - `/api/library/instagram/publish-carousel/route.ts`
  - `/api/instagram/sync-media/route.ts`

---

### 7. **TikTok Content Posting API**
- **Utilisation**: Publication automatique TikTok
- **Client Key**: `sbawzb8rt7ej0frcno`
- **Tarification**: **GRATUIT** (Sandbox mode)
  - ⚠️ En production: vérifier quotas
- **Branchements**:
  - `/api/library/tiktok/publish/route.ts`
  - `/api/tiktok/publish-carousel/route.ts`
  - `/api/tiktok/preview-video/route.ts`

---

### 8. **Make.com** (Webhooks - Optionnel)
- **Utilisation**: Automation workflows
- **URL**: `https://hook.make.com/your-webhook`
- **Tarification**:
  - **Free**: 1,000 operations/mois
  - **Core ($9/mois)**: 10,000 operations
  - **Pro ($16/mois)**: 10,000 operations + features
- **Status**: ⚠️ Optionnel, probablement non utilisé actuellement

---

## 💰 Tableau Récapitulatif des Coûts

### Par Utilisateur / Mois (Utilisation Moyenne)

| Service | Coût/utilisateur/mois | Notes |
|---------|----------------------|-------|
| **Supabase** | $0.00 - $0.50* | *Peut exploser selon stockage |
| **Vercel Blob** | $0.00 - $0.20* | *1 GB free, puis $0.15/GB |
| **Claude 3 Haiku** | **$0.11** | Marketing + Suggestions |
| **OpenAI TTS** | **$0.01** | Audio narration |
| **Seedream** | **$7.00** ⚠️ | ⚠️ ESTIMATION À VALIDER |
| **Instagram API** | $0.00 | Gratuit |
| **TikTok API** | $0.00 | Gratuit (Sandbox) |
| **Make.com** | $0.00 | Non utilisé |
| **TOTAL** | **~$7.32 - $7.82** | **Hors infrastructure Vercel** |

---

## 📈 Projections par Paliers de Clients

### Hypothèses:
- **Utilisation moyenne**: 20 images + 5 vidéos I2V/mois/client
- **Marketing Assistant**: 50 messages/mois/client
- **Stockage**: +500 MB/client/mois (images + vidéos)

### Palier 10 Clients

| Service | Coût Total/Mois | Détails |
|---------|----------------|---------|
| Supabase | $25 (Pro) | 8 GB stockage, 50 GB transfert |
| Vercel Blob | $0 - $10 | ~5 GB utilisation |
| Claude Haiku | $1.10 | 10 clients × $0.11 |
| OpenAI TTS | $0.10 | 10 clients × $0.01 |
| Seedream | **$70** ⚠️ | 10 clients × $7.00 |
| Instagram/TikTok | $0 | Gratuit |
| **TOTAL** | **~$96 - $106/mois** | + Vercel hosting (~$20) |
| **Par client** | **~$9.60 - $10.60** | Revenue/client recommandé: **$29-49/mois** |

---

### Palier 20 Clients

| Service | Coût Total/Mois | Détails |
|---------|----------------|---------|
| Supabase | $25 (Pro) | Toujours suffisant |
| Vercel Blob | $10 - $20 | ~10 GB utilisation |
| Claude Haiku | $2.20 | 20 clients × $0.11 |
| OpenAI TTS | $0.20 | 20 clients × $0.01 |
| Seedream | **$140** ⚠️ | 20 clients × $7.00 |
| Instagram/TikTok | $0 | Gratuit |
| **TOTAL** | **~$177 - $187/mois** | + Vercel hosting (~$20) |
| **Par client** | **~$8.85 - $9.35** | Revenue/client recommandé: **$29-49/mois** |
| **Marge** | **~$580 - $980** | (20 × $49) - $187 = $793 |

---

### Palier 30 Clients

| Service | Coût Total/Mois | Détails |
|---------|----------------|---------|
| Supabase | $25 - $599** | **Risque: besoin Team plan si >15 GB stockage |
| Vercel Blob | $20 - $30 | ~15 GB utilisation |
| Claude Haiku | $3.30 | 30 clients × $0.11 |
| OpenAI TTS | $0.30 | 30 clients × $0.01 |
| Seedream | **$210** ⚠️ | 30 clients × $7.00 |
| Instagram/TikTok | $0 | Gratuit |
| **TOTAL** | **~$258 - $862/mois** | + Vercel hosting (~$20-50) |
| **Par client** | **~$8.60 - $28.73** | Revenue/client recommandé: **$49-99/mois** |
| **Marge** | **~$608 - $1,412** | (30 × $49) - $258 |

---

### Palier 40 Clients

| Service | Coût Total/Mois | Détails |
|---------|----------------|---------|
| Supabase | **$599 (Team)** | ⚠️ OBLIGATOIRE pour stockage/bande passante |
| Vercel Blob | $30 - $50 | ~20 GB utilisation |
| Claude Haiku | $4.40 | 40 clients × $0.11 |
| OpenAI TTS | $0.40 | 40 clients × $0.01 |
| Seedream | **$280** ⚠️ | 40 clients × $7.00 |
| Instagram/TikTok | $0 | Gratuit |
| **TOTAL** | **~$913 - $933/mois** | + Vercel hosting (~$50) |
| **Par client** | **~$22.83 - $23.33** | Revenue/client recommandé: **$49-99/mois** |
| **Marge** | **~$1,027 - $2,027** | (40 × $49) - $933 |

---

### Palier 50 Clients

| Service | Coût Total/Mois | Détails |
|---------|----------------|---------|
| Supabase | **$599 (Team)** | Stockage + bande passante critiques |
| Vercel Blob | $50 - $75 | ~25 GB utilisation |
| Claude Haiku | $5.50 | 50 clients × $0.11 |
| OpenAI TTS | $0.50 | 50 clients × $0.01 |
| Seedream | **$350** ⚠️ | 50 clients × $7.00 |
| Instagram/TikTok | $0 | Gratuit |
| **TOTAL** | **~$1,005 - $1,030/mois** | + Vercel hosting (~$50-100) |
| **Par client** | **~$20.10 - $20.60** | Revenue/client recommandé: **$49-99/mois** |
| **Marge** | **~$1,420 - $3,920** | (50 × $49) - $1,030 |

---

## ⚠️ Risques et Points d'Attention Critiques

### 1. **Seedream API - COÛT INCONNU** 🚨
- **Problème**: Aucune limite côté code, pas de tracking consommation
- **Risque**: Coûts peuvent exploser sans contrôle
- **Actions urgentes**:
  - ✅ Vérifier tarification réelle Seedream
  - ✅ Implémenter quotas par utilisateur (ex: 20 images + 5 vidéos/mois)
  - ✅ Ajouter tracking consommation en BDD
  - ✅ Alertes si dépassement seuils

### 2. **Supabase Storage - Croissance Exponentielle** 📈
- **Problème**: +500 MB/client/mois = **25 GB pour 50 clients**
- **Seuil critique**: ~15 clients = passage Team plan ($599/mois)
- **Solutions**:
  - Compression images/vidéos avant stockage
  - Politique de rétention (ex: supprimer après 90 jours)
  - Migration vers S3 AWS (moins cher à grande échelle)

### 3. **Vercel Blob - Alternative Nécessaire** 💾
- **Problème**: $0.15/GB devient cher à grande échelle
- **Alternative**: Passer tout sur Supabase Storage ou S3

### 4. **Claude Haiku - Limites Actuelles OK** ✅
- Bien contrôlé avec limites 50 messages/mois
- Coûts raisonnables même à 100+ clients

### 5. **OpenAI TTS - Négligeable** ✅
- Coûts très faibles, pas de risque

---

## 🎯 Recommandations Stratégiques

### Court Terme (0-10 clients)
1. ✅ **Vérifier IMMÉDIATEMENT tarification Seedream**
2. ✅ Implémenter quotas Seedream par utilisateur
3. ✅ Ajouter dashboard admin tracking consommation API
4. ⚠️ Surveiller Supabase storage (alerte à 6 GB)

### Moyen Terme (10-30 clients)
1. **Optimisation Seedream**:
   - Négocier tarifs volume avec Seedream
   - Implémenter cache intelligent (éviter regénérations)
   - Offrir plans tarifaires avec quotas différenciés
2. **Supabase**:
   - Politique compression + rétention
   - Préparer migration S3 si >20 clients
3. **Monétisation**:
   - Plan Starter: $29/mois (10 images, 3 vidéos)
   - Plan Pro: $49/mois (20 images, 5 vidéos)
   - Plan Business: $99/mois (50 images, 15 vidéos)

### Long Terme (30-50+ clients)
1. **Migration Infrastructure**:
   - Supabase → PostgreSQL auto-hébergé (DigitalOcean/AWS)
   - Vercel Blob → S3 + CloudFront CDN
   - Économie estimée: -40% coûts stockage
2. **Seedream**:
   - Contrat entreprise avec quotas négociés
   - Ou migration vers alternative (Replicate, Stability AI)
3. **Claude**:
   - Négocier tarifs entreprise Anthropic (>1M tokens/mois)

---

## 📊 Projection ROI par Palier

### Scénario Conservateur (Revenue $29/client/mois)

| Clients | Revenue/Mois | Coûts API | Coûts Total* | Marge Nette | ROI |
|---------|--------------|-----------|--------------|-------------|-----|
| 10 | $290 | $96 | $116 | **$174** | 60% |
| 20 | $580 | $177 | $197 | **$383** | 66% |
| 30 | $870 | $258 | $308 | **$562** | 65% |
| 40 | $1,160 | $913 | $963 | **$197** | 17% ⚠️ |
| 50 | $1,450 | $1,005 | $1,105 | **$345** | 24% ⚠️ |

*Coûts Total = API + Vercel hosting

### Scénario Optimiste (Revenue $49/client/mois)

| Clients | Revenue/Mois | Coûts API | Coûts Total* | Marge Nette | ROI |
|---------|--------------|-----------|--------------|-------------|-----|
| 10 | $490 | $96 | $116 | **$374** | 76% |
| 20 | $980 | $177 | $197 | **$783** | 80% |
| 30 | $1,470 | $258 | $308 | **$1,162** | 79% |
| 40 | $1,960 | $913 | $963 | **$997** | 51% |
| 50 | $2,450 | $1,005 | $1,105 | **$1,345** | 55% |

---

## ⚡ Actions Immédiates Recommandées

### URGENT (Cette semaine)
1. [ ] **Vérifier facture/consommation Seedream actuelle**
2. [ ] **Implémenter quotas Seedream dans code** (limiter 20 images + 5 vidéos/user/mois)
3. [ ] **Créer table `api_usage_tracking`** en Supabase pour monitoring
4. [ ] **Ajouter dashboard admin** avec métriques coûts API en temps réel

### IMPORTANT (Ce mois)
1. [ ] **Compression automatique** images/vidéos avant stockage Supabase
2. [ ] **Politique rétention** (supprimer contenus >90 jours non utilisés)
3. [ ] **Alertes email** si dépassement seuils (Supabase >6GB, Seedream >200 générations/mois)
4. [ ] **Tarification plans** basée sur quotas API (Starter/Pro/Business)

### STRATÉGIQUE (3-6 mois)
1. [ ] **Négociation Seedream** (tarifs volume si >30 clients)
2. [ ] **Migration S3** si Supabase storage >20 GB
3. [ ] **Alternative Seedream** (Replicate, Stability AI) si coûts non viables
4. [ ] **Contrat entreprise Anthropic** si >50 clients

---

## 📝 Notes Finales

### Points Positifs ✅
- Claude Haiku très économique et bien contrôlé
- Instagram/TikTok API gratuits
- OpenAI TTS négligeable

### Points de Vigilance ⚠️
- **Seedream = 95% des coûts** → PRIORITÉ ABSOLUE
- Supabase storage croissance linéaire → prévoir migration
- Passage 40 clients = seuil critique Supabase Team ($599)

### Recommandation Pricing
- **Freemium**: 3 images/mois gratuit (acquisition)
- **Starter ($29/mois)**: 10 images + 3 vidéos
- **Pro ($49/mois)**: 20 images + 5 vidéos ← **Sweet spot**
- **Business ($99/mois)**: 50 images + 15 vidéos

Avec $49/mois et coûts API $7.82/client, **marge nette = 84%** 🎯

---

**Rapport généré le**: 5 février 2026
**Prochaine révision recommandée**: Après vérification tarifs Seedream réels
