import { describe, expect, it } from 'vitest';
import { SEATS_PER_TABLE, TABLE_COUNT, TOTAL_CAPACITY, defaultTables } from '../data/floorplan';
import { createGuest } from './guests';
import * as S from './seating';
import type { SeatingState } from './types';

function stateWith(names: string[]): { state: SeatingState; ids: string[] } {
  const guests = names.map((n) => createGuest({ fullName: n }));
  return { state: { guests: Object.fromEntries(guests.map((g) => [g.id, g])), assignments: {} }, ids: guests.map((g) => g.id) };
}
const ok = (r: S.OpResult) => { if (!r.ok) throw new Error(r.reason); return r.state; };

describe('mesas e assentos', () => {
  it('cria exatamente 28 mesas numeradas de 1 a 28', () => {
    const t = defaultTables();
    expect(t).toHaveLength(28);
    expect(TABLE_COUNT).toBe(28);
    expect(t.map((x) => x.number)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
    t.forEach((m) => { expect(m.x).toBeGreaterThan(0); expect(m.x).toBeLessThan(1); expect(m.y).toBeGreaterThan(0); expect(m.y).toBeLessThan(1); });
  });
  it('tem dez assentos por mesa e capacidade total de 280', () => {
    expect(SEATS_PER_TABLE).toBe(10);
    expect(S.seatNumbers()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(S.allSeatKeys()).toHaveLength(280);
    expect(new Set(S.allSeatKeys()).size).toBe(280);
    expect(TOTAL_CAPACITY).toBe(280);
  });
  it('mesas 11 e 25 são retangulares, as demais redondas', () => {
    const rect = defaultTables().filter((t) => t.shape === 'rect').map((t) => t.number);
    expect(rect).toEqual([11, 25]);
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
    s = ok(S.placeGuest(s, ids[1], { table: 2, seat: 9 }));
    s = ok(S.swapGuests(s, ids[0], ids[1]));
    expect(s.assignments['1-1']).toBe(ids[1]);
    expect(s.assignments['2-9']).toBe(ids[0]);
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
  it('mesa não ultrapassa 10 convidados', () => {
    const { state, ids } = stateWith(Array.from({ length: 11 }, (_, i) => `Pessoa ${i + 1}`));
    let s = state;
    for (let i = 0; i < 10; i++) s = ok(S.placeInTable(s, ids[i], 7));
    expect(S.tableStatus(s.assignments, 7)).toBe('completa');
    const r = S.placeInTable(s, ids[10], 7);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('table-full');
  });
  it('distribuição em lote é tudo ou nada', () => {
    const { state, ids } = stateWith(Array.from({ length: 12 }, (_, i) => `Pessoa ${i + 1}`));
    const r = S.placeManyInTable(state, ids, 2);
    expect(r.ok).toBe(false);
    const s = ok(S.placeManyInTable(state, ids.slice(0, 10), 2));
    expect(S.tableOccupancy(s.assignments, 2)).toBe(10);
  });
  it('rejeita assento inválido', () => {
    const { state, ids } = stateWith(['Ana']);
    expect(S.placeGuest(state, ids[0], { table: 29, seat: 1 }).ok).toBe(false);
    expect(S.placeGuest(state, ids[0], { table: 1, seat: 11 }).ok).toBe(false);
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
      const ref = { table: 1 + rnd(4), seat: 1 + rnd(10) };
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
    const { state, ids } = stateWith(Array.from({ length: 14 }, (_, i) => `Pessoa ${i}`));
    let s = ok(S.placeGuest(state, ids[13], { table: 1, seat: 3 }));
    const r = S.placeSequential(s, ids, 1);
    s = ok(r);
    expect(s.assignments['1-1']).toBe(ids[0]);
    expect(s.assignments['1-3']).toBe(ids[13]);
    expect(s.assignments['1-4']).toBe(ids[2]);
    expect(s.assignments['2-1']).toBe(ids[9]);
    expect(S.tableOccupancy(s.assignments, 2)).toBe(4);
  });
  it('começa na mesa escolhida e volta ao início quando chega na 28', () => {
    const { state, ids } = stateWith(Array.from({ length: 12 }, (_, i) => `P ${i}`));
    const s = ok(S.placeSequential(state, ids, 28));
    expect(S.tableOccupancy(s.assignments, 28)).toBe(10);
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
