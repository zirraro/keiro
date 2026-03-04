import fs from 'fs';
import path from 'path';

const ROOT = 'C:\\Users\\vcgle\\Documents\\GitHub\\keiro';

// Routes that MUST stay as Node.js
const KEEP_NODEJS = [
  'merge-audio-video',
  'preview-video',
  'facebook-data-deletion',
  'crm\\import',
  'crm/import',
];

function shouldSkip(filePath) {
  return KEEP_NODEJS.some(pattern => filePath.includes(pattern));
}

function getAllRoutes(dir) {
  const results = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results.push(...getAllRoutes(fullPath));
    } else if (item.name === 'route.ts') {
      results.push(fullPath);
    }
  }
  return results;
}

const apiDir = path.join(ROOT, 'app', 'api');
const routes = getAllRoutes(apiDir);
let converted = 0, skipped = 0, alreadyEdge = 0, changedFromNodejs = 0;

for (const route of routes) {
  const shortPath = route.replace(ROOT + path.sep, '');

  if (shouldSkip(route)) {
    skipped++;
    console.log('SKIP (nodejs needed):', shortPath);
    continue;
  }

  let content = fs.readFileSync(route, 'utf-8');

  // Already has edge runtime
  if (content.includes("runtime = 'edge'") || content.includes('runtime = "edge"')) {
    alreadyEdge++;
    continue;
  }

  // Has nodejs runtime - change to edge
  if (content.includes("runtime = 'nodejs'") || content.includes('runtime = "nodejs"')) {
    content = content.replace(/export\s+const\s+runtime\s*=\s*['"]nodejs['"];?/, "export const runtime = 'edge';");
    fs.writeFileSync(route, content, 'utf-8');
    changedFromNodejs++;
    console.log('CHANGED nodejs->edge:', shortPath);
    continue;
  }

  // No runtime declaration - add edge after last import
  const lines = content.split('\n');
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('import ') && (trimmed.includes(' from ') || trimmed.includes("from '"))) {
      lastImportIdx = i;
    }
    // Multi-line imports: look for closing line with 'from'
    if (trimmed.includes("} from '") || trimmed.includes('} from "')) {
      lastImportIdx = i;
    }
  }

  if (lastImportIdx === -1) {
    lines.unshift("export const runtime = 'edge';", '');
  } else {
    lines.splice(lastImportIdx + 1, 0, '', "export const runtime = 'edge';");
  }

  fs.writeFileSync(route, lines.join('\n'), 'utf-8');
  converted++;
  console.log('ADDED edge:', shortPath);
}

console.log('\n--- Summary ---');
console.log('Total routes:', routes.length);
console.log('Converted to edge:', converted);
console.log('Changed nodejs->edge:', changedFromNodejs);
console.log('Already edge:', alreadyEdge);
console.log('Skipped (must stay nodejs):', skipped);
