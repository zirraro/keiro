/**
 * textToSafeHtml — single source of truth for turning a PLAIN-TEXT email
 * body into clean, safe HTML paragraphs.
 *
 * Why this exists: several builders (Hugo replies, drafts, SMTP, IMAP)
 * used `body.split(\n\n).map(p => <p>${p}</p>)` WITHOUT sanitizing, so any
 * stray '<' or HTML the AI/user produced leaked into the recipient's inbox
 * (founder bug 29/06) — and raw user/AI input in HTML is also an injection
 * risk. This helper is bulletproof:
 *   - strips ALL <...> tags + lone angle brackets
 *   - drops markdown emphasis markers (keeps the text)
 *   - escapes '&'
 *   - blank line => <p>, single newline => <br>
 *
 * Use this everywhere an email HTML body is built from text.
 */

function cleanLine(line: string): string {
  return String(line || '')
    .replace(/<[^>]*>/g, ' ')      // strip any tag-like <...>
    .replace(/[<>]/g, '')           // remove stray angle brackets entirely
    .replace(/\*\*?|__|`/g, '')     // drop markdown emphasis, keep text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&/g, '&amp;')         // escape ampersand (no < > left)
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Inner paragraphs only (no wrapper div). */
export function textToParagraphs(raw: string): string {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map(block => block.split('\n').map(cleanLine).filter(Boolean).join('<br>'))
    .filter(Boolean)
    .map(p => `<p style="margin:0 0 14px;">${p}</p>`)
    .join('');
}

/** Full HTML body wrapped in the standard email font container. */
export function textToSafeHtml(raw: string): string {
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#333;">${textToParagraphs(raw)}</div>`;
}
