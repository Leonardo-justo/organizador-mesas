import { describe, expect, it } from 'vitest';
import { createGuest } from './guests';
import { emptyHistory, record, redo, undo } from './history';
import * as S from './seating';

describe('desfazer e refazer', () => {
  it('desfaz e refaz uma movimentação e uma troca', () => {
    const a = createGuest({ fullName: 'Ana' });
    const b = createGuest({ fullName: 'Bia' });
    let state = { guests: { [a.id]: a, [b.id]: b }, assignments: {} };
    let h = emptyHistory();
    const step = (r: S.OpResult, label: string) => { if (!r.ok) throw new Error(r.reason); h = record(h, state, label); state = r.state; };
    step(S.placeGuest(state, a.id, { table: 1, seat: 1 }), 'mover');
    step(S.placeGuest(state, b.id, { table: 2, seat: 2 }), 'mover');
    step(S.swapGuests(state, a.id, b.id), 'troca');
    expect(state.assignments).toEqual({ '1-1': b.id, '2-2': a.id });
    let u = undo(h, state)!; h = u.history; state = u.state;
    expect(state.assignments).toEqual({ '1-1': a.id, '2-2': b.id });
    u = undo(h, state)!; h = u.history; state = u.state;
    expect(state.assignments).toEqual({ '1-1': a.id });
    const r = redo(h, state)!; h = r.history; state = r.state;
    expect(state.assignments).toEqual({ '1-1': a.id, '2-2': b.id });
    expect(S.validateState(state)).toEqual([]);
    expect(h.future).toHaveLength(1);
  });
  it('nova operação limpa o refazer', () => {
    const a = createGuest({ fullName: 'Ana' });
    const s0 = { guests: { [a.id]: a }, assignments: {} };
    let h = record(emptyHistory(), s0, 'x');
    h = undo(h, s0)!.history;
    expect(h.future).toHaveLength(1);
    h = record(h, s0, 'y');
    expect(h.future).toHaveLength(0);
  });
});
