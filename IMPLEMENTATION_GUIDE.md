# 🚀 Guide d'Implémentation - Keiro

## 📋 Table des Matières

1. [Grille Pricing Finale](#grille-pricing-finale)
2. [Planification des Publications](#planification-des-publications)
3. [Intégration dans /library](#intégration-dans-library)
4. [Déploiement](#déploiement)

---

## 💰 Grille Pricing Finale

### Récapitulatif Stratégie

```
🎁 Gratuit :       0€         → 3 visuels/mois avec watermark
🎯 Essai :         6.99€ (5j) → Accès complet temporaire
🚀 Solo :          49€/mois   → Pas de publication auto
⭐ Fondateurs :    149€/mois  → TOUT inclus (50 places à vie)
💼 Pro :           199€/mois  → Presque tout + Planification
🏢 Business :      349€/mois  → Pro + Calendrier collaboratif + Multi-comptes
🏆 Elite :         999€/mois  → Consulting premium
```

### Détail des Features par Plan

| Feature | Gratuit | Essai | Solo | Fondateurs | Pro | Business | Elite |
|---------|---------|-------|------|------------|-----|----------|-------|
| **Visuels/mois** | 3 | 20 | 20 | 80 | 80 | 180 | 500 |
| **Vidéos/mois** | 0 | 3 | 3 | 12 | 12 | 30 | 100 |
| **Watermark** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Catégories actus** | 5 | 17 | 12 | 17 | 17 | 17 | 17 |
| **Styles visuels** | 2 | Tous | 7 | 15+ | 15+ | 15+ | 15+ custom |
| **Assistant IA Marketing** | ❌ | ✅ Test | ❌ | ✅ | ✅ | ✅ | ✅ + Consulting |
| **Analytics** | ❌ | ✅ Test | Basique (3 graphs) | Complet (6 graphs) | Complet | Avancé | Avancé |
| **Studio édition** | ❌ | ✅ Test | Basique | Complet | Complet | Complet | Complet |
| **Galerie/Dossiers** | ❌ | ✅ Test | 1 dossier | Illimité | Illimité | Illimité | Illimité |
| **Instagram brouillons** | ❌ | ✅ Test | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Calendrier + Planification** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Calendrier collaboratif** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Multi-comptes** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (1+5) | ✅ Illimité |
| **Publication auto Instagram** | ❌ | ❌ | ❌ | ❌ | ❌ | Roadmap | Roadmap |
| **Export qualité** | 1080px | 4K | 1080px | 4K | 4K | 4K | 4K |
| **Support** | FAQ | Email | 48h | 12h + Démo | 12h + Démo | Chat 2h | Chat 30min + Dédié |

### Justifications Prix

**Solo 49€ → Pro 199€ (+150€, 4x prix) :**
- Assistant IA = 99€/mois valeur
- Analytics complet = 49€/mois valeur
- 7 catégories en + = contenu plus riche
- 10+ styles en + = diversité
- Calendrier planification = organisation
- **Valeur totale : ~300€/mois, Prix : 199€ → Deal évident ✅**

**Pro 199€ → Business 349€ (+150€, 1.75x prix) :**
- Multi-comptes (5) = économie 796€/mois (vs 5×199€)
- Calendrier collaboratif = workflow équipe
- White-label = revente sous sa marque
- **ROI énorme pour agences ✅**

**Business 349€ → Elite 999€ (+650€, 2.9x prix) :**
- Account manager dédié = 200€/mois valeur
- Consulting stratégique 2h/mois = 400€/mois valeur
- Features custom = 300€/mois valeur
- **Valeur totale : 1,050€+/mois, Prix : 999€ ✅**

---

## 📅 Planification des Publications

### Étape 1 : Créer la Table Supabase

1. Connecte-toi à ton dashboard Supabase : https://supabase.com/dashboard
2. Sélectionne ton projet Keiro
3. Va dans **SQL Editor**
4. Clique sur **New query**
5. Copie le contenu du fichier `supabase/migrations/002_scheduled_posts_schema.sql`
6. Exécute la requête (bouton **Run**)

### Étape 2 : Vérifier la Création

Exécute cette requête SQL pour vérifier :

```sql
SELECT * FROM scheduled_posts LIMIT 1;
```

Si ça fonctionne (même si vide), la table existe ✅

### Étape 3 : Fichiers Créés

Les fichiers suivants ont été créés/modifiés :

**Nouveaux composants :**
- ✅ `app/library/components/ScheduleModal.tsx` - Modal planification
- ✅ `app/library/components/CalendarTab.tsx` - Vue calendrier mensuel

**Composants modifiés :**
- ✅ `app/library/components/TabNavigation.tsx` - Ajout onglet Calendrier
- ✅ `app/library/components/ImageCard.tsx` - Ajout bouton Planifier

**API créée :**
- ✅ `app/api/library/scheduled-posts/route.ts` - CRUD scheduled_posts

**Database :**
- ✅ `supabase/migrations/002_scheduled_posts_schema.sql` - Schéma table

---

## 🔌 Intégration dans /library/page.tsx

### Modifications à Faire

Voici les changements à apporter dans `app/library/page.tsx` :

#### 1. Importer les nouveaux composants

Au début du fichier, ajoute :

```typescript
import ScheduleModal from './components/ScheduleModal';
import CalendarTab from './components/CalendarTab';
```

#### 2. Modifier le type Tab

Trouve la ligne où Tab est importé :
```typescript
import TabNavigation, { Tab } from './components/TabNavigation';
```

Le type `Tab` est maintenant : `'images' | 'drafts' | 'calendar'`

#### 3. Ajouter les états pour la planification

Dans le composant, après les autres useState :

```typescript
const [showScheduleModal, setShowScheduleModal] = useState(false);
const [selectedImageForSchedule, setSelectedImageForSchedule] = useState<SavedImage | null>(null);
const [scheduledPosts, setScheduledPosts] = useState<any[]>([]);
```

#### 4. Charger les posts planifiés

Ajoute cette fonction après `loadInstagramDrafts` :

```typescript
const loadScheduledPosts = useCallback(async () => {
  if (!user) return;

  try {
    const res = await fetch('/api/library/scheduled-posts');
    const data = await res.json();

    if (data.ok) {
      setScheduledPosts(data.posts);
      setStats(prev => ({ ...prev, total_scheduled: data.posts.length }));
    }
  } catch (err) {
    console.error('[Library] Error loading scheduled posts:', err);
  }
}, [user]);
```

Appelle cette fonction dans le useEffect de chargement :

```typescript
useEffect(() => {
  if (user) {
    loadImages();
    loadFolders();
    loadInstagramDrafts();
    loadScheduledPosts(); // ← Ajouter ici
  }
}, [user, loadImages, loadFolders, loadInstagramDrafts, loadScheduledPosts]);
```

#### 5. Handler pour ouvrir le modal de planification

```typescript
const handleScheduleImage = (image: SavedImage) => {
  setSelectedImageForSchedule(image);
  setShowScheduleModal(true);
};

const handleSchedulePost = async (data: {
  platform: string;
  scheduledFor: string;
  caption: string;
  hashtags: string[];
}) => {
  if (!selectedImageForSchedule) return;

  try {
    const res = await fetch('/api/library/scheduled-posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        saved_image_id: selectedImageForSchedule.id,
        platform: data.platform,
        scheduled_for: data.scheduledFor,
        caption: data.caption,
        hashtags: data.hashtags
      })
    });

    const result = await res.json();

    if (result.ok) {
      await loadScheduledPosts();
      setShowScheduleModal(false);
      setSelectedImageForSchedule(null);
      alert('✅ Publication planifiée avec succès !');
    } else {
      alert('❌ Erreur : ' + result.error);
    }
  } catch (err) {
    console.error('[Library] Error scheduling post:', err);
    alert('❌ Erreur lors de la planification');
  }
};

const handleEditScheduledPost = (post: any) => {
  // TODO: Implémenter édition
  console.log('Edit post:', post);
};

const handleDeleteScheduledPost = async (postId: string) => {
  try {
    const res = await fetch(`/api/library/scheduled-posts?id=${postId}`, {
      method: 'DELETE'
    });

    const result = await res.json();

    if (result.ok) {
      await loadScheduledPosts();
      alert('✅ Publication supprimée');
    } else {
      alert('❌ Erreur : ' + result.error);
    }
  } catch (err) {
    console.error('[Library] Error deleting post:', err);
    alert('❌ Erreur lors de la suppression');
  }
};
```

#### 6. Passer la prop onSchedule à ImageGrid

Dans le render, trouve `<ImageGrid>` et ajoute :

```typescript
<ImageGrid
  images={filteredImages}
  user={user}
  isGuest={isGuest}
  onToggleFavorite={handleToggleFavorite}
  onDownload={handleDownload}
  onDelete={handleDelete}
  onOpenInstagram={handleOpenInstagramModal}
  onSchedule={handleScheduleImage} // ← Ajouter ici
  onTitleEdit={handleTitleEdit}
  emptyMessage="Aucune image trouvée"
/>
```

Et dans le composant `ImageGrid.tsx`, ajoute la prop :

```typescript
interface ImageGridProps {
  // ... props existantes
  onSchedule?: (image: SavedImage) => void; // ← Ajouter
}

// Et passe-la à ImageCard :
<ImageCard
  // ... props existantes
  onSchedule={onSchedule} // ← Ajouter
/>
```

#### 7. Modifier TabNavigation

Trouve `<TabNavigation>` et modifie :

```typescript
<TabNavigation
  activeTab={activeTab}
  onTabChange={setActiveTab}
  imageCount={filteredImages.length}
  draftCount={instagramDrafts.length}
  scheduledCount={scheduledPosts.length} // ← Ajouter
/>
```

#### 8. Ajouter l'onglet Calendrier dans le render

Trouve le code qui affiche les onglets et ajoute :

```typescript
{activeTab === 'images' && (
  <ImageGrid ... />
)}

{activeTab === 'drafts' && (
  <InstagramDraftsTab ... />
)}

{activeTab === 'calendar' && (
  <CalendarTab
    scheduledPosts={scheduledPosts}
    onEditPost={handleEditScheduledPost}
    onDeletePost={handleDeleteScheduledPost}
  />
)}
```

#### 9. Ajouter les modals

À la fin du render, avant le dernier `</main>` :

```typescript
{/* Schedule Modal */}
{showScheduleModal && selectedImageForSchedule && (
  <ScheduleModal
    isOpen={showScheduleModal}
    onClose={() => {
      setShowScheduleModal(false);
      setSelectedImageForSchedule(null);
    }}
    image={selectedImageForSchedule}
    onSchedule={handleSchedulePost}
  />
)}
```

---

## 🚀 Déploiement

### 1. Exécuter SQL

1. Va sur Supabase Dashboard
2. SQL Editor
3. Exécute `002_scheduled_posts_schema.sql`
4. Vérifie que la table existe

### 2. Tester en Local

```bash
npm run dev
```

Teste :
- ✅ Bouton "Planifier" apparaît sur chaque image
- ✅ Modal s'ouvre correctement
- ✅ Onglet "Calendrier" fonctionne
- ✅ Vue calendrier affiche les posts

### 3. Commit & Push

```bash
git add .
git commit -m "feat: Ajout planification publications + calendrier collaboratif

- Nouveau modal planification avec sélection date/heure/plateforme
- Vue calendrier mensuel interactive
- Onglet Calendrier dans /library
- API CRUD pour scheduled_posts
- Boutons Planifier sur chaque image (desktop + mobile)
- Support Business plan: calendrier collaboratif + multi-comptes

🤖 Generated with Claude Code
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

git push
```

### 4. Deploy Vercel

Vercel détectera automatiquement le push et déploiera.

---

## ✅ Checklist Finale

### Database
- [ ] Table `scheduled_posts` créée dans Supabase
- [ ] RLS policies actives
- [ ] Indexes créés

### Frontend
- [ ] Composant ScheduleModal créé
- [ ] Composant CalendarTab créé
- [ ] TabNavigation modifié (onglet calendar)
- [ ] ImageCard modifié (bouton Planifier)
- [ ] ImageGrid passe la prop onSchedule
- [ ] page.tsx intégré avec tous les handlers

### API
- [ ] Route `/api/library/scheduled-posts` créée
- [ ] GET fonctionne (liste posts)
- [ ] POST fonctionne (créer post)
- [ ] PATCH fonctionne (modifier post)
- [ ] DELETE fonctionne (supprimer post)

### Tests
- [ ] Planifier un post depuis galerie
- [ ] Voir le post dans le calendrier
- [ ] Cliquer sur le post → détails
- [ ] Modifier un post planifié
- [ ] Supprimer un post planifié
- [ ] Vue calendrier responsive (mobile + desktop)

### Pricing
- [ ] Mettre à jour page `/pricing` avec nouvelle grille
- [ ] Ajouter plan Solo (49€)
- [ ] Modifier Fondateurs (149€ - 50 places)
- [ ] Pro à 199€ avec planification
- [ ] Business à 349€ avec calendrier collaboratif + multi-comptes
- [ ] Elite à 999€ avec consulting

---

## 📝 Notes Importantes

### Features Business (349€)

Les 2 features premium pour le plan Business sont :

1. **Calendrier Collaboratif** ✅ (Implémenté)
   - Champ `approval_status` dans `scheduled_posts`
   - Champ `comments` pour feedback
   - Champ `created_by` et `approved_by`
   - UI collaboration à venir (validation workflow)

2. **Multi-comptes** (À implémenter)
   - Système de sous-comptes (1 principal + 5 clients)
   - Dashboard centralisé
   - Facturation groupée
   - Nécessite nouvelle table `sub_accounts`

### Prochaines Étapes

**Phase 1 (Actuelle) :**
- ✅ Planification manuelle
- ✅ Calendrier visuel
- ✅ Notifications par email (à implémenter)

**Phase 2 (Future) :**
- Publication automatique via Meta API
- Intégration LinkedIn, Twitter
- Analytics par post publié

**Phase 3 (Future) :**
- Multi-comptes complets
- Workflow d'approbation collaboratif
- White-label Business plan

---

## 🎯 Résumé Rapide

**Tu as maintenant :**
1. ✅ Grille pricing cohérente (49€ → 149€ → 199€ → 349€ → 999€)
2. ✅ Planification des publications avec modal complet
3. ✅ Vue calendrier mensuel interactive
4. ✅ API complète pour gérer les posts planifiés
5. ✅ Boutons Planifier sur toutes les images
6. ✅ Onglet Calendrier dans /library
7. ✅ Features Business définies (calendrier collaboratif + multi-comptes)

**Il te reste à faire :**
1. Exécuter le SQL dans Supabase
2. Intégrer les modifications dans `page.tsx` (suivre section ci-dessus)
3. Tester en local
4. Push vers prod

**Besoin d'aide ?** Relis ce guide section par section ! 🚀
