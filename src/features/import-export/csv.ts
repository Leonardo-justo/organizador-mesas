/** CSV: leitura (RFC 4180, separador detectado) e escrita compatível com Excel em português. */

export function detectDelimiter(text: string): string {
  const firstLines = text.split(/\r?\n/).slice(0, 5).join('\n');
  const candidates = [';', ',', '\t'];
  let best = ',';
  let bestCount = -1;
  for (const c of candidates) {
    let n = 0, inQ = false;
    for (const ch of firstLines) {
      if (ch === '"') inQ = !inQ;
      else if (ch === c && !inQ) n++;
    }
    if (n > bestCount) { best = c; bestCount = n; }
  }
  return best;
}

export function parseCsv(input: string, delimiter?: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const sep = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === sep) { row.push(field); field = ''; i++; continue; }
    if (ch === '\r' || ch === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
      if (ch === '\r' && text[i + 1] === '\n') i++;
      i++; continue;
    }
    field += ch; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Decodifica bytes como UTF-8; se houver caracteres inválidos, tenta Windows-1252 (Excel antigo). */
export function decodeText(buf: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buf);
  if (!utf8.includes('�')) return utf8;
  try {
    return new TextDecoder('windows-1252').decode(buf);
  } catch {
    return utf8;
  }
}

function escapeCell(v: unknown, sep: string): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /["\r\n]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Gera CSV com BOM UTF-8 e separador ";" (padrão do Excel em pt-BR), preservando acentos. */
export function toCsv(rows: unknown[][], sep = ';'): string {
  return '﻿' + rows.map((r) => r.map((c) => escapeCell(c, sep)).join(sep)).join('\r\n') + '\r\n';
}
