import { describe, expect, it } from 'vitest';
import { createGuest } from '../../domain/guests';
import * as S from '../../domain/seating';
import { parseCsv, toCsv } from './csv';
import { exportCsv, exportRows } from './exportGuests';
import { buildPreview, detectHeader, detectMapping, readSpreadsheet } from './importGuests';

const CSV = '﻿Nome;Família;Presença;Observações\r\nJoão Pereira;Pereira;Sim;\r\nJosé Antônio;Pereira;não;"vegetariano; sem glúten"\r\n;;;\r\nConceição Lima;Lima;;\r\nAna Júlia Souza;Souza;Confirmado;\r\nana julia souza;Souza;;\r\n;Lima;Sim;\r\n';

describe('importação CSV', () => {
  it('lê CSV com acentos, BOM e separador ponto-e-vírgula', () => {
    const rows = parseCsv(CSV);
    expect(rows[1][0]).toBe('João Pereira');
    expect(rows[2][3]).toBe('vegetariano; sem glúten');
    expect(rows[4][0]).toBe('Conceição Lima');
  });
  it('detecta cabeçalho, colunas, linhas vazias, erros e duplicatas', () => {
    const rows = parseCsv(CSV);
    expect(detectHeader(rows)).toBe(true);
    const m = detectMapping(rows, true);
    expect(m.fullName).toBe(0);
    expect(m.group).toBe(1);
    expect(m.rsvp).toBe(2);
    expect(m.notes).toBe(3);
    const existing = [createGuest({ fullName: 'Jose Antonio' })];
    const p = buildPreview(rows, m, true, existing);
    expect(p.emptyLines).toEqual([4]);
    expect(p.errorLines.map((e) => e.line)).toEqual([8]);
    const names = p.rows.map((r) => r.guest.fullName);
    expect(names).toEqual(['João Pereira', 'José Antônio', 'Conceição Lima', 'Ana Júlia Souza', 'ana julia souza']);
    expect(p.rows[0].guest.rsvp).toBe('confirmado');
    expect(p.rows[1].guest.rsvp).toBe('recusado');
    expect(p.rows[1].duplicateOf).toBe('Jose Antonio');
    expect(p.rows[1].include).toBe(false);
    expect(p.rows[4].duplicateOf).toBe('Ana Júlia Souza');
    expect(p.rows.filter((r) => r.include)).toHaveLength(3);
  });
  it('lê arquivo .csv via File com UTF-8', async () => {
    const f = new File([CSV], 'convidados.csv', { type: 'text/csv' });
    const rows = await readSpreadsheet(f);
    expect(rows[3][0]).toBe('');
    expect(rows[4][0]).toBe('Conceição Lima');
  });
  it('lê planilha XLSX (exportada do Excel/Google Planilhas)', async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Convidado', 'Grupo'], ['Antônio Conceição', 'Noiva'], ['Ana Júlia', 'Noivo']]), 'Lista');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const rows = await readSpreadsheet(new File([buf], 'lista.xlsx'));
    expect(rows).toEqual([['Convidado', 'Grupo'], ['Antônio Conceição', 'Noiva'], ['Ana Júlia', 'Noivo']]);
    expect(detectMapping(rows, true).fullName).toBe(0);
  });
});

describe('exportação', () => {
  it('gera lista por mesa com 280 linhas e acentos preservados', () => {
    const g = createGuest({ fullName: 'Conceição Antônio', group: 'Família', rsvp: 'confirmado' });
    let s = { guests: { [g.id]: g }, assignments: {} };
    const r = S.placeGuest(s, g.id, { table: 5, seat: 3 }); if (!r.ok) throw new Error(); s = r.state;
    const rows = exportRows(s, 'por-mesa');
    expect(rows).toHaveLength(281);
    expect(rows.find((x) => x[0] === '5' && x[1] === '3')?.[2]).toBe('Conceição Antônio');
    const csv = exportCsv(s, 'por-mesa');
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('5;3;Conceição Antônio;Família;;Confirmado;');
    expect(exportRows(s, 'sem-lugar')).toHaveLength(1);
    expect(exportRows(s, 'alfabetica')[1]).toEqual(['Conceição Antônio', '5', '3', 'Família', 'Confirmado']);
  });
  it('escapa campos com separador e aspas', () => {
    expect(toCsv([['a;b', 'c"d']])).toBe('﻿"a;b";"c""d"\r\n');
  });
});

describe('ordem da planilha', () => {
  it('importação guarda a ordem das linhas', () => {
    const rows = parseCsv('Nome\nZélia\nAna\nMárcio\n');
    const p = buildPreview(rows, detectMapping(rows, true), true, []);
    const sorted = [...p.rows].map((r) => r.guest).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    expect(sorted.map((g) => g.fullName)).toEqual(['Zélia', 'Ana', 'Márcio']);
  });
});
