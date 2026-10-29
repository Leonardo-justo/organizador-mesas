import { areNamesSimilar, cleanText, createGuest, normalizeName, parseRsvp } from '../../domain/guests';
import type { Guest } from '../../domain/types';
import { decodeText, parseCsv } from './csv';

export type FieldKey = 'fullName' | 'displayName' | 'group' | 'companion' | 'rsvp' | 'notes';

export const FIELD_LABELS: Record<FieldKey, string> = {
  fullName: 'Nome completo (obrigatório)',
  displayName: 'Nome de exibição',
  group: 'Família ou grupo',
  companion: 'Acompanhante / vínculo',
  rsvp: 'Confirmação de presença',
  notes: 'Observações',
};

export type ColumnMapping = Record<FieldKey, number>; // -1 = não importar

const PATTERNS: Record<FieldKey, RegExp> = {
  fullName: /^(nome( completo)?|nomes?|convidad[oa]s?|nome do convidado|full ?name|name|pessoa)$/,
  displayName: /(exib|apelido|como chamar|nickname|display)/,
  group: /(famil|grupo|lado|nucleo|group|family)/,
  companion: /(acompanh|vinculo|conjuge|par|plus ?one|companion)/,
  rsvp: /(presen|confirm|rsvp|status|vai)/,
  notes: /(obs|nota|coment|restri|notes?)/,
};

export function fileToArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(file);
  });
}

export async function readSpreadsheet(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  const buf = await fileToArrayBuffer(file);
  if (name.endsWith('.csv') || name.endsWith('.txt') || file.type === 'text/csv') {
    return trimRows(parseCsv(decodeText(buf)));
  }
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'array', codepage: 65001 });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '', blankrows: true });
  return trimRows(rows.map((r) => r.map((c) => cleanText(c))));
}

function trimRows(rows: string[][]): string[][] {
  const out = rows.map((r) => r.map((c) => cleanText(c)));
  while (out.length && out[out.length - 1].every((c) => !c)) out.pop();
  return out;
}

export function detectHeader(rows: string[][]): boolean {
  const first = rows[0];
  if (!first) return false;
  return first.some((c) => Object.values(PATTERNS).some((p) => p.test(normalizeName(c))));
}

export function detectMapping(rows: string[][], hasHeader: boolean): ColumnMapping {
  const mapping: ColumnMapping = { fullName: -1, displayName: -1, group: -1, companion: -1, rsvp: -1, notes: -1 };
  const width = Math.max(0, ...rows.map((r) => r.length));
  if (hasHeader && rows[0]) {
    const used = new Set<number>();
    (Object.keys(PATTERNS) as FieldKey[]).forEach((field) => {
      const idx = rows[0].findIndex((h, i) => !used.has(i) && PATTERNS[field].test(normalizeName(h)));
      if (idx >= 0) { mapping[field] = idx; used.add(idx); }
    });
    if (mapping.fullName < 0) {
      const idx = rows[0].findIndex((h, i) => !used.has(i) && /nome|name/.test(normalizeName(h)));
      if (idx >= 0) mapping.fullName = idx;
    }
  }
  if (mapping.fullName < 0 && width) {
    // Sem cabeçalho reconhecido: a coluna com mais textos "de nome" (letras, com espaço).
    const body = hasHeader ? rows.slice(1) : rows;
    let best = 0, bestScore = -1;
    for (let c = 0; c < width; c++) {
      const score = body.filter((r) => /^[\p{L}][\p{L} .'-]{2,}$/u.test(r[c] ?? '')).length;
      if (score > bestScore) { best = c; bestScore = score; }
    }
    mapping.fullName = best;
  }
  return mapping;
}

export interface PreviewRow {
  line: number; // número da linha na planilha (1-based)
  guest: Guest;
  issues: string[];
  duplicateOf?: string; // nome existente parecido
  include: boolean;
}

export interface ImportPreview {
  rows: PreviewRow[];
  emptyLines: number[];
  errorLines: Array<{ line: number; reason: string }>;
}

export function buildPreview(rows: string[][], mapping: ColumnMapping, hasHeader: boolean, existing: Guest[]): ImportPreview {
  const preview: ImportPreview = { rows: [], emptyLines: [], errorLines: [] };
  const start = hasHeader ? 1 : 0;
  const get = (r: string[], k: FieldKey) => (mapping[k] >= 0 ? cleanText(r[mapping[k]] ?? '') : '');
  const seenInFile: Guest[] = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const line = i + 1;
    if (r.every((c) => !cleanText(c))) { preview.emptyLines.push(line); continue; }
    const fullName = get(r, 'fullName');
    if (!fullName) { preview.errorLines.push({ line, reason: 'Linha sem nome — será ignorada.' }); continue; }
    if (fullName.length > 120) { preview.errorLines.push({ line, reason: 'Nome muito longo (mais de 120 caracteres).' }); continue; }
    const guest = createGuest({
      fullName,
      displayName: get(r, 'displayName'),
      group: get(r, 'group'),
      companion: get(r, 'companion'),
      notes: get(r, 'notes'),
      rsvp: parseRsvp(get(r, 'rsvp')),
    });
    const issues: string[] = [];
    const dupExisting = existing.find((g) => areNamesSimilar(g.fullName, fullName));
    const dupFile = seenInFile.find((g) => areNamesSimilar(g.fullName, fullName));
    let duplicateOf: string | undefined;
    if (dupExisting) {
      duplicateOf = dupExisting.fullName;
      issues.push(`Parecido com convidado já cadastrado: ${dupExisting.fullName}`);
    } else if (dupFile) {
      duplicateOf = dupFile.fullName;
      issues.push(`Repetido na planilha: ${dupFile.fullName}`);
    }
    seenInFile.push(guest);
    // Possíveis duplicatas vêm desmarcadas, mas podem ser incluídas (pessoas podem ter o mesmo nome).
    preview.rows.push({ line, guest, issues, duplicateOf, include: !duplicateOf });
  }
  return preview;
}
