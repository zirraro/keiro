import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { checkCredits, deductCredits, isAdmin as checkIsAdmin } from '@/lib/credits/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AGENT_NAMES: Record<string, string> = {
  ceo: 'Agent CEO',
  commercial: 'Agent Commercial',
  email: 'Agent Email',
  marketing: 'Agent Marketing',
  seo: 'Agent SEO',
  onboarding: 'Agent Onboarding',
  retention: 'Agent Rétention',
  content: 'Agent Contenu',
  comptable: 'Agent Comptable',
  ops: 'Agent Ops',
  client: 'Agent Client',
  amit: 'Amit',
  'dm-instagram': 'Agent DM Instagram',
  gmaps: 'Agent Google Maps',
  whatsapp: 'Agent WhatsApp',
  'client-chat': 'Agent Client Chat',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Convert markdown-ish content to structured HTML for PDF export.
 */
function contentToHtml(content: string, title: string, agentName: string): string {
  const date = formatDate(new Date());

  // Convert basic markdown to HTML
  let htmlBody = escapeHtml(content)
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:18px;">$1</h1>')
    // Bold / italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    // Line breaks (double newline = paragraph, single = br)
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br/>');

  // Wrap stray <li> in <ul>
  htmlBody = htmlBody.replace(
    /(<li>.*?<\/li>(?:<br\/>)?)+/g,
    (match) => `<ul>${match.replace(/<br\/>/g, '')}</ul>`,
  );

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; padding: 40px; max-width: 800px; margin: 0 auto; line-height: 1.6; }
  .header { border-bottom: 3px solid #7c3aed; padding-bottom: 16px; margin-bottom: 24px; }
  .header h1 { margin: 0 0 4px 0; color: #7c3aed; font-size: 22px; }
  .header .meta { color: #666; font-size: 13px; }
  h2 { color: #7c3aed; font-size: 17px; margin-top: 24px; }
  h3 { color: #4a4a6a; font-size: 15px; margin-top: 20px; }
  ul { padding-left: 20px; }
  li { margin-bottom: 4px; }
  p { margin: 8px 0; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; font-size: 13px; }
  th { background: #7c3aed; color: white; }
  tr:nth-child(even) { background: #f8f7ff; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; color: #999; font-size: 11px; text-align: center; }
</style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">${escapeHtml(agentName)} &mdash; ${escapeHtml(date)}</div>
  </div>
  <div class="content">
    <p>${htmlBody}</p>
  </div>
  <div class="footer">
    Export&eacute; depuis KeiroAI &mdash; ${escapeHtml(date)}
  </div>
</body>
</html>`;
}

/**
 * Parse content into CSV rows. Supports:
 * - Markdown tables (| col1 | col2 |)
 * - Structured list items (- key: value)
 * - Plain text (each paragraph = row)
 */
function contentToCsv(content: string, title: string, agentName: string): string {
  const BOM = '\uFEFF'; // UTF-8 BOM for Excel compatibility
  const date = formatDate(new Date());
  const lines: string[] = [];

  // Header row with metadata
  lines.push(csvRow(['Export KeiroAI', agentName, date]));
  lines.push(csvRow([title]));
  lines.push(''); // blank separator

  const contentLines = content.split('\n');
  let inTable = false;
  let headerSkipped = false;

  for (const line of contentLines) {
    const trimmed = line.trim();

    // Markdown table row
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      // Skip separator rows (|---|---|)
      if (/^\|[\s-:|]+\|$/.test(trimmed)) {
        headerSkipped = true;
        continue;
      }

      inTable = true;
      const cells = trimmed
        .split('|')
        .filter((c) => c.trim() !== '')
        .map((c) => c.trim());
      lines.push(csvRow(cells));
      continue;
    }

    // End of table
    if (inTable && !trimmed.startsWith('|')) {
      inTable = false;
      headerSkipped = false;
      lines.push('');
    }

    // Structured list: "- key: value" or "* key: value"
    const listMatch = trimmed.match(/^[-*]\s+(.+?):\s+(.+)$/);
    if (listMatch) {
      lines.push(csvRow([listMatch[1], listMatch[2]]));
      continue;
    }

    // Section headers
    if (trimmed.startsWith('#')) {
      lines.push('');
      lines.push(csvRow([trimmed.replace(/^#+\s*/, '')]));
      continue;
    }

    // Non-empty plain text
    if (trimmed && !trimmed.startsWith('---')) {
      lines.push(csvRow([trimmed]));
    }
  }

  return BOM + lines.join('\r\n');
}

function csvRow(cells: string[]): string {
  return cells
    .map((cell) => {
      // Escape double quotes and wrap in quotes if needed
      const escaped = cell.replace(/"/g, '""');
      if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n') || escaped.includes(';')) {
        return `"${escaped}"`;
      }
      return escaped;
    })
    .join(',');
}

// ---------------------------------------------------------------------------
// POST — Export agent conversation as PDF (HTML) or XLSX (CSV)
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Non autorisé' }, { status: 401 });
    }

    const body = await req.json();
    const { agent_id: agentId, format, content, title: customTitle } = body as {
      agent_id: string;
      format: 'pdf' | 'xlsx';
      content: string;
      title?: string;
    };

    // Validation
    if (!agentId || !format || !content) {
      return NextResponse.json(
        { ok: false, error: 'Paramètres manquants: agent_id, format et content requis' },
        { status: 400 },
      );
    }

    if (format !== 'pdf' && format !== 'xlsx') {
      return NextResponse.json(
        { ok: false, error: 'Format non supporté. Utilisez "pdf" ou "xlsx".' },
        { status: 400 },
      );
    }

    if (content.length > 500_000) {
      return NextResponse.json(
        { ok: false, error: 'Contenu trop volumineux (max 500 000 caractères)' },
        { status: 400 },
      );
    }

    // Credit check (admin bypass)
    const admin = await checkIsAdmin(user.id);
    if (!admin) {
      const creditCheck = await checkCredits(user.id, 'marketing_chat');
      if (!creditCheck.allowed) {
        return NextResponse.json(
          { ok: false, error: 'Crédits insuffisants pour l\'export (1 crédit requis)', balance: creditCheck.balance },
          { status: 402 },
        );
      }
    }

    const agentName = AGENT_NAMES[agentId] || `Agent ${agentId}`;
    const title = customTitle || `Rapport ${agentName}`;
    const safeTitle = title.replace(/[^a-zA-Z0-9àâäéèêëïîôùûüÿçÀÂÄÉÈÊËÏÎÔÙÛÜŸÇ _-]/g, '').substring(0, 100);
    const dateSlug = new Date().toISOString().slice(0, 10);

    let responseBody: Buffer | string;
    let contentType: string;
    let fileExtension: string;
    let fileName: string;

    if (format === 'pdf') {
      // Generate HTML document (viewable / printable as PDF by the browser)
      responseBody = contentToHtml(content, title, agentName);
      contentType = 'text/html; charset=utf-8';
      fileExtension = 'html';
      fileName = `${safeTitle}_${dateSlug}.${fileExtension}`;
    } else {
      // Generate CSV (Excel-compatible with BOM + .csv)
      responseBody = contentToCsv(content, title, agentName);
      contentType = 'text/csv; charset=utf-8';
      fileExtension = 'csv';
      fileName = `${safeTitle}_${dateSlug}.${fileExtension}`;
    }

    // Deduct credit after successful generation
    if (!admin) {
      await deductCredits(user.id, 'marketing_chat', `Export ${format.toUpperCase()} — ${agentName}`);
    }

    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    console.error('[agent-export] POST error:', err);
    return NextResponse.json(
      { ok: false, error: err.message || 'Erreur interne' },
      { status: 500 },
    );
  }
}
