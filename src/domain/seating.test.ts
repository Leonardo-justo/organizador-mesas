import { describe, expect, it } from 'vitest';
import { DEFAULT_SEATS, defaultTables } from '../data/floorplan';
import { createGuest } from './guests';
import * as S from './seating';
import type { SeatingState } from './types';

function stateWith(names: string[]): { state: SeatingState; ids: string[] } {
  const guests = names.map((n) => createGuest({ fullName: n }));
  return { state: { guests: Object.fromEntries(guests.map((g) => [g.id, g])), assignments: {} }, ids: guests.map((g) => g.id) };
}
const ok = (r: S.OpResult) => { if (!r.ok) throw new Error(r.reason); return r.state; };

describe('mesas e assentos', () => {
  it('layout padrão: 35 mesas numeradas de 1 a 35, dentro da planta', () => {
    const t = defaultTables();
    expect(t).toHaveLength(35);
    expect(S.tableNumbers()).toEqual(Array.from({ length: 35 }, (_, i) => i + 1));
    t.forEach((m) => { expect(m.x).toBeGreaterThan(0); expect(m.x).toBeLessThan(1); expect(m.y).toBeGreaterThan(0); expect(m.y).toBeLessThan(1); });
  });
  it('8 lugares por mesa e capacidade total de 280', () => {
    expect(DEFAULT_SEATS).toBe(8);
    expect(S.seatNumbers(1)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(S.allSeatKeys()).toHaveLength(280);
    expect(new Set(S.allSeatKeys()).size).toBe(280);
    expect(S.totalCapacity()).toBe(280);
  });
  it('3 mesas retangulares (11, 25 e 29) e 32 redondas', () => {
    const t = defaultTables();
    expect(t.filter((x) => x.shape === 'rect').map((x) => x.number)).toEqual([11, 25, 29]);
    expect(t.filter((x) => x.shape === 'round')).toHaveLength(32);
  });
  it('mesas com quantidades diferentes de lugares', () => {
    S.withTableSpec([{ number: 1, seats: 8 }, { number: 7, seats: 12 }], () => {
      expect(S.tableNumbers()).toEqual([1, 7]);
      expect(S.isValidSeat(7, 12)).toBe(true);
      expect(S.isValidSeat(1, 9)).toBe(false);
      expect(S.isValidSeat(2, 1)).toBe(false);
      expect(S.totalCapacity()).toBe(20);
    });
    expect(S.totalCapacity()).toBe(280);
  });
});

describe('distribuição', () => {
  it('aloca convidado em lugar vazio', () => {
    const { state, ids } = stateWith(['João da Silva']);
    const s = ok(S.placeGuest(state, ids[0], { table: 3, seat: 4 }));
    expect(s.assignments['3-4']).toBe(ids[0]);
    expect(S.computeStats(s).seated).toBe(1);
    expect(state.assignments).toEqual({}); // entrada intacta
  });
  it('não permite duas pessoas no mesmo assento', () => {
    const { state, ids } = stateWith(['Ana', 'Bia']);
    const s = ok(S.placeGuest(state, ids[0], { table: 1, seat: 1 }));
    const r = S.placeGuest(s, ids[1], { table: 1, seat: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.code).toBe('occupied'); expect(r.occupantId).toBe(ids[0]); }
  });
  it('não duplica convidado: mover para outro assento libera o anterior', () => {
    const { state, ids } = stateWith(['Ana']);
    let s = ok(S.placeGuest(state, ids[0], { table: 1, seat: 1 }));
    s = ok(S.placeGuest(s, ids[0], { table: 1, seat: 5 }));
    expect(Object.values(s.assignments).filter((v) => v === ids[0])).toHaveLength(1);
    expect(s.assignments['1-1']).toBeUndefined();
  });
  it('movimenta entre mesas', () => {
    const { state, ids } = stateWith(['Ana']);
    let s = ok(S.placeGuest(state, ids[0], { table: 1, seat: 1 }));
    s = ok(S.placeGuest(s, ids[0], { table: 20, seat: 7 }));
    expect(S.seatOf(s, ids[0])).toEqual({ table: 20, seat: 7 });
    expect(S.tableOccupancy(s.assignments, 1)).toBe(0);
  });
  it('troca dois convidados', () => {
    const { state, ids } = stateWith(['Ana', 'Bia']);
    let s = ok(S.placeGuest(state, ids[0], { table: 1, seat: 1 }));
    s = ok(S.placeGuest(s, ids[1], { table: 2, seat: 7 }));
    s = ok(S.swapGuests(s, ids[0], ids[1]));
    expect(s.assignments['1-1']).toBe(ids[1]);
    expect(s.assignments['2-7']).toBe(ids[0]);
  });
  it('moveOrSwap troca automaticamente quando a origem é um assento', () => {
    const { state, ids } = stateWith(['Ana', 'Bia']);
    let s = ok(S.placeGuest(state, ids[0], { table: 1, seat: 1 }));
    s = ok(S.placeGuest(s, ids[1], { table: 1, seat: 2 }));
    s = ok(S.moveOrSwap(s, ids[0], { table: 1, seat: 2 }));
    expect(s.assignments['1-2']).toBe(ids[0]);
    expect(s.assignments['1-1']).toBe(ids[1]);
  });
  it('moveOrSwap pede confirmação quando o convidado vem da lista', () => {
    const { state, ids } = stateWith(['Ana', 'Bia']);
    const s = ok(S.placeGuest(state, ids[0], { table: 1, seat: 1 }));
    const r = S.moveOrSwap(s, ids[1], { table: 1, seat: 1 });
    expect(r.ok).toBe(false);
    const s2 = ok(S.replaceOccupant(s, ids[1], { table: 1, seat: 1 }));
    expect(s2.assignments['1-1']).toBe(ids[1]);
    expect(s2.guests[ids[0]]).toBeDefined(); // ocupante anterior não foi excluído
    expect(S.seatOf(s2, ids[0])).toBeNull();
  });
  it('remove alocação sem excluir o convidado', () => {
    const { state, ids } = stateWith(['Ana']);
    let s = ok(S.placeGuest(state, ids[0], { table: 4, seat: 4 }));
    s = ok(S.unassign(s, ids[0]));
    expect(s.assignments).toEqual({});
    expect(s.guests[ids[0]].fullName).toBe('Ana');
  });
  it('excluir cadastro libera o assento', () => {
    const { state, ids } = stateWith(['Ana']);
    let s = ok(S.placeGuest(state, ids[0], { table: 4, seat: 4 }));
    s = ok(S.deleteGuests(s, [ids[0]]));
    expect(s.assignments).toEqual({});
    expect(s.guests).toEqual({});
  });
  it('mesa não ultrapassa 8 convidados', () => {
    const { state, ids } = stateWith(Array.from({ length: 9 }, (_, i) => `Pessoa ${i + 1}`));
    let s = state;
    for (let i = 0; i < 8; i++) s = ok(S.placeInTable(s, ids[i], 7));
    expect(S.tableStatus(s.assignments, 7)).toBe('completa');
    const r = S.placeInTable(s, ids[8], 7);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('table-full');
  });
  it('distribuição em lote é tudo ou nada', () => {
    const { state, ids } = stateWith(Array.from({ length: 10 }, (_, i) => `Pessoa ${i + 1}`));
    const r = S.placeManyInTable(state, ids, 2);
    expect(r.ok).toBe(false);
    const s = ok(S.placeManyInTable(state, ids.slice(0, 8), 2));
    expect(S.tableOccupancy(s.assignments, 2)).toBe(8);
  });
  it('rejeita assento inválido', () => {
    const { state, ids } = stateWith(['Ana']);
    expect(S.placeGuest(state, ids[0], { table: 36, seat: 1 }).ok).toBe(false);
    expect(S.placeGuest(state, ids[0], { table: 1, seat: 9 }).ok).toBe(false);
  });
  it('validateState detecta convidado em dois assentos', () => {
    const { state, ids } = stateWith(['Ana']);
    expect(S.validateState({ ...state, assignments: { '1-1': ids[0], '1-2': ids[0] } })).not.toHaveLength(0);
  });
  it('sequência rápida de operações mantém invariantes', () => {
    const { state, ids } = stateWith(Array.from({ length: 40 }, (_, i) => `Convidado ${i}`));
    let s = state;
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 9301 + 49297) % 233280; return Math.floor((seed / 233280) * n); };
    for (let k = 0; k < 2000; k++) {
      const g = ids[rnd(ids.length)];
      const ref = { table: 1 + rnd(4), seat: 1 + rnd(9) };
      const op = rnd(3);
      const r = op === 0 ? S.moveOrSwap(s, g, ref) : op === 1 ? S.replaceOccupant(s, g, ref) : S.unassign(s, g);
      if (r.ok) s = r.state;
      expect(S.validateState(s)).toEqual([]);
    }
    expect(Object.keys(s.guests)).toHaveLength(40);
  });
});

describe('trocar mesa inteira', () => {
  it('troca todos os convidados entre duas mesas mantendo os lugares', () => {
    const { state, ids } = stateWith(['A', 'B', 'C']);
    let s = ok(S.placeGuest(state, ids[0], { table: 1, seat: 1 }));
    s = ok(S.placeGuest(s, ids[1], { table: 1, seat: 7 }));
    s = ok(S.placeGuest(s, ids[2], { table: 9, seat: 3 }));
    s = ok(S.swapTables(s, 1, 9));
    expect(s.assignments).toEqual({ '9-1': ids[0], '9-7': ids[1], '1-3': ids[2] });
    expect(Object.keys(s.guests)).toHaveLength(3);
  });
  it('move o grupo para mesa vazia e recusa casos inválidos', () => {
    const { state, ids } = stateWith(['A']);
    const s = ok(S.placeGuest(state, ids[0], { table: 2, seat: 4 }));
    expect(ok(S.swapTables(s, 2, 20)).assignments).toEqual({ '20-4': ids[0] });
    expect(S.swapTables(s, 2, 2).ok).toBe(false);
    expect(S.swapTables(s, 5, 6).ok).toBe(false);
  });
});

describe('distribuição em sequência', () => {
  it('preenche na ordem, pula mesa lotada e respeita quem já está sentado', () => {
    const { state, ids } = stateWith(Array.from({ length: 12 }, (_, i) => `Pessoa ${i}`));
    let s = ok(S.placeGuest(state, ids[11], { table: 1, seat: 3 }));
    s = ok(S.placeSequential(s, ids, 1));
    expect(s.assignments['1-1']).toBe(ids[0]);
    expect(s.assignments['1-3']).toBe(ids[11]);
    expect(s.assignments['1-4']).toBe(ids[2]);
    expect(s.assignments['2-1']).toBe(ids[7]);
    expect(S.tableOccupancy(s.assignments, 2)).toBe(4);
  });
  it('começa na mesa escolhida e volta ao início depois da última', () => {
    const { state, ids } = stateWith(Array.from({ length: 10 }, (_, i) => `P ${i}`));
    const s = ok(S.placeSequential(state, ids, 35));
    expect(S.tableOccupancy(s.assignments, 35)).toBe(8);
    expect(S.tableOccupancy(s.assignments, 1)).toBe(2);
  });
  it('tirar todos das mesas mantém os cadastros', () => {
    const { state, ids } = stateWith(['A', 'B']);
    const s = ok(S.placeSequential(state, ids, 5));
    const u = ok(S.unassignAll(s));
    expect(u.assignments).toEqual({});
    expect(Object.keys(u.guests)).toHaveLength(2);
  });
});

describe('mudança de layout (28 × 10 → 35 × 8)', () => {
  const legacy = Array.from({ length: 28 }, (_, i) => ({ number: i + 1, seats: 10 }));
  function legacyState(n: number) {
    const { state, ids } = stateWith(Array.from({ length: n }, (_, i) => `C${i}`));
    const assignments: Record<string, string> = {};
    ids.forEach((id, i) => { assignments[`${Math.floor(i / 10) + 1}-${(i % 10) + 1}`] = id; });
    return { state: { ...state, assignments }, ids };
  }
  it('redistribuir mantém a ordem e não deixa ninguém sem lugar', () => {
    const { state, ids } = legacyState(263);
    S.withTableSpec(legacy, () => expect(S.validateState(state)).toEqual([]));
    const r = S.adaptSeatingToTables(state, defaultTables(), 'redistribuir');
    expect(r.moved).toBe(263);
    expect(r.unseated).toBe(0);
    expect(r.state.assignments['1-1']).toBe(ids[0]);
    expect(r.state.assignments['1-8']).toBe(ids[7]);
    expect(r.state.assignments['2-1']).toBe(ids[8]);
    expect(S.validateState(r.state)).toEqual([]);
  });
  it('manter devolve os lugares 9 e 10 para a lista sem excluir cadastros', () => {
    const { state, ids } = legacyState(20);
    const r = S.adaptSeatingToTables(state, defaultTables(), 'manter');
    expect(r.kept).toBe(16);
    expect(r.unseated).toBe(4);
    expect(r.state.assignments['1-1']).toBe(ids[0]);
    expect(r.state.assignments['1-9']).toBeUndefined();
    expect(Object.keys(r.state.guests)).toHaveLength(20);
  });
  it('trocar mesa inteira recusa quando a outra mesa tem menos lugares', () => {
    S.withTableSpec([{ number: 1, seats: 8 }, { number: 2, seats: 6 }], () => {
      const { state, ids } = stateWith(['A']);
      const s = { ...state, assignments: { '1-8': ids[0] } };
      expect(S.swapTables(s, 1, 2).ok).toBe(false);
    });
  });
});
