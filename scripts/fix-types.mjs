import pg from 'pg';
const { Client } = pg;

const client = new Client({
  host: 'aws-1-eu-west-3.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.duxjdlzdfjrhyojjwnig',
  password: 't$Zf8yMnva#QCbb',
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const mappings = [
  ['Boutique cadeaux', 'boutique'],
  ['food', 'restaurant'],
  ['institut de beauté', 'services'],
  ['boutique|concept_store', 'boutique'],
  ['Brasserie', 'restaurant'],
  ['salon de beauté', 'services'],
  ['bien-être', 'coach'],
  ['boulangerie/pâtisserie', 'restaurant'],
  ['boutique|artisanat', 'boutique'],
  ['coach/atelier', 'coach'],
  ['épicerie', 'boutique'],
  ['épicerie fine', 'caviste'],
  ['restaurant|café', 'restaurant'],
  ['concept store', 'boutique'],
  ['restaurant/bar', 'restaurant'],
  ['artisanat|atelier', 'services'],
  ['fleuriste|artisanat', 'fleuriste'],
  ['beauté', 'services'],
  ['artisanat|coworking', 'services'],
  ['librairie', 'boutique'],
  ['librairie/café', 'boutique'],
  ['boutique|décoration', 'boutique'],
  ['boulangerie', 'restaurant'],
  ['café', 'restaurant'],
  ['pâtisserie', 'restaurant'],
];

let total = 0;
for (const [oldType, newType] of mappings) {
  const res = await client.query('UPDATE crm_prospects SET type = $1 WHERE type = $2', [newType, oldType]);
  if (res.rowCount > 0) {
    console.log(`${oldType} → ${newType}: ${res.rowCount}`);
    total += res.rowCount;
  }
}
console.log(`\nTotal normalisés: ${total}`);

// Also normalize any NULL types to 'autre'
const nullRes = await client.query("UPDATE crm_prospects SET type = 'autre' WHERE type IS NULL");
if (nullRes.rowCount > 0) console.log(`NULL → autre: ${nullRes.rowCount}`);

// Apply constraint
await client.query('ALTER TABLE crm_prospects DROP CONSTRAINT IF EXISTS crm_prospects_type_check');
await client.query(`ALTER TABLE crm_prospects ADD CONSTRAINT crm_prospects_type_check
  CHECK (type IN ('restaurant', 'boutique', 'coiffeur', 'coach', 'fleuriste', 'caviste', 'traiteur', 'freelance', 'services', 'professionnel', 'agence', 'pme', 'autre'))`);
console.log('✅ Contrainte type appliquée avec succès');

await client.end();
