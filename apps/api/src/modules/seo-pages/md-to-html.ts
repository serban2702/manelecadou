/**
 * Mini MD → HTML converter — minim necesar pentru paginile SEO generate
 * de OpenAI: H1/H2/H3, paragrafe, liste (ord/unord), bold (**), italic (*),
 * link-uri [text](url), inline code (`x`).
 *
 * NU folosim librărie externă ca să păstrăm bundle-ul mic și să avem
 * control complet pe output (no XSS risks din input controlat de noi).
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(text: string): string {
  let out = escapeHtml(text);
  // links: [text](url) — url-ul e escape-uit deja, dar nu vrem javascript:
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, url: string) => {
    const safeUrl = url.startsWith('javascript:') ? '#' : url;
    return `<a href="${safeUrl}">${label}</a>`;
  });
  // bold **x**
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // italic *x* (non-greedy, evită confuzia cu **)
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  // inline code `x`
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  return out;
}

export function mdToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let i = 0;
  let inUl = false;
  let inOl = false;
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const joined = paragraphBuffer.join(' ').trim();
    if (joined) html.push(`<p>${renderInline(joined)}</p>`);
    paragraphBuffer = [];
  };
  const closeLists = () => {
    if (inUl) {
      html.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      html.push('</ol>');
      inOl = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      closeLists();
      i++;
      continue;
    }

    // Headings
    const h1 = trimmed.match(/^#\s+(.*)/);
    const h2 = trimmed.match(/^##\s+(.*)/);
    const h3 = trimmed.match(/^###\s+(.*)/);
    if (h1) {
      flushParagraph();
      closeLists();
      html.push(`<h1>${renderInline(h1[1])}</h1>`);
      i++;
      continue;
    }
    if (h2) {
      flushParagraph();
      closeLists();
      html.push(`<h2>${renderInline(h2[1])}</h2>`);
      i++;
      continue;
    }
    if (h3) {
      flushParagraph();
      closeLists();
      html.push(`<h3>${renderInline(h3[1])}</h3>`);
      i++;
      continue;
    }

    // Unordered list
    const ulItem = trimmed.match(/^[-*]\s+(.*)/);
    if (ulItem) {
      flushParagraph();
      if (inOl) {
        html.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        html.push('<ul>');
        inUl = true;
      }
      html.push(`<li>${renderInline(ulItem[1])}</li>`);
      i++;
      continue;
    }

    // Ordered list
    const olItem = trimmed.match(/^\d+\.\s+(.*)/);
    if (olItem) {
      flushParagraph();
      if (inUl) {
        html.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        html.push('<ol>');
        inOl = true;
      }
      html.push(`<li>${renderInline(olItem[1])}</li>`);
      i++;
      continue;
    }

    // Paragraph line (accumulate)
    closeLists();
    paragraphBuffer.push(trimmed);
    i++;
  }

  flushParagraph();
  closeLists();

  return html.join('\n');
}
