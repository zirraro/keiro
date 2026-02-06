# Rapport Detaille Couts API v4 - Keiro (Usage Ultra-Intensif)

**Date**: 6 fevrier 2026
**Version**: 4.0 - PRIX VIDEO CORRIGES (SeedAnce 1.0 Pro)
**Objectif**: Marges 80%+ sur plans existants (49/149/199/349/999 EUR)
**Scenario**: Usage ULTRA-INTENSIF (3 modifications par element genere)

---

## CORRECTION MAJEURE : PRIX VIDEO

### Ancien prix (FAUX - Seedream 4.0 I2V generique)
- $2.47/video (987K tokens) → avec 3 mods = **$9.88/video**

### Vrai prix (SeedAnce 1.0 Pro - bytedance-seedance-1-0-pro)

| Resolution | Ratio | Duree | Tokens | Prix |
|-----------|-------|-------|--------|------|
| **480p** | 16:9 | 5s | 48,600 | **$0.12** |
| **480p** | 1:1 | 5s | 48,000 | **$0.12** |
| **720p** | 16:9 | 5s | 102,960 | **$0.26** |
| **720p** | 1:1 | 5s | 108,000 | **$0.27** |
| **1080p** | 16:9 | 5s | 244,800 | **$0.61** |
| **1080p** | 1:1 | 5s | 243,000 | **$0.61** |
| **1080p** | 16:9 | 10s | 489,600 | **$1.22** |
| **1080p** | 1:1 | 10s | 486,000 | **$1.22** |

**Pour reseaux sociaux (TikTok/Instagram) = 1080p, 5 secondes = $0.61**

---

## COUT EFFECTIF PAR ELEMENT (generation + 3 modifications)

| Element | Generation | 3 Modifications | Cout Total Effectif |
|---------|-----------|-----------------|---------------------|
| **1 visuel** | $0.125 (T2I) | 3 x $0.075 (I2I) = $0.225 | **$0.35** |
| **1 video 1080p 5s** | $0.61 (SeedAnce) | 3 x $0.61 = $1.83 | **$2.44** |
| **1 video 1080p 10s** | $1.22 (SeedAnce) | 3 x $1.22 = $3.66 | **$4.88** |
| **1 audio** | $0.0015 (TTS) | 3 x $0.0015 = $0.0045 | **$0.006** |
| **1 msg IA** | $0.00115 | - | **$0.00115** |
| **1 suggestion texte** | $0.00233 | - | **$0.00233** |

**Impact** : La video est passee de $9.88 a **$2.44** par session (4x moins cher !)
On peut maintenant offrir BEAUCOUP plus de videos par plan.

---

## TARIFICATION DETAILLEE PAR SERVICE

### 1. BytePlus Seedream 4.0 (Images)
- **T2I** : $0.125/image (50K tokens x $0.0025/1K)
- **I2I** : $0.075/modification (30K tokens x $0.0025/1K)

### 2. ByteDance SeedAnce 1.0 Pro (Videos)
- **1080p 5s** : $0.61/video (244K tokens x $0.0025/1K)
- **1080p 10s** : $1.22/video (489K tokens x $0.0025/1K)
- **720p 5s** : $0.26/video (103K tokens)

### 3. Anthropic Claude 3 Haiku
- Input: $0.25/1M tokens | Output: $1.25/1M tokens
- Cout moyen/message: ~$0.00115

### 4. OpenAI TTS
- $0.015/1000 caracteres
- Cout moyen/narration: ~$0.0015

### 5. CloudConvert (CORRIGE)
- **Free** : **10 conversions/jour** (PAS 25) = **~300/mois**
- Seuil critique : ~30 clients
- Cout si payant : ~$0.0015/conversion

### 6-8. Infrastructure
- Supabase : $0 (Free) a $0.50/client (Pro)
- Vercel Blob : $0 (Free) a $0.20/client (Pro)
- Instagram/TikTok API : GRATUIT

---

## CALCUL QUOTAS PAR PLAN (Marge 80%+)

### Formule
```
Budget API max = Prix (en $) x 20%
1 EUR = ~$1.10
Video = 1080p 5s ($0.61 x 4 = $2.44 avec 3 mods)
Visuel = T2I + 3 I2I ($0.125 + $0.225 = $0.35 avec 3 mods)
```

---

### Plan SOLO - 49 EUR/mois

**Budget max API** : $54 x 20% = **$10.80**

| Element | Quota | Cout unitaire | Cout total |
|---------|-------|---------------|------------|
| Visuels (+ 3 mods chacun) | **20** | $0.35 | $7.00 |
| Videos 1080p 5s (+ 3 re-gens) | **1** | $2.44 | $2.44 |
| Messages assistant IA | **20** | $0.00115 | $0.023 |
| Suggestions texte | **10** | $0.00233 | $0.023 |
| Narrations audio | **5** | $0.006 | $0.030 |
| Overhead infra | - | - | $0.50 |
| **TOTAL COUT API** | | | **$10.02** |

**Marge** : $54 - $10.02 = $43.98 (**81.4%**) ✅

Instagram Post + 1 video Reels test.

---

### Plan FONDATEURS - 149 EUR/mois (50 premieres places)

**Budget max API** : $164 x 20% = **$32.80**

| Element | Quota | Cout unitaire | Cout total |
|---------|-------|---------------|------------|
| Visuels (+ 3 mods chacun) | **30** | $0.35 | $10.50 |
| Videos 1080p 5s (+ 3 re-gens) | **8** | $2.44 | $19.52 |
| Messages assistant IA | **50** | $0.00115 | $0.058 |
| Suggestions texte | **20** | $0.00233 | $0.047 |
| Narrations audio | **15** | $0.006 | $0.090 |
| Overhead infra | - | - | $1.00 |
| **TOTAL COUT API** | | | **$31.22** |

**Marge** : $164 - $31.22 = $132.78 (**81.0%**) ✅

Instagram + TikTok. 8 videos = 2/semaine ! Prix verrouille a vie.

---

### Plan STANDARD - 199 EUR/mois (apres les 50 fondateurs)

**Budget max API** : $219 x 20% = **$43.80**

| Element | Quota | Cout unitaire | Cout total |
|---------|-------|---------------|------------|
| Visuels (+ 3 mods chacun) | **40** | $0.35 | $14.00 |
| Videos 1080p 5s (+ 3 re-gens) | **11** | $2.44 | $26.84 |
| Messages assistant IA | **60** | $0.00115 | $0.069 |
| Suggestions texte | **25** | $0.00233 | $0.058 |
| Narrations audio | **20** | $0.006 | $0.120 |
| Overhead infra | - | - | $1.20 |
| **TOTAL COUT API** | | | **$42.29** |

**Marge** : $219 - $42.29 = $176.71 (**80.7%**) ✅

Instagram + TikTok. 11 videos = quasi 3/semaine !

---

### Plan BUSINESS - 349 EUR/mois

**Budget max API** : $384 x 20% = **$76.80**

| Element | Quota | Cout unitaire | Cout total |
|---------|-------|---------------|------------|
| Visuels (+ 3 mods chacun) | **80** | $0.35 | $28.00 |
| Videos 1080p 5s (+ 3 re-gens) | **18** | $2.44 | $43.92 |
| Messages assistant IA | **100** | $0.00115 | $0.115 |
| Suggestions texte | **50** | $0.00233 | $0.117 |
| Narrations audio | **30** | $0.006 | $0.180 |
| Overhead infra | - | - | $2.00 |
| **TOTAL COUT API** | | | **$74.33** |

**Marge** : $384 - $74.33 = $309.67 (**80.6%**) ✅

Multi-comptes (1+5 clients). 18 videos = ~4-5/semaine.

---

### Plan ELITE - 999 EUR/mois

**Budget max API** : $1099 x 20% = **$219.80**

| Element | Quota | Cout unitaire | Cout total |
|---------|-------|---------------|------------|
| Visuels (+ 3 mods chacun) | **200** | $0.35 | $70.00 |
| Videos 1080p 5s (+ 3 re-gens) | **55** | $2.44 | $134.20 |
| Messages assistant IA | **200** | $0.00115 | $0.230 |
| Suggestions texte | **100** | $0.00233 | $0.233 |
| Narrations audio | **60** | $0.006 | $0.360 |
| Overhead infra | - | - | $5.00 |
| **TOTAL COUT API** | | | **$210.02** |

**Marge** : $1099 - $210.02 = $888.98 (**80.9%**) ✅

55 videos = plus d'1/jour ! Account manager dedie + consulting.

---

## TABLEAU COMPARATIF FINAL

| Plan | Prix EUR | Visuels | Videos | Msgs IA | Suggestions | Audio | Cout API $ | Marge % |
|------|----------|---------|--------|---------|-------------|-------|------------|---------|
| **Solo** | 49 | 20 | 1 | 20 | 10 | 5 | $10.02 | **81%** ✅ |
| **Fondateurs** | 149 | 30 | 8 | 50 | 20 | 15 | $31.22 | **81%** ✅ |
| **Standard** | 199 | 40 | 11 | 60 | 25 | 20 | $42.29 | **81%** ✅ |
| **Business** | 349 | 80 | 18 | 100 | 50 | 30 | $74.33 | **81%** ✅ |
| **Elite** | 999 | 200 | 55 | 200 | 100 | 60 | $210.02 | **81%** ✅ |

**TOUS les plans >= 80% marge meme en usage ultra-intensif** ✅

### Essai Sprint Fondateur : 4.99 EUR / 3 jours
- Acces complet fonctionnalites Fondateurs
- Quota trial : ~10 visuels + 2 videos sur 3 jours
- Loss-leader pour convertir (4.99 EUR deduits du 1er mois)

---

## COMPARAISON AVEC L'ANCIEN CALCUL

| Element | Ancien prix | Nouveau prix (SeedAnce) | Difference |
|---------|------------|------------------------|------------|
| 1 video (gen seule) | $2.47 | **$0.61** | **-75%** |
| 1 video (+ 3 mods) | $9.88 | **$2.44** | **-75%** |

### Impact sur les quotas video :
| Plan | Anciennes videos | Nouvelles videos | Augmentation |
|------|-----------------|------------------|-------------|
| Solo | 0 | **1** | +1 |
| Fondateurs | 2 | **8** | **x4** |
| Standard | 3 | **11** | **x3.7** |
| Business | 4 | **18** | **x4.5** |
| Elite | 14 | **55** | **x3.9** |

---

## SEUILS CRITIQUES

| Seuil | Clients | Impact | Action |
|-------|---------|--------|--------|
| **CloudConvert** | ~30 | Free -> payant | Negligeable (+$0.30/mois) |
| **Vercel Blob** | ~40 | Free -> Pro $20/mois | Negligeable |
| **Supabase Team** | ~220 | Pro $25 -> Team $599 | Ajuster prix si necessaire |

---

## PROJECTIONS REVENUS (mix 100 clients)

**Repartition estimee** :
- 40% Solo (49 EUR) = 40 clients
- 30% Fondateurs (149 EUR) = 30 clients
- 10% Standard (199 EUR) = 10 clients
- 15% Business (349 EUR) = 15 clients
- 5% Elite (999 EUR) = 5 clients

| Plan | Clients | Revenue $ | Cout API $ | Marge $ |
|------|---------|-----------|------------|---------|
| Solo | 40 | $2,160 | $401 | $1,759 |
| Fondateurs | 30 | $4,920 | $937 | $3,983 |
| Standard | 10 | $2,190 | $423 | $1,767 |
| Business | 15 | $5,760 | $1,115 | $4,645 |
| Elite | 5 | $5,495 | $1,050 | $4,445 |
| **TOTAL** | **100** | **$20,525** | **$3,926** | **$16,599 (81%)** |

**Revenue mensuel projete a 100 clients : ~$20,500/mois** (~18,650 EUR)

---

## CONCLUSION

### Quotas valides pour chaque plan (avec vrais prix SeedAnce)
- **Solo 49 EUR** : 20 visuels, 1 video, Instagram
- **Fondateurs 149 EUR** : 30 visuels, 8 videos, Instagram + TikTok (prix bloque)
- **Standard 199 EUR** : 40 visuels, 11 videos, Instagram + TikTok
- **Business 349 EUR** : 80 visuels, 18 videos, Multi-comptes
- **Elite 999 EUR** : 200 visuels, 55 videos, Premium + Consulting

### Corrections appliquees (v4)
1. ✅ Prix video corriges : SeedAnce 1.0 Pro ($0.61 au lieu de $2.47)
2. ✅ CloudConvert : 10 conv/jour (pas 25)
3. ✅ Usage intensif : 3 modifications par element
4. ✅ Quotas adaptes pour marge 80%+ sur tous les plans
5. ✅ Essai 4.99 EUR/3j maintenu (loss-leader conversion)

### Avantage competitif
Avec les vrais prix SeedAnce, on peut offrir **4x plus de videos** qu'avant tout en gardant 80% de marge. C'est un argument de vente massif face a la concurrence.

---

**Rapport genere le** : 6 fevrier 2026
**Par** : Claude Opus 4.6
**Source prix** : ByteDance SeedAnce 1.0 Pro pricing table officielle
