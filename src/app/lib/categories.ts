export type CleanCat =
  | 'a-la-une' | 'politique' | 'economie' | 'business' | 'sport' | 'people'
  | 'sante' | 'restauration' | 'tech' | 'culture' | 'monde' | 'auto'
  | 'climat' | 'immo' | 'lifestyle' | 'gaming';

export const CATEGORIES: {cat: CleanCat; label: string}[] = [
  {cat:'a-la-une',label:'À la une'},
  {cat:'politique',label:'Politique'},
  {cat:'economie',label:'Économie'},
  {cat:'business',label:'Business'},
  {cat:'sport',label:'Sport'},
  {cat:'people',label:'People'},
  {cat:'sante',label:'Santé'},
  {cat:'restauration',label:'Restauration'},
  {cat:'tech',label:'Tech'},
  {cat:'culture',label:'Culture'},
  {cat:'monde',label:'Monde'},
  {cat:'auto',label:'Auto'},
  {cat:'climat',label:'Climat'},
  {cat:'immo',label:'Immo'},
  {cat:'lifestyle',label:'Lifestyle'},
  {cat:'gaming',label:'Gaming'},
];

export const CAT_TO_QUERY: Record<CleanCat,string> = {
  'a-la-une':     'breaking OR top stories',
  'politique':    'politics OR gouvernement OR parlement',
  'economie':     'économie OR inflation OR croissance',
  'business':     'entreprise OR start-up OR financement',
  'sport':        'match OR tournoi OR championnat',
  'people':       'people OR célébrité OR star',
  'sante':        'santé OR hôpital OR médicament',
  'restauration': 'restaurant OR restauration OR foodservice',
  'tech':         'technologie OR IA OR startup OR numérique',
  'culture':      'cinéma OR série OR festival OR culture',
  'monde':        'international OR diplomatie',
  'auto':         'automobile OR voiture OR EV',
  'climat':       'climat OR environnement',
  'immo':         'immobilier OR logement',
  'lifestyle':    'tendance OR lifestyle',
  'gaming':       'jeu vidéo OR gaming OR e-sport',
};
