import { beforeEach, describe, expect, it } from 'vitest';
import { defaultTables } from '../../data/floorplan';
import * as S from '../../domain/seating';
import type { SeatingState } from '../../domain/types';
import { applyImport } from './applyImport';
import { ceremonialEntries, ceremonialHtml } from './ceremonialPage';
import { buildPreview, detectMapping, parseSheetText, type FieldKey } from './importGuests';
import { googleCsvUrls, parseGoogleSheetUrl, sourceSheetRows, type SourceSheet } from './sourceSheet';
import { createBackup, parseBackup } from '../backup/backup';
import { defaultPrefs } from '../../state/store';

beforeEach(() => S.setTableSpec(defaultTables()));

const mappedOf = (m: Record<FieldKey, number>) => new Set((Object.keys(m) as FieldKey[]).filter((k) => m[k] >= 0));

function importText(state: SeatingState, text: string, mode: 'atualizar' | 'adicionar' | 'substituir', seat: 'planilha' | 'sequencia' | 'lista') {
  const { rows, preamble } = parseSheetText(text);
  const m = detectMapping(rows, true);
  const p = buildPreview(rows, m, true, mode === 'adicionar' ? Object.values(state.guests) : []);
  const r = applyImport(state, p.rows.filter((x) => x.include), mode, seat, mappedOf(m));
  if (!r.ok) throw new Error(r.reason);
  return { ...r.outcome, rows, preamble, mapping: m };
}

describe('importar nova lista sem perder a distribuição', () => {
  it('atualiza dados, mantém lugares, adiciona novos e coloca só quem estava sem mesa', () => {
    const v1 = 'Lista do casamento\nNome;Presença;Mesa\nJoão Pereira;Confirmado;3\nMaria Souza;Confirmado;3\nAna Lima;A confirmar;\n';
    const first = importText({ guests: {}, assignments: {} }, v1, 'substituir', 'planilha');
    expect(first.preamble).toEqual([['Lista do casamento']]);
    expect(first.added).toBe(3);
    expect(first.placed).toBe(2);
    // usuário muda João de mesa à mão
    const joao = Object.values(first.state.guests).find((g) => g.fullName === 'João Pereira')!;
    const moved = S.placeInTable(first.state, joao.id, 7);
    expect(moved.ok).toBe(true);
    const s1 = (moved as { state: SeatingState }).state;

    const v2 = 'Nome;Presença;Mesa\njoao pereira;Confirmado;3\nMaria Souza;Confirmado;3\nAna Lima;Confirmado;5\nCarlos Novo;Confirmado;5\n';
    const out = importText(s1, v2, 'atualizar', 'planilha');
    expect(out.updated).toBe(3);
    expect(out.added).toBe(1);
    expect(Object.keys(out.state.guests)).toHaveLength(4);
    const idx = S.buildGuestSeatIndex(out.state.assignments);
    expect(idx.get(joao.id)?.table).toBe(7); // não voltou para a 3
    const ana = Object.values(out.state.guests).find((g) => g.fullName === 'Ana Lima')!;
    expect(ana.rsvp).toBe('confirmado');
    expect(idx.get(ana.id)?.table).toBe(5);
    expect(out.placed).toBe(2);
    expect(S.validateState(out.state)).toEqual([]);
  });

  it('quem está no organizador e sumiu da planilha continua (contado em notInSheet)', () => {
    const a = importText({ guests: {}, assignments: {} }, 'Nome\nA Um\nB Dois\n', 'substituir', 'lista');
    const b = importText(a.state, 'Nome\nA Um\n', 'atualizar', 'lista');
    expect(Object.keys(b.state.guests)).toHaveLength(2);
    expect(b.notInSheet).toBe(1);
  });
});

describe('exportar a planilha como entrou', () => {
  it('mantém título, colunas e ordem, preenchendo a coluna Mesa', () => {
    const text = 'Lista\nNome;Telefone;Mesa\nJoão;111;9\nMaria;222;\n';
    const r = importText({ guests: {}, assignments: {} }, text, 'substituir', 'planilha');
    const sheet: SourceSheet = {
      fileName: 'lista.xlsx', importedAt: '', preamble: r.preamble, rows: r.rows, hasHeader: true, mapping: r.mapping,
      rowGuest: Object.fromEntries([...r.rowGuest].map(([line, id]) => [line - 1, id])),
    };
    const maria = Object.values(r.state.guests).find((g) => g.fullName === 'Maria')!;
    const st = (S.placeInTable(r.state, maria.id, 2) as { state: SeatingState }).state;
    const out = sourceSheetRows(sheet, st);
    expect(out[0]).toEqual(['Lista']);
    expect(out[1]).toEqual(['Nome', 'Telefone', 'Mesa']);
    expect(out[2]).toEqual(['João', '111', 9]);
    expect(out[3]).toEqual(['Maria', '222', 2]);
  });

  it('acrescenta a coluna Mesa quando a planilha não tinha', () => {
    const r = importText({ guests: {}, assignments: {} }, 'Nome;Presença\nJoão;Sim\n', 'substituir', 'sequencia');
    const sheet: SourceSheet = { fileName: 'x.csv', importedAt: '', preamble: [], rows: r.rows, hasHeader: true, mapping: r.mapping, rowGuest: { 1: [...r.rowGuest.values()][0] } };
    const out = sourceSheetRows(sheet, r.state);
    expect(out[0]).toEqual(['Nome', 'Presença', 'Mesa']);
    expect(out[1][2]).toBe(1);
  });

  it('o backup guarda a planilha original', () => {
    const r = importText({ guests: {}, assignments: {} }, 'Nome\nJoão\n', 'substituir', 'lista');
    const sheet: SourceSheet = { fileName: 'x.csv', importedAt: '', preamble: [], rows: r.rows, hasHeader: true, mapping: r.mapping, rowGuest: {} };
    const b = createBackup({ seating: r.state, layout: { tables: defaultTables() }, prefs: defaultPrefs(), sourceSheet: sheet });
    const back = parseBackup(JSON.stringify(b), defaultPrefs());
    expect(back.ok && back.snapshot.sourceSheet?.fileName).toBe('x.csv');
  });
});

describe('Google Planilhas', () => {
  it('reconhece links de compartilhamento', () => {
    expect(parseGoogleSheetUrl('https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=123')).toEqual({ id: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms', gid: '123' });
    expect(parseGoogleSheetUrl('https://docs.google.com/spreadsheets/u/0/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?usp=sharing')?.gid).toBe('0');
    expect(parseGoogleSheetUrl('https://example.com/planilha')).toBeNull();
    expect(googleCsvUrls('abc', '0')[0]).toContain('format=csv');
  });
});

describe('página do cerimonialista', () => {
  it('lista só nome, mesa e lugar, em ordem alfabética, sem telefone', () => {
    const r = importText({ guests: {}, assignments: {} }, 'Nome;Telefone;Mesa\nZé <b>;999;2\nÁlvaro;888;1\nSem Mesa;777;\n', 'substituir', 'planilha');
    const e = ceremonialEntries(r.state, false);
    expect(e.map((x) => x.n)).toEqual(['Álvaro', 'Zé <b>']);
    expect(e[0]).toMatchObject({ m: 1, l: 1 });
    expect(ceremonialEntries(r.state, true)).toHaveLength(3);
    const html = ceremonialHtml(r.state, 'Casamento');
    expect(html).not.toContain('999');
    expect(html).not.toContain('Zé <b>');
    expect(html).toContain('Álvaro');
  });
});
