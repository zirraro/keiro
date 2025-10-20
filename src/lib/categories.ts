export type CategoryKey =
  | 'top' | 'politics' | 'economy' | 'business' | 'sport' | 'people' | 'health'
  | 'food' | 'tech' | 'culture' | 'world' | 'auto' | 'climate' | 'realestate'
  | 'lifestyle' | 'gaming' | 'science' | 'education' | 'finance' | 'startups'
  | 'travel' | 'music' | 'cinema' | 'fashion' | 'beauty';

export const CATEGORIES: { key: CategoryKey; label: string; query: string }[] = [
  { key:'top',        label:'À la une',            query:'' },
  { key:'politics',   label:'Politique',           query:'politique OR gouvernement OR élection' },
  { key:'economy',    label:'Économie',            query:'économie OR croissance OR inflation' },
  { key:'business',   label:'Business',            query:'entreprise OR levée de fonds OR acquisition' },
  { key:'sport',      label:'Sport',               query:'sport OR match OR tournoi' },
  { key:'people',     label:'People',              query:'people OR célébrité OR star' },
  { key:'health',     label:'Santé',               query:'santé OR hôpital OR médicament' },
  { key:'food',       label:'Restauration',        query:'restauration OR restaurant OR food' },
  { key:'tech',       label:'Tech',                query:'IA OR intelligence artificielle OR startup tech OR logiciel' },
  { key:'culture',    label:'Culture',             query:'culture OR livre OR expo OR théâtre' },
  { key:'world',      label:'Monde',               query:'international OR diplomatie' },
  { key:'auto',       label:'Auto',                query:'automobile OR voiture OR constructeur' },
  { key:'climate',    label:'Climat',              query:'climat OR environnement OR énergie' },
  { key:'realestate', label:'Immo',                query:'immobilier OR logement' },
  { key:'lifestyle',  label:'Lifestyle',           query:'lifestyle OR tendances' },
  { key:'gaming',     label:'Gaming',              query:'jeu vidéo OR gaming' },
  { key:'science',    label:'Science',             query:'science OR recherche' },
  { key:'education',  label:'Éducation',           query:'éducation OR école' },
  { key:'finance',    label:'Finance',             query:'marchés OR bourse OR finance' },
  { key:'startups',   label:'Startups',            query:'startup OR levée OR seed OR série A' },
  { key:'travel',     label:'Voyage',              query:'voyage OR tourisme' },
  { key:'music',      label:'Musique',             query:'musique OR concert OR album' },
  { key:'cinema',     label:'Cinéma',              query:'cinéma OR film OR festival' },
  { key:'fashion',    label:'Mode',                query:'mode OR fashion' },
  { key:'beauty',     label:'Beauté',              query:'beauté OR cosmétique' },
];
