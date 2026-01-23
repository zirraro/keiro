# 🎁 Flow Gratuit Keiro - Documentation

## 📊 Tunnel de Conversion

```
Visiteur Anonyme
      ↓
[1 génération GRATUITE sans rien demander]
      ↓
   Modal Email Gate
      ↓
Guest Mode (avec email localStorage)
      ↓
[Peut continuer à générer]
      ↓
Incitation Création Compte
      ↓
Compte Gratuit : 3 visuels/mois avec watermark
```

---

## 🚀 Étape par Étape

### 1️⃣ Visiteur Anonyme (0 génération)

**État :**
- Pas de compte
- Pas d'email
- Première visite

**Accès :**
- ✅ 1 génération GRATUITE
- ✅ Voir la homepage
- ✅ Voir les examples
- ❌ Pas de sauvegarde
- ❌ Pas de galerie

**UX :**
```
Homepage → Bouton "Générer maintenant" → Page /generate
→ Sélectionne catégorie + options → Génère image
→ ✅ Image générée affichée
```

**Pas de blocage, pas de modal, juste générer !** 🎯

---

### 2️⃣ Après 1ère Génération → Email Gate

**Déclencheur :**
- User a généré 1 image
- Veut télécharger OU générer 2ème image

**Modal Email Gate :**
```
┌─────────────────────────────────────┐
│  🎉 Super ! Ton visuel est prêt     │
│                                     │
│  Pour sauvegarder et continuer :   │
│                                     │
│  📧 [_________________]             │
│      Ton email                      │
│                                     │
│  [Continuer gratuitement →]        │
│                                     │
│  ✅ Galerie perso                   │
│  ✅ Téléchargements illimités       │
│  ✅ Accès à toutes tes créations    │
└─────────────────────────────────────┘
```

**Après soumission email :**
- Email stocké dans `localStorage` : `keiro_guest_email`
- User devient "Guest Mode"
- Modal se ferme
- Image sauvegardée dans galerie guest

---

### 3️⃣ Guest Mode (avec email)

**État :**
- Email fourni (dans localStorage)
- Pas de compte Supabase
- Mode "invité authentifié"

**Accès :**
- ✅ Générer **plusieurs** visuels (combien = à définir, suggestion: illimité pendant session)
- ✅ Sauvegarder dans galerie localStorage
- ✅ Télécharger images
- ✅ Créer brouillons Instagram (1 brouillon localStorage)
- ✅ Accès à `/library` (mode guest)
- ❌ Pas d'Assistant IA
- ❌ Pas d'analytics
- ❌ Pas de dossiers
- ❌ Images AVEC watermark

**Galerie Guest :**
- Stockage : `localStorage` `keiro_guest_images`
- Données : Array d'images avec URLs Supabase
- Limite : ~5-10 images max (localStorage limité)
- Persistence : Tant que localStorage pas vidé

**UX :**
```
Homepage affiche banner:
┌─────────────────────────────────────┐
│ 👋 Bienvenue vincent@email.com      │
│ Mode Invité - Créez un compte pour │
│ débloquer toutes les fonctionnalités│
│ [Créer mon compte →]                │
└─────────────────────────────────────┘
```

---

### 4️⃣ Incitation Création Compte

**Déclencheurs :**
- Banner permanent en haut
- Modal après 5 générations guest
- Banner dans `/library` : "Crée ton compte pour synchroniser"
- Limite localStorage atteinte (10 images)

**Modal Upgrade :**
```
┌─────────────────────────────────────┐
│  🚀 Passe au niveau supérieur       │
│                                     │
│  Crée ton compte pour :             │
│                                     │
│  ✅ Synchronisation cloud            │
│  ✅ Accès depuis n'importe où       │
│  ✅ Dossiers illimités              │
│  ✅ Historique complet              │
│  ✅ 3 visuels/mois gratuits         │
│                                     │
│  [Créer mon compte (30 sec) →]     │
│                                     │
│  Email pré-rempli: vincent@...      │
└─────────────────────────────────────┘
```

---

### 5️⃣ Compte Gratuit (après signup)

**État :**
- Compte Supabase créé
- Email vérifié (ou pas selon config)
- User auth.users

**Accès :**
- ✅ 3 visuels/mois avec watermark
- ✅ 5 catégories d'actualités (sur 17)
- ✅ 2 styles visuels (sur 15+)
- ✅ Galerie cloud synchronisée
- ✅ Export 1080px
- ❌ Pas d'Assistant IA
- ❌ Pas d'analytics
- ❌ Pas de brouillons Instagram
- ❌ Pas de planification

**Watermark :**
```
┌─────────────────────────────┐
│                             │
│     [Visuel génial]         │
│                             │
│               Créé avec     │
│               Keiro.ai  ⚡  │ ← Coin bas-droit, 20% opacité
└─────────────────────────────┘
```

**UX Quota :**
```
Dashboard affiche:
┌─────────────────────────────────────┐
│ 📊 Visuels ce mois-ci: 2/3          │
│ [████████████░░░] 66%               │
│                                     │
│ ⚠️ Plus qu'1 visuel !                │
│ Passe à Solo (49€) pour 20/mois    │
│ [Upgrader →]                        │
└─────────────────────────────────────┘
```

---

## 🔄 Migration Guest → Compte

**Quand user crée compte avec même email :**

1. **Détection email existant :**
```typescript
// Au signup
const guestEmail = localStorage.getItem('keiro_guest_email');
if (newUserEmail === guestEmail) {
  // Migrer les données guest
}
```

2. **Migration automatique :**
```typescript
// Récupérer images guest
const guestImages = JSON.parse(localStorage.getItem('keiro_guest_images') || '[]');

// Insérer dans saved_images avec user_id
for (const image of guestImages) {
  await supabase.from('saved_images').insert({
    user_id: newUser.id,
    image_url: image.image_url,
    title: image.title,
    // ... autres champs
  });
}

// Nettoyer localStorage
localStorage.removeItem('keiro_guest_images');
localStorage.removeItem('keiro_guest_email');
```

3. **Message confirmation :**
```
✅ Compte créé avec succès !
🎉 Tes 8 images ont été synchronisées
```

---

## 📊 Quotas par Niveau

| Niveau | Visuels/mois | Watermark | Analytics | Galerie | Support |
|--------|--------------|-----------|-----------|---------|---------|
| **Anonyme** | 1 (puis email) | N/A | ❌ | ❌ | ❌ |
| **Guest** | Illimité session | ❌ Pas de watermark | ❌ | localStorage | ❌ |
| **Gratuit** | 3 | ✅ Oui | ❌ | Cloud | FAQ |
| **Solo 49€** | 20 | ❌ | Basique | Cloud | 48h |
| **Fondateurs 149€** | 80 | ❌ | Complet | Cloud | 12h |
| **Pro 199€** | 80 | ❌ | Complet | Cloud | 12h |

---

## 🎯 Stratégie Conversion

### Objectif : Anonyme → Guest (Email)
**Déclencheur :** Après 1ère génération
**Taux cible :** 60-70%
**Message :** "Sauvegarde ton visuel gratuitement"

### Objectif : Guest → Gratuit (Compte)
**Déclencheur :** Après 5 générations OU limite localStorage
**Taux cible :** 30-40%
**Message :** "Synchronise tes créations partout"

### Objectif : Gratuit → Payant
**Déclencheur :** Atteint 3/3 visuels
**Taux cible :** 35-40%
**Message :** "Passe à 20 visuels pour 49€/mois"

---

## 🔧 Implémentation Technique

### localStorage Keys

```typescript
// Guest mode
'keiro_guest_email': 'user@example.com'
'keiro_guest_images': '[{id, image_url, title, ...}, ...]'
'keiro_guest_instagram_draft': '{caption, hashtags, ...}'

// Quota tracking
'keiro_anonymous_generations': '1' // Count anonyme
```

### Vérification État User

```typescript
function getUserState() {
  // 1. Check Supabase auth
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return { type: 'authenticated', user };

  // 2. Check guest mode
  const guestEmail = localStorage.getItem('keiro_guest_email');
  if (guestEmail) return { type: 'guest', email: guestEmail };

  // 3. Check anonymous quota
  const anonGen = parseInt(localStorage.getItem('keiro_anonymous_generations') || '0');
  if (anonGen < 1) return { type: 'anonymous', canGenerate: true };

  // 4. Anonyme bloqué
  return { type: 'anonymous', canGenerate: false, needsEmail: true };
}
```

### Modal Email Gate Trigger

```typescript
// Dans /generate après génération réussie
const userState = await getUserState();

if (userState.type === 'anonymous' && userState.needsEmail) {
  // Afficher modal email gate
  setShowEmailGate(true);

  // Incrémenter compteur
  localStorage.setItem('keiro_anonymous_generations', '1');
}
```

---

## ✅ Checklist Flow

**Anonyme :**
- [ ] 1 génération sans friction
- [ ] Pas de modal avant
- [ ] Image générée affichée

**Email Gate :**
- [ ] Modal après 1ère génération
- [ ] Form email simple
- [ ] Stockage localStorage
- [ ] Transition smooth vers guest

**Guest Mode :**
- [ ] Banner "Mode invité" visible
- [ ] Galerie localStorage fonctionne
- [ ] Téléchargements OK
- [ ] Incitation compte visible

**Compte Gratuit :**
- [ ] 3 visuels/mois avec watermark
- [ ] Quota affiché clairement
- [ ] Upgrade prompt à 3/3
- [ ] Migration guest data automatique

---

## 🎉 Résumé

**Flow optimisé pour conversion :**

1. **Aucune friction initiale** → 1 génération gratuite
2. **Email gate soft** → Sauvegarde + continue
3. **Guest généreux** → Plusieurs générations
4. **Compte gratuit limité** → 3/mois avec watermark
5. **Upgrade évident** → Solo 49€ pour 20/mois

**Chaque étape réduit friction et augmente engagement !** 🚀
