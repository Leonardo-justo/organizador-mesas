import { beforeEach, describe, expect, it } from 'vitest';
import { defaultTables } from '../../data/floorplan';
import { createGuest } from '../../domain/guests';
import * as S from '../../domain/seating';
import { _resetConnectionForTests, clearData, loadData, saveData } from '../../services/db';
import { defaultPrefs } from '../../state/store';
import { createBackup, parseBackup, type AppSnapshot } from './backup';

function sample(): AppSnapshot {
  const a = createGuest({ fullName: 'João', rsvp: 'confirmado' });
  const b = createGuest({ fullName: 'Ana Júlia' });
  let seating = { guests: { [a.id]: a, [b.id]: b }, assignments: {} };
  const r = S.placeGuest(seating, a.id, { table: 12, seat: 8 }); if (!r.ok) throw new Error(); seating = r.state;
  const tables = defaultTables();
  tables[0] = { ...tables[0], x: 0.5, y: 0.5, seatRotation: 36 };
  return { seating, layout: { tables, version: 3 }, prefs: { ...defaultPrefs(), mode: '3d' } };
}

describe('backup', () => {
  it('cria e restaura backup completo', () => {
    const snap = sample();
    const json = JSON.stringify(createBackup(snap));
    const parsed = JSON.parse(json);
    expect(parsed.versao).toBe(1);
    expect(parsed.mesas).toHaveLength(29);
    expect(parsed.mesas[0].lugares).toBe(10);
    expect(parsed.versaoMesas).toBe(3);
    const r = parseBackup(json, defaultPrefs());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.snapshot.seating).toEqual(snap.seating);
      expect(r.snapshot.layout.tables[0]).toEqual({ number: 1, shape: 'round', x: 0.5, y: 0.5, seatRotation: 36, seats: 10, group: 'R' });
      expect(r.snapshot.prefs.mode).toBe('3d');
    }
  });
  it('aceita backup antigo (28 mesas de 10 lugares)', () => {
    const b = createBackup(sample());
    b.mesas = b.mesas.filter((m) => m.number <= 28).map((m) => ({ ...m, lugares: 10, seats: undefined as unknown as number }));
    b.distribuicao = [{ mesa: 3, lugar: 10, convidadoId: b.convidados[0].id }];
    const r = parseBackup(JSON.stringify(b), defaultPrefs());
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.snapshot.layout.tables).toHaveLength(28); expect(r.snapshot.layout.tables[0].seats).toBe(10); }
  });
  it('rejeita arquivos inválidos sem retornar dados', () => {
    expect(parseBackup('not json', defaultPrefs()).ok).toBe(false);
    expect(parseBackup('{"formato":"outro"}', defaultPrefs()).ok).toBe(false);
    const bad = createBackup(sample());
    bad.distribuicao.push({ mesa: 12, lugar: 8, convidadoId: bad.convidados[1].id });
    expect(parseBackup(JSON.stringify(bad), defaultPrefs()).ok).toBe(false);
    const bad2 = createBackup(sample());
    bad2.mesas = [...bad2.mesas, bad2.mesas[0]]; // mesa repetida
    expect(parseBackup(JSON.stringify(bad2), defaultPrefs()).ok).toBe(false);
    const bad3 = createBackup(sample());
    bad3.versao = 99;
    expect(parseBackup(JSON.stringify(bad3), defaultPrefs()).ok).toBe(false);
  });
});

describe('persistência IndexedDB', () => {
  beforeEach(async () => { await clearData(); });
  it('salva e recupera após "recarregar" (nova conexão)', async () => {
    const snap = sample();
    const at = await saveData(snap);
    expect(typeof at).toBe('string');
    _resetConnectionForTests();
    const loaded = await loadData();
    expect(loaded?.seating).toEqual(snap.seating);
    expect(loaded?.savedAt).toBe(at);
  });
  it('persiste coordenadas calibradas do mapa', async () => {
    const snap = sample();
    snap.layout.tables[5] = { ...snap.layout.tables[5], x: 0.123, y: 0.456 };
    await saveData(snap);
    _resetConnectionForTests();
    const loaded = await loadData();
    expect(loaded?.layout.tables[5]).toMatchObject({ number: 6, x: 0.123, y: 0.456 });
    expect(loaded?.layout.tables[0].seatRotation).toBe(36);
  });
});

import { renumberTable, spreadTables } from '../../domain/layout';
describe('trocar o número da mesa', () => {
  it('muda o número e os convidados acompanham a mesa', () => {
    const t = defaultTables();
    const r = renumberTable(t, { '16-1': 'a', '16-2': 'b', '3-1': 'c' }, 16, 40);
    if (!r.ok) throw new Error(r.reason);
    expect(r.swapped).toBe(false);
    expect(r.tables.find((x) => x.number === 40)?.x).toBe(t.find((x) => x.number === 16)?.x);
    expect(r.tables.some((x) => x.number === 16)).toBe(false);
    expect(r.assignments).toEqual({ '40-1': 'a', '40-2': 'b', '3-1': 'c' });
    // o espaçamento visual segue a mesa física (bloco esquerdo), não o número
    const before = spreadTables(t, 1.22).find((x) => x.number === 16)!;
    const after = spreadTables(r.tables, 1.22).find((x) => x.number === 40)!;
    expect(after.x).toBeCloseTo(before.x, 6);
  });
  it('se o número já existe, as duas mesas trocam de número', () => {
    const r = renumberTable(defaultTables(), { '1-1': 'a', '2-5': 'b' }, 1, 2);
    if (!r.ok) throw new Error(r.reason);
    expect(r.swapped).toBe(true);
    expect(r.assignments).toEqual({ '2-1': 'a', '1-5': 'b' });
    expect(r.tables.map((x) => x.number)).toEqual(Array.from({ length: 29 }, (_, i) => i + 1));
  });
  it('recusa números inválidos', () => {
    expect(renumberTable(defaultTables(), {}, 1, 0).ok).toBe(false);
    expect(renumberTable(defaultTables(), {}, 1, 1).ok).toBe(false);
    expect(renumberTable(defaultTables(), {}, 99, 5).ok).toBe(false);
  });
});
