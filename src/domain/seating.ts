/**
 * Regras de negócio da distribuição. Funções puras: recebem um estado e devolvem
 * um novo estado válido OU um erro explicando o motivo. Nenhuma operação altera
 * o estado de entrada, então uma falha nunca deixa os dados pela metade.
 */
import { SEATS_PER_TABLE, TABLE_COUNT, TOTAL_CAPACITY } from '../data/floorplan';
import type { Assignments, Guest, SeatRef, SeatingState } from './types';

export type OpResult =
  | { ok: true; state: SeatingState; message?: string }
  | { ok: false; code: OpErrorCode; reason: string; occupantId?: string };

export type OpErrorCode =
  | 'guest-not-found'
  | 'invalid-seat'
  | 'occupied'
  | 'table-full'
  | 'not-enough-seats'
  | 'same-seat'
  | 'not-seated'
  | 'invariant';

export const seatKey = (table: number, seat: number) => `${table}-${seat}`;

export function parseSeatKey(key: string): SeatRef | null {
  const m = /^(\d+)-(\d+)$/.exec(key);
  if (!m) return null;
  const table = Number(m[1]);
  const seat = Number(m[2]);
  return isValidSeat(table, seat) ? { table, seat } : null;
}

export function isValidSeat(table: number, seat: number): boolean {
  return (
    Number.isInteger(table) && Number.isInteger(seat) &&
    table >= 1 && table <= TABLE_COUNT && seat >= 1 && seat <= SEATS_PER_TABLE
  );
}

export function tableNumbers(): number[] {
  return Array.from({ length: TABLE_COUNT }, (_, i) => i + 1);
}

export function seatNumbers(): number[] {
  return Array.from({ length: SEATS_PER_TABLE }, (_, i) => i + 1);
}

export function allSeatKeys(): string[] {
  return tableNumbers().flatMap((t) => seatNumbers().map((s) => seatKey(t, s)));
}

/** Índice reverso convidado -> assento. */
export function buildGuestSeatIndex(assignments: Assignments): Map<string, SeatRef> {
  const idx = new Map<string, SeatRef>();
  for (const [key, guestId] of Object.entries(assignments)) {
    const ref = parseSeatKey(key);
    if (ref) idx.set(guestId, ref);
  }
  return idx;
}

export function seatOf(state: SeatingState, guestId: string): SeatRef | null {
  for (const [key, gid] of Object.entries(state.assignments)) {
    if (gid === guestId) return parseSeatKey(key);
  }
  return null;
}

export function occupantOf(state: SeatingState, ref: SeatRef): string | undefined {
  return state.assignments[seatKey(ref.table, ref.seat)];
}

export function tableOccupancy(assignments: Assignments, table: number): number {
  let n = 0;
  for (let s = 1; s <= SEATS_PER_TABLE; s++) if (assignments[seatKey(table, s)]) n++;
  return n;
}

export function freeSeats(assignments: Assignments, table: number): number[] {
  return seatNumbers().filter((s) => !assignments[seatKey(table, s)]);
}

/**
 * Validação central das invariantes. Retorna a lista de violações (vazia = válido).
 */
export function validateState(state: SeatingState): string[] {
  const errors: string[] = [];
  const seen = new Map<string, string>();
  for (const [key, guestId] of Object.entries(state.assignments)) {
    if (!parseSeatKey(key)) errors.push(`Assento inexistente: ${key}`);
    if (!state.guests[guestId]) errors.push(`Assento ${key} aponta para convidado inexistente`);
    const prev = seen.get(guestId);
    if (prev) errors.push(`Convidado em dois assentos (${prev} e ${key})`);
    seen.set(guestId, key);
  }
  for (const [id, g] of Object.entries(state.guests)) {
    if (g.id !== id) errors.push(`Identificador inconsistente para ${g.fullName}`);
    if (!g.fullName || !g.fullName.trim()) errors.push(`Convidado ${id} sem nome`);
  }
  if (Object.keys(state.assignments).length > TOTAL_CAPACITY) errors.push('Capacidade total excedida');
  return errors;
}

function commit(state: SeatingState, message?: string): OpResult {
  const errors = validateState(state);
  if (errors.length) {
    return { ok: false, code: 'invariant', reason: `Operação cancelada para manter os dados íntegros: ${errors[0]}` };
  }
  return { ok: true, state, message };
}

const nameOf = (state: SeatingState, id: string) => {
  const g = state.guests[id];
  return g ? g.displayName?.trim() || g.fullName : 'Convidado';
};

function withoutGuest(assignments: Assignments, guestId: string): Assignments {
  const next: Assignments = {};
  for (const [k, v] of Object.entries(assignments)) if (v !== guestId) next[k] = v;
  return next;
}

/**
 * Coloca um convidado em um assento. Se ele já estiver sentado, é movido.
 * Assento ocupado por outra pessoa => erro 'occupied' (quem chama decide trocar ou substituir).
 */
export function placeGuest(state: SeatingState, guestId: string, target: SeatRef): OpResult {
  if (!state.guests[guestId]) return { ok: false, code: 'guest-not-found', reason: 'Convidado não encontrado.' };
  if (!isValidSeat(target.table, target.seat)) return { ok: false, code: 'invalid-seat', reason: 'Assento inválido.' };
  const key = seatKey(target.table, target.seat);
  const occupant = state.assignments[key];
  if (occupant === guestId) return { ok: false, code: 'same-seat', reason: 'O convidado já está neste lugar.' };
  if (occupant) {
    return {
      ok: false,
      code: 'occupied',
      occupantId: occupant,
      reason: `O lugar ${target.seat} da mesa ${target.table} está ocupado por ${nameOf(state, occupant)}.`,
    };
  }
  const assignments = withoutGuest(state.assignments, guestId);
  assignments[key] = guestId;
  return commit(
    { ...state, assignments },
    `${nameOf(state, guestId)} → mesa ${target.table}, lugar ${target.seat}`,
  );
}

/** Troca dois convidados de lugar. Funciona também se só um deles estiver sentado. */
export function swapGuests(state: SeatingState, a: string, b: string): OpResult {
  if (!state.guests[a] || !state.guests[b]) return { ok: false, code: 'guest-not-found', reason: 'Convidado não encontrado.' };
  if (a === b) return { ok: false, code: 'same-seat', reason: 'Selecione duas pessoas diferentes.' };
  const sa = seatOf(state, a);
  const sb = seatOf(state, b);
  if (!sa && !sb) return { ok: false, code: 'not-seated', reason: 'Nenhuma das duas pessoas está sentada.' };
  const assignments = withoutGuest(withoutGuest(state.assignments, a), b);
  if (sa) assignments[seatKey(sa.table, sa.seat)] = b;
  if (sb) assignments[seatKey(sb.table, sb.seat)] = a;
  return commit({ ...state, assignments }, `${nameOf(state, a)} e ${nameOf(state, b)} trocaram de lugar`);
}

/**
 * Coloca o convidado no assento; se ocupado:
 *  - convidado já sentado => troca automática;
 *  - convidado sem lugar => erro 'occupied' (pede confirmação).
 */
export function moveOrSwap(state: SeatingState, guestId: string, target: SeatRef): OpResult {
  const r = placeGuest(state, guestId, target);
  if (r.ok || r.code !== 'occupied' || !r.occupantId) return r;
  if (seatOf(state, guestId)) return swapGuests(state, guestId, r.occupantId);
  return r;
}

/** Coloca o convidado no assento e devolve o ocupante anterior para a lista (nunca o exclui). */
export function replaceOccupant(state: SeatingState, guestId: string, target: SeatRef): OpResult {
  if (!state.guests[guestId]) return { ok: false, code: 'guest-not-found', reason: 'Convidado não encontrado.' };
  if (!isValidSeat(target.table, target.seat)) return { ok: false, code: 'invalid-seat', reason: 'Assento inválido.' };
  const key = seatKey(target.table, target.seat);
  const occupant = state.assignments[key];
  const assignments = withoutGuest(state.assignments, guestId);
  delete assignments[key];
  assignments[key] = guestId;
  const msg = occupant && occupant !== guestId
    ? `${nameOf(state, guestId)} ocupou o lugar; ${nameOf(state, occupant)} voltou para a lista`
    : undefined;
  return commit({ ...state, assignments }, msg);
}

export function unassign(state: SeatingState, guestId: string): OpResult {
  if (!seatOf(state, guestId)) return { ok: false, code: 'not-seated', reason: 'Este convidado não está em nenhuma mesa.' };
  return commit(
    { ...state, assignments: withoutGuest(state.assignments, guestId) },
    `${nameOf(state, guestId)} voltou para a lista de convidados`,
  );
}

export function unassignMany(state: SeatingState, guestIds: string[]): OpResult {
  const set = new Set(guestIds);
  const assignments: Assignments = {};
  let removed = 0;
  for (const [k, v] of Object.entries(state.assignments)) {
    if (set.has(v)) removed++;
    else assignments[k] = v;
  }
  if (!removed) return { ok: false, code: 'not-seated', reason: 'Nenhum dos selecionados está sentado.' };
  return commit({ ...state, assignments }, `${removed} convidado(s) voltaram para a lista`);
}

/** Coloca no primeiro lugar livre da mesa. */
export function placeInTable(state: SeatingState, guestId: string, table: number): OpResult {
  const current = seatOf(state, guestId);
  if (current?.table === table) return { ok: false, code: 'same-seat', reason: `Já está na mesa ${table}.` };
  const free = freeSeats(state.assignments, table);
  if (!free.length) {
    return { ok: false, code: 'table-full', reason: `A mesa ${table} está completa (10 de 10). Abra a mesa para trocar alguém de lugar.` };
  }
  return placeGuest(state, guestId, { table, seat: free[0] });
}

/** Distribuição em lote: tudo ou nada. */
export function placeManyInTable(state: SeatingState, guestIds: string[], table: number): OpResult {
  const unique = Array.from(new Set(guestIds)).filter((id) => seatOf(state, id)?.table !== table);
  if (!unique.length) return { ok: false, code: 'same-seat', reason: `Os selecionados já estão na mesa ${table}.` };
  const free = freeSeats(state.assignments, table);
  if (free.length < unique.length) {
    return {
      ok: false,
      code: 'not-enough-seats',
      reason: `A mesa ${table} tem ${free.length} lugar(es) livre(s), mas ${unique.length} pessoa(s) foram selecionadas. Nada foi alterado.`,
    };
  }
  let assignments = { ...state.assignments };
  unique.forEach((id, i) => {
    assignments = withoutGuest(assignments, id);
    assignments[seatKey(table, free[i])] = id;
  });
  return commit({ ...state, assignments }, `${unique.length} convidado(s) distribuídos na mesa ${table}`);
}

export function addGuest(state: SeatingState, guest: Guest): OpResult {
  if (!guest.fullName.trim()) return { ok: false, code: 'invariant', reason: 'O nome completo é obrigatório.' };
  if (state.guests[guest.id]) return { ok: false, code: 'invariant', reason: 'Identificador duplicado.' };
  return commit({ ...state, guests: { ...state.guests, [guest.id]: guest } }, `${guest.fullName} adicionado(a)`);
}

export function addGuests(state: SeatingState, guests: Guest[]): OpResult {
  const map = { ...state.guests };
  for (const g of guests) {
    if (map[g.id]) return { ok: false, code: 'invariant', reason: 'Identificador duplicado na importação.' };
    map[g.id] = g;
  }
  return commit({ ...state, guests: map }, `${guests.length} convidado(s) adicionados`);
}

export function updateGuest(state: SeatingState, guest: Guest): OpResult {
  if (!state.guests[guest.id]) return { ok: false, code: 'guest-not-found', reason: 'Convidado não encontrado.' };
  if (!guest.fullName.trim()) return { ok: false, code: 'invariant', reason: 'O nome completo é obrigatório.' };
  return commit({ ...state, guests: { ...state.guests, [guest.id]: guest } }, 'Cadastro atualizado');
}

/** Exclui o cadastro e libera o assento, se houver. */
export function deleteGuests(state: SeatingState, ids: string[]): OpResult {
  const set = new Set(ids);
  const guests = { ...state.guests };
  for (const id of set) delete guests[id];
  const assignments: Assignments = {};
  for (const [k, v] of Object.entries(state.assignments)) if (!set.has(v)) assignments[k] = v;
  return commit({ guests, assignments }, `${set.size} cadastro(s) excluído(s)`);
}

export interface Stats {
  totalGuests: number;
  confirmed: number;
  pending: number;
  declined: number;
  seated: number;
  unseated: number;
  occupiedSeats: number;
  freeSeats: number;
  emptyTables: number;
  partialTables: number;
  fullTables: number;
}

export function computeStats(state: SeatingState): Stats {
  const guests = Object.values(state.guests);
  const occupiedSeats = Object.keys(state.assignments).length;
  let emptyTables = 0, partialTables = 0, fullTables = 0;
  for (const t of tableNumbers()) {
    const n = tableOccupancy(state.assignments, t);
    if (n === 0) emptyTables++;
    else if (n === SEATS_PER_TABLE) fullTables++;
    else partialTables++;
  }
  return {
    totalGuests: guests.length,
    confirmed: guests.filter((g) => g.rsvp === 'confirmado').length,
    pending: guests.filter((g) => g.rsvp === 'pendente').length,
    declined: guests.filter((g) => g.rsvp === 'recusado').length,
    seated: occupiedSeats,
    unseated: guests.length - occupiedSeats,
    occupiedSeats,
    freeSeats: TOTAL_CAPACITY - occupiedSeats,
    emptyTables,
    partialTables,
    fullTables,
  };
}

export type TableStatus = 'vazia' | 'parcial' | 'completa';
export function tableStatus(assignments: Assignments, table: number): TableStatus {
  const n = tableOccupancy(assignments, table);
  return n === 0 ? 'vazia' : n === SEATS_PER_TABLE ? 'completa' : 'parcial';
}

/**
 * Troca todos os convidados entre duas mesas, lugar por lugar (1↔1, 2↔2…).
 * Se a mesa de destino estiver vazia, o grupo inteiro simplesmente muda de mesa.
 */
export function swapTables(state: SeatingState, a: number, b: number): OpResult {
  if (a === b) return { ok: false, code: 'same-seat', reason: 'Escolha uma mesa diferente.' };
  if (!isValidSeat(a, 1) || !isValidSeat(b, 1)) return { ok: false, code: 'invalid-seat', reason: 'Mesa inválida.' };
  const na = tableOccupancy(state.assignments, a);
  const nb = tableOccupancy(state.assignments, b);
  if (!na && !nb) return { ok: false, code: 'not-seated', reason: `As mesas ${a} e ${b} estão vazias.` };
  const assignments: Assignments = { ...state.assignments };
  for (let s = 1; s <= SEATS_PER_TABLE; s++) {
    const ka = seatKey(a, s), kb = seatKey(b, s);
    const ga = state.assignments[ka], gb = state.assignments[kb];
    delete assignments[ka];
    delete assignments[kb];
    if (ga) assignments[kb] = ga;
    if (gb) assignments[ka] = gb;
  }
  const msg = nb
    ? `Mesas ${a} e ${b} trocaram os convidados (${na} ↔ ${nb})`
    : `${na} convidado(s) da mesa ${a} foram para a mesa ${b}`;
  return commit({ ...state, assignments }, msg);
}

/** Próximo lugar livre a partir de uma mesa (segue para as mesas seguintes; volta ao início). */
export function nextFreeSeat(assignments: Assignments, fromTable: number): SeatRef | null {
  for (let k = 0; k < TABLE_COUNT; k++) {
    const t = ((fromTable - 1 + k) % TABLE_COUNT) + 1;
    const free = freeSeats(assignments, t);
    if (free.length) return { table: t, seat: free[0] };
  }
  return null;
}

/**
 * Distribuição em sequência: coloca cada convidado (na ordem dada) no próximo lugar
 * livre, começando na mesa indicada e passando para a seguinte quando lotar.
 * Quem já está sentado é ignorado. Quem não couber continua na lista.
 */
export function placeSequential(state: SeatingState, guestIds: string[], startTable = 1): OpResult & { placed?: number; left?: number } {
  const assignments: Assignments = { ...state.assignments };
  const seated = new Set(Object.values(assignments));
  let table = startTable, placed = 0, left = 0;
  for (const id of guestIds) {
    if (!state.guests[id] || seated.has(id)) continue;
    const ref = nextFreeSeat(assignments, table);
    if (!ref) { left++; continue; }
    assignments[seatKey(ref.table, ref.seat)] = id;
    seated.add(id);
    table = ref.table;
    placed++;
  }
  if (!placed) return { ok: false, code: left ? 'not-enough-seats' : 'same-seat', reason: left ? 'Não há lugares livres.' : 'Ninguém para distribuir (todos já estão sentados).' };
  const r = commit({ ...state, assignments }, `${placed} convidado(s) colocados em sequência${left ? `; ${left} ficaram sem lugar (salão cheio)` : ''}`);
  return r.ok ? { ...r, placed, left } : r;
}

/** Tira todos das mesas (os cadastros continuam na lista). */
export function unassignAll(state: SeatingState): OpResult {
  const n = Object.keys(state.assignments).length;
  if (!n) return { ok: false, code: 'not-seated', reason: 'Ninguém está sentado.' };
  return commit({ ...state, assignments: {} }, `${n} convidado(s) voltaram para a lista`);
}
