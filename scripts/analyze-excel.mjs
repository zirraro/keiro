import XLSX from 'xlsx';

const wb = XLSX.readFile('C:\\Users\\vcgle\\Downloads\\keiroai_crm_2000_prospects.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
const headers = rows[0];
const data = rows.slice(1).filter(r => r && r.some(v => v !== undefined && v !== null && v !== ''));

console.log('Total lignes (hors header):', rows.length - 1);
console.log('Lignes non-vides:', data.length);
console.log('Lignes vides:', rows.length - 1 - data.length);

// Find columns
const companyIdx = headers.findIndex(h => h && h.toString().toLowerCase() === 'nom');
const igIdx = headers.findIndex(h => h && h.toString().toLowerCase() === 'instagram');
const phoneIdx = headers.findIndex(h => h && h.toString().toLowerCase().includes('phone') || (h && h.toString().toLowerCase().includes('léphone')));

console.log('\nColonne Nom:', companyIdx, '→', headers[companyIdx]);
console.log('Colonne Instagram:', igIdx, '→', headers[igIdx]);
console.log('Colonne Téléphone:', phoneIdx, '→', headers[phoneIdx]);

// Check duplicates by company name
const companyCounts = {};
const igCounts = {};
for (const row of data) {
  const company = row[companyIdx] ? row[companyIdx].toString().toLowerCase().trim() : '';
  const ig = row[igIdx] ? row[igIdx].toString().toLowerCase().trim().replace('@', '') : '';
  if (company) companyCounts[company] = (companyCounts[company] || 0) + 1;
  if (ig) igCounts[ig] = (igCounts[ig] || 0) + 1;
}

const dupCompanies = Object.entries(companyCounts).filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]);
const dupIg = Object.entries(igCounts).filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]);

console.log('\n=== DOUBLONS PAR NOM ===');
console.log('Entreprises en double:', dupCompanies.length);
console.log('Total lignes en double:', dupCompanies.reduce((s, [, c]) => s + c - 1, 0));
console.log('\nTop 20:');
dupCompanies.slice(0, 20).forEach(([name, count]) => console.log('  ' + count + 'x ' + name));

console.log('\n=== DOUBLONS PAR INSTAGRAM ===');
console.log('Instagram en double:', dupIg.length);
console.log('Total lignes en double:', dupIg.reduce((s, [, c]) => s + c - 1, 0));
dupIg.slice(0, 10).forEach(([name, count]) => console.log('  ' + count + 'x @' + name));

// Rows with no useful data
let emptyish = 0;
for (const row of rows.slice(1)) {
  if (!row) { emptyish++; continue; }
  const hasName = row[companyIdx] && row[companyIdx].toString().trim();
  const hasIg = row[igIdx] && row[igIdx].toString().trim();
  const hasPhone = phoneIdx >= 0 && row[phoneIdx] && row[phoneIdx].toString().trim();
  if (!hasName && !hasIg && !hasPhone) emptyish++;
}
console.log('\nLignes sans nom, instagram, ni téléphone:', emptyish);
