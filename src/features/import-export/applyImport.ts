/**
 * Aplica uma importação de planilha ao estado, sem tocar na interface.
 *
 * Modos:
 *  - 'atualizar'  : casa cada linha com o convidado de mesmo nome (ignorando acentos/caixa);
 *                   atualiza os dados dele SEM mexer no lugar; nomes novos entram na lista;
 *                   quem está no organizador e não aparece na planilha continua aqui.
 *  - 'adicionar'  : todas as linhas viram convidados novos.
 *  - 'substituir' : apaga cadastros e distribuição e importa do zero.
 * Mesas (seatMode):
 *  - 'planilha'  : quem ainda não tem lugar vai para a mesa indicada na coluna de mesa.
 *  - 'sequencia' : confirmados sem lugar entram em sequência a partir da mesa 1.
 *  - 'lista'     : ninguém é colocado.
 */
import { normalizeName } from '../../domain/guests';
import * as S from '../../domain/seating';
import type { Guest, SeatingState } from '../../domain/types';
import type { FieldKey, PreviewRow } from './importGuests';

export type ImportMode = 'atualizar' | 'adicionar' | 'substituir';
export type SeatMode = 'planilha' | 'sequencia' | 'lista';

export interface ImportOutcome {
  state: SeatingState;
  /** Linha da planilha -> convidado (para exportar a planilha como entrou). */
  rowGuest: Map<number, string>;
  added: number;
  updated: number;
  placed: number;
  notInSheet: number;
  declinedSeated: string[];
  issues: string[];
}

/**
 * Casa linhas da planilha com convidados existentes pelo nome.
 * Nomes repetidos: a 1ª ocorrência na planilha casa com o 1º cadastro (por ordem de cadastro), e assim por diante.
 */
export function matchRows(rows: PreviewRow[], existing: Guest[]): Map<number, string> {
  const pool = new Map<string, Guest[]>();
  [...existing].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach((g) => {
    const k = normalizeName(g.fullName);
    pool.set(k, [...(pool.get(k) ?? []), g]);
  });
  const out = new Map<number, string>();
  for (const r of rows) {
    const list = pool.get(normalizeName(r.guest.fullName));
    const g = list?.shift();
    if (g) out.set(r.line, g.id);
  }
  return out;
}

export function applyImport(
  state: SeatingState,
  rows: PreviewRow[],
  mode: ImportMode,
  seatMode: SeatMode,
  mapped: Set<FieldKey>,
): { ok: true; outcome: ImportOutcome } | { ok: false; reason: string } {
  const base: SeatingState = mode === 'substituir' ? { guests: {}, assignments: {} } : state;
  const matches = mode === 'atualizar' ? matchRows(rows, Object.values(base.guests)) : new Map<number, string>();
  const guests = { ...base.guests };
  const rowGuest = new Map<number, string>();
  let added = 0, updated = 0;

  for (const r of rows) {
    const id = matches.get(r.line);
    if (id) {
      const old = guests[id];
      // só sobrescreve os campos que a planilha tem
      const next: Guest = { ...old, fullName: r.guest.fullName };
      if (mapped.has('displayName')) next.displayName = r.guest.displayName;
      if (mapped.has('group')) next.group = r.guest.group;
      if (mapped.has('companion')) next.companion = r.guest.companion;
      if (mapped.has('rsvp')) next.rsvp = r.guest.rsvp;
      if (mapped.has('notes')) next.notes = r.guest.notes;
      guests[id] = next;
      rowGuest.set(r.line, id);
      updated++;
    } else {
      guests[r.guest.id] = r.guest;
      rowGuest.set(r.line, r.guest.id);
      added++;
    }
  }

  let next: SeatingState = { guests, assignments: { ...base.assignments } };
  const issues: string[] = [];
  let placed = 0;
  const seated = () => new Set(Object.values(next.assignments));

  if (seatMode === 'planilha') {
    const isSeated = seated();
    const items = rows
      .map((r) => ({ id: rowGuest.get(r.line)!, table: r.table ?? 0 }))
      .filter((x) => x.table > 0 && !isSeated.has(x.id) && guests[x.id].rsvp !== 'recusado');
    const res = S.placeByTable(next, items);
    if (!res.ok) return { ok: false, reason: res.reason };
    next = res.state;
    placed = items.length - res.issues.length;
    for (const i of res.issues) {
      issues.push(`${guests[i.id].fullName} (mesa ${i.table}: ${i.reason === 'mesa-lotada' ? 'lotada' : 'não existe'})`);
    }
  } else if (seatMode === 'sequencia') {
    const isSeated = seated();
    const ids = rows.map((r) => rowGuest.get(r.line)!).filter((id) => !isSeated.has(id) && guests[id].rsvp === 'confirmado');
    if (ids.length) {
      const res = S.placeSequential(next, ids, S.tableNumbers()[0] ?? 1);
      if (res.ok) { next = res.state; placed = res.placed ?? 0; }
    }
  }

  const errors = S.validateState(next);
  if (errors.length) return { ok: false, reason: `Importação cancelada para manter os dados íntegros: ${errors[0]}` };

  const inSheet = new Set(rowGuest.values());
  const notInSheet = mode === 'atualizar' ? Object.keys(base.guests).filter((id) => !inSheet.has(id)).length : 0;
  const seatedNow = seated();
  const declinedSeated = [...inSheet].filter((id) => seatedNow.has(id) && next.guests[id].rsvp === 'recusado').map((id) => next.guests[id].fullName);

  return { ok: true, outcome: { state: next, rowGuest, added, updated, placed, notInSheet, declinedSeated, issues } };
}
