/**
 * Rewrite direct Brevo fetch calls → sendBrevoCompat().
 * Simpler approach using indentation-aware block detection.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILES = [
  'app/api/agents/ceo-reports/route.ts',
  'app/api/agents/ceo/route.ts',
  'app/api/agents/amit/route.ts',
  'app/api/agents/client-chat/route.ts',
  'app/api/agents/onboarding/route.ts',
  'app/api/agents/qa/route.ts',
  'app/api/agents/test/route.ts',
  'app/api/cron/admin-weekly-report/route.ts',
  'app/api/cron/daily-cost-check/route.ts',
  'app/api/cron/detect-anomalies/route.ts',
  'app/api/cron/directive-failures-digest/route.ts',
  'app/api/stripe/webhook/route.ts',
  'lib/agents/ceo-group.ts',
  'lib/agents/error-escalation.ts',
  'app/api/agents/email/daily/route.ts',
  'app/api/agents/email/send/route.ts',
];

const IMPORT_LINE = "import { sendBrevoCompat } from '@/lib/email/brevo-compat';";

// Strategy: scan line by line. When we hit a line containing
// `fetch('https://api.brevo.com/v3/smtp/email'`, capture the indentation
// of that line, then consume lines until we find one ending with `});`
// at the same base indentation (this is the close of the fetch call).
// Inside that block, find the `body: JSON.stringify({` line and capture
// from the next line through the matching `}),` line — that's the payload.
function rewriteFile(src) {
  const lines = src.split(/\r?\n/);
  const out = [];
  let i = 0;
  let count = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.includes("fetch('https://api.brevo.com/v3/smtp/email'")) {
      out.push(line);
      i++;
      continue;
    }

    // Detected. Compute leading whitespace + prefix-before-fetch on this line.
    const leadingMatch = line.match(/^(\s*)/);
    const indent = leadingMatch ? leadingMatch[1] : '';
    const fetchIdx = line.indexOf('fetch');
    const prefix = line.slice(0, fetchIdx); // e.g. "        const brevoRes = await "

    // Find the end of the fetch call: closing "});" or "  });" at the SAME indent depth.
    // Walk forward, counting braces/parens to find balanced close.
    let depth = 0;
    let endLine = -1;
    let payloadStartLine = -1;
    let payloadEndLine = -1;

    for (let j = i; j < lines.length; j++) {
      const cur = lines[j];
      // Count parens
      for (let k = 0; k < cur.length; k++) {
        const c = cur[k];
        if (c === '(') depth++;
        else if (c === ')') depth--;
      }
      // Find `body: JSON.stringify({` marker line
      if (payloadStartLine === -1 && cur.includes('body: JSON.stringify({')) {
        payloadStartLine = j;
      }
      // Find `})` line that closes the JSON.stringify on its own (`}),` or similar)
      if (payloadStartLine !== -1 && payloadEndLine === -1 && j > payloadStartLine) {
        // The close is a line whose trimmed content is `}),`
        const t = cur.trim();
        if (t === '}),') {
          payloadEndLine = j;
        }
      }
      if (depth === 0 && j > i) {
        endLine = j;
        break;
      }
    }

    if (endLine === -1 || payloadStartLine === -1 || payloadEndLine === -1) {
      // Bail out — can't safely rewrite, just keep original line and move on.
      out.push(line);
      i++;
      continue;
    }

    // Extract payload body (the lines BETWEEN `body: JSON.stringify({` and `}),`).
    // The opening line has `body: JSON.stringify({` — we keep everything after `({` on that line if any (usually nothing).
    // The closing line is `}),` — we drop the `,` and `)` and use `}` to close payload.
    const payloadOpenLine = lines[payloadStartLine];
    const afterOpenIdx = payloadOpenLine.indexOf('JSON.stringify({') + 'JSON.stringify({'.length;
    const inlineAfterOpen = payloadOpenLine.slice(afterOpenIdx).trim();
    const payloadLines = [];
    if (inlineAfterOpen.length > 0) payloadLines.push(inlineAfterOpen);
    for (let k = payloadStartLine + 1; k < payloadEndLine; k++) {
      payloadLines.push(lines[k]);
    }

    // Build the replacement:
    //   <prefix>sendBrevoCompat({
    //     <payloadLines... reindented to match new context>
    //   })<trailing-from-last-line>;
    //
    // The last line `});` may have a trailing `;` we need to preserve.
    const lastLine = lines[endLine];
    const trailing = lastLine.trim().slice(2); // strip leading "})", keep ";" / ")" etc.
    // Build:
    out.push(`${prefix}sendBrevoCompat({`);
    for (const pl of payloadLines) out.push(pl);
    out.push(`${indent}})${trailing}`);

    count++;
    i = endLine + 1;
  }

  return { src: out.join('\n'), count };
}

let total = 0;
for (const file of FILES) {
  let src = readFileSync(file, 'utf8');
  const result = rewriteFile(src);
  if (result.count === 0) {
    console.log(`skip  ${file}`);
    continue;
  }
  src = result.src;
  if (!src.includes(IMPORT_LINE)) {
    const importRe = /^import .+ from .+;\s*$/gm;
    let lastEnd = 0, m;
    while ((m = importRe.exec(src)) !== null) lastEnd = m.index + m[0].length;
    if (lastEnd > 0) {
      src = src.slice(0, lastEnd) + '\n' + IMPORT_LINE + src.slice(lastEnd);
    } else {
      src = IMPORT_LINE + '\n' + src;
    }
  }
  writeFileSync(file, src);
  console.log(`OK    ${file} — ${result.count} call(s)`);
  total += result.count;
}
console.log(`\nTotal: ${total} Brevo direct calls migrated`);
