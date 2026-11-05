/**
 * Planilha de origem: guarda a última planilha importada (linhas de título, cabeçalho
 * e linhas, como entraram) para exportar de volta no mesmo formato, com a coluna de
 * mesa preenchida com a distribuição atual.
 */
import { buildGuestSeatIndex } from '../../domain/seating';
import { RSVP_LABEL, type SeatingState } from '../../domain/types';
import type { ColumnMapping } from './importGuests';

export interface SourceSheet {
  fileName: string;
  importedAt: string;
  /** Linhas acima do cabeçalho (título, totais…). */
  preamble: string[][];
  /** Cabeçalho (se houver) e linhas de dados, exatamente como lidas. */
  rows: string[][];
  hasHeader: boolean;
  mapping: ColumnMapping;
  /** Índice da linha em `rows` -> id do convidado. */
  rowGuest: Record<number, string>;
  /** Link do Google Planilhas, quando importado por link. */
  googleUrl?: string;
}

export function isSourceSheet(v: unknown): v is SourceSheet {
  const s = v as SourceSheet;
  return !!s && typeof s === 'object' && Array.isArray(s.rows) && Array.isArray(s.preamble) && !!s.mapping && typeof s.rowGuest === 'object';
}

/**
 * Linhas para exportar: título + cabeçalho + linhas originais com a mesa atual na
 * coluna de mesa (criada no fim, como "Mesa", se a planilha não tinha).
 * Convidados cadastrados depois, fora da planilha, entram no final.
 */
export function sourceSheetRows(sheet: SourceSheet, state: SeatingState): Array<Array<string | number>> {
  const idx = buildGuestSeatIndex(state.assignments);
  const width = Math.max(0, ...sheet.rows.map((r) => r.length), ...sheet.preamble.map((r) => r.length));
  const hasTableCol = sheet.mapping.table >= 0;
  const tableCol = hasTableCol ? sheet.mapping.table : width;
  const nameCol = sheet.mapping.fullName;
  const rsvpCol = sheet.mapping.rsvp;
  const pad = (r: Array<string | number>, n: number) => { const c = [...r]; while (c.length < n) c.push(''); return c; };
  const outWidth = hasTableCol ? width : width + 1;

  const out: Array<Array<string | number>> = sheet.preamble.map((r) => [...r]);
  const used = new Set<string>();
  sheet.rows.forEach((r, i) => {
    const row = pad(r, outWidth);
    if (i === 0 && sheet.hasHeader) {
      if (!hasTableCol) row[tableCol] = 'Mesa';
      out.push(row);
      return;
    }
    const id = sheet.rowGuest[i];
    if (id && state.guests[id]) {
      used.add(id);
      const seat = idx.get(id);
      row[tableCol] = seat ? seat.table : '';
    } else if (r.some((c) => c)) {
      row[tableCol] = hasTableCol ? '' : row[tableCol];
    }
    out.push(row);
  });

  const extra = Object.values(state.guests).filter((g) => !used.has(g.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (extra.length) {
    for (const g of extra) {
      const row: Array<string | number> = pad([], outWidth);
      row[nameCol >= 0 ? nameCol : 0] = g.fullName;
      if (rsvpCol >= 0) row[rsvpCol] = RSVP_LABEL[g.rsvp];
      const seat = idx.get(g.id);
      row[tableCol] = seat ? seat.table : '';
      out.push(row);
    }
  }
  return out;
}

export async function sourceSheetXlsx(sheet: SourceSheet, state: SeatingState): Promise<Blob> {
  const XLSX = await import('xlsx');
  const aoa = sourceSheetRows(sheet, state);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const header = aoa[sheet.preamble.length] ?? [];
  ws['!cols'] = header.map((h, i) => ({ wch: i === sheet.mapping.fullName ? 36 : Math.max(8, String(h).length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Lista de Convidados');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function sourceSheetFileName(sheet: SourceSheet): string {
  const base = sheet.fileName.replace(/\.(xlsx|xls|csv|txt|ods)$/i, '') || 'lista-convidados';
  return `${base}_com_mesas.xlsx`;
}

/* ---------------- Google Planilhas ---------------- */

/** Extrai id e aba (gid) de um link do Google Planilhas. */
export function parseGoogleSheetUrl(url: string): { id: string; gid: string } | null {
  const m = /docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{20,})/.exec(url.trim());
  if (!m) return null;
  const g = /[#?&]gid=(\d+)/.exec(url);
  return { id: m[1], gid: g ? g[1] : '0' };
}

export function googleCsvUrls(id: string, gid: string): string[] {
  return [
    `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`,
    `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=0&gid=${gid}`,
  ];
}

/** Baixa a aba como CSV. Exige que a planilha esteja compartilhada como "Qualquer pessoa com o link". */
export async function fetchGoogleSheetCsv(url: string): Promise<string> {
  const p = parseGoogleSheetUrl(url);
  if (!p) throw new Error('Este não parece um link do Google Planilhas. Copie o endereço da barra do navegador com a planilha aberta.');
  let lastErr = '';
  for (const u of googleCsvUrls(p.id, p.gid)) {
    try {
      const res = await fetch(u, { redirect: 'follow' });
      if (!res.ok) { lastErr = `HTTP ${res.status}`; continue; }
      const text = await res.text();
      if (/^\s*<(!doctype|html)/i.test(text)) { lastErr = 'acesso negado'; continue; }
      return text;
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  throw new Error(
    `Não foi possível ler a planilha (${lastErr}). No Google Planilhas, clique em Compartilhar → Acesso geral → "Qualquer pessoa com o link" (Leitor) e tente de novo.`,
  );
}
