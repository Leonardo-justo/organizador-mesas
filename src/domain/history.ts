import type { SeatingState } from './types';

/**
 * Histórico de desfazer/refazer com snapshots controlados.
 * O estado é imutável e as atualizações reaproveitam objetos não alterados
 * (compartilhamento estrutural): cada snapshot custa apenas os mapas que mudaram.
 * Limite de 150 passos.
 */
export interface HistoryEntry {
  state: SeatingState;
  label: string;
}

export interface History {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export const HISTORY_LIMIT = 150;

export const emptyHistory = (): History => ({ past: [], future: [] });

/** Registra o estado ANTERIOR a uma operação. */
export function record(h: History, previous: SeatingState, label: string): History {
  const past = [...h.past, { state: previous, label }];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, future: [] };
}

export function undo(h: History, current: SeatingState): { history: History; state: SeatingState; label: string } | null {
  const last = h.past[h.past.length - 1];
  if (!last) return null;
  return {
    history: { past: h.past.slice(0, -1), future: [{ state: current, label: last.label }, ...h.future] },
    state: last.state,
    label: last.label,
  };
}

export function redo(h: History, current: SeatingState): { history: History; state: SeatingState; label: string } | null {
  const next = h.future[0];
  if (!next) return null;
  return {
    history: { past: [...h.past, { state: current, label: next.label }], future: h.future.slice(1) },
    state: next.state,
    label: next.label,
  };
}
