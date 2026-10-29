import { create } from 'zustand';
import { defaultTables } from '../data/floorplan';
import { emptyHistory, record, redo as hRedo, undo as hUndo, type History } from '../domain/history';
import { SPACING_ON, sanitizeTables } from '../domain/layout';
import * as S from '../domain/seating';
import type { Guest, Layout, SeatRef, SeatingState, TableDef, ViewPrefs } from '../domain/types';
import type { AppSnapshot } from '../features/backup/backup';

export type SaveStatus = 'carregando' | 'pendente' | 'salvando' | 'salvo' | 'erro';
export type TableFilter = 'todas' | S.TableStatus;

export interface Toast {
  id: number;
  kind: 'ok' | 'erro' | 'info';
  text: string;
  undoable?: boolean;
}

export interface PendingReplace {
  guestId: string;
  ref: SeatRef;
  occupantId: string;
}

export const defaultPrefs = (): ViewPrefs => ({
  mode: '2d',
  zoom: 1,
  spacing: SPACING_ON,
  showNamesOnPrint: true,
  paper: 'A3',
  tipsDismissed: [],
});

export interface AppState {
  loaded: boolean;
  seating: SeatingState;
  history: History;
  layout: Layout;
  prefs: ViewPrefs;

  selectedTable: number | null;
  highlightGuestId: string | null;
  pickedGuestId: string | null;
  calibrating: boolean;
  calibrationDraft: TableDef[] | null;
  tableFilter: TableFilter;
  familyHighlight: string | null;
  sidebarOpen: boolean;
  focusRequest: number; // incrementa para pedir centralização da mesa selecionada
  pendingReplace: PendingReplace | null;
  /** Convidado solto em mesa lotada: usuário escolhe quem sai. */
  pendingFull: { guestId: string; table: number } | null;
  toasts: Toast[];

  saveStatus: SaveStatus;
  lastSavedAt: string | null;
  saveError: string | null;

  // ---- ações ----
  hydrate: (snap: Partial<AppSnapshot> | null, savedAt?: string | null) => void;
  snapshot: () => AppSnapshot;
  replaceAll: (snap: AppSnapshot, label: string) => void;
  apply: (r: S.OpResult, label: string) => boolean;
  dropGuestOnSeat: (guestId: string, ref: SeatRef) => boolean;
  dropGuestOnTable: (guestId: string, table: number) => boolean;
  confirmReplace: () => void;
  cancelReplace: () => void;
  resolveFull: (occupantId: string, mode: 'trocar' | 'tirar') => void;
  cancelFull: () => void;
  unassignGuest: (guestId: string) => void;
  pickGuest: (guestId: string | null) => void;
  seatPicked: (ref: SeatRef) => void;
  undo: () => void;
  redo: () => void;

  selectTable: (n: number | null, focus?: boolean) => void;
  locateGuest: (guestId: string) => void;
  setTableFilter: (f: TableFilter) => void;
  setFamilyHighlight: (f: string | null) => void;
  setSidebarOpen: (v: boolean) => void;
  setPrefs: (p: Partial<ViewPrefs>) => void;
  dismissTip: (id: string) => void;

  startCalibration: () => void;
  moveDraftTable: (n: number, x: number, y: number) => void;
  rotateDraftSeats: (n: number, delta: number) => void;
  resetDraftToOriginal: () => void;
  finishCalibration: (save: boolean) => void;
  setCustomPlan: (dataUrl: string | undefined) => void;

  toast: (kind: Toast['kind'], text: string, undoable?: boolean) => void;
  dismissToast: (id: number) => void;
  setSaveState: (s: SaveStatus, at?: string | null, err?: string | null) => void;
}

let toastSeq = 1;

export const useApp = create<AppState>((set, get) => ({
  loaded: false,
  seating: { guests: {}, assignments: {} },
  history: emptyHistory(),
  layout: { tables: defaultTables() },
  prefs: defaultPrefs(),

  selectedTable: null,
  highlightGuestId: null,
  pickedGuestId: null,
  calibrating: false,
  calibrationDraft: null,
  tableFilter: 'todas',
  familyHighlight: null,
  sidebarOpen: false,
  focusRequest: 0,
  pendingReplace: null,
  pendingFull: null,
  toasts: [],

  saveStatus: 'carregando',
  lastSavedAt: null,
  saveError: null,

  hydrate: (snap, savedAt) => {
    const seating = snap?.seating ?? { guests: {}, assignments: {} };
    const valid = S.validateState(seating).length === 0;
    set({
      loaded: true,
      seating: valid ? seating : { guests: seating.guests ?? {}, assignments: {} },
      layout: { tables: sanitizeTables(snap?.layout?.tables), customPlan: snap?.layout?.customPlan },
      prefs: { ...defaultPrefs(), ...(snap?.prefs ?? {}) },
      history: emptyHistory(),
      saveStatus: savedAt ? 'salvo' : 'salvo',
      lastSavedAt: savedAt ?? null,
    });
    if (!valid) get().toast('erro', 'Os dados salvos tinham inconsistências na distribuição; os cadastros foram mantidos e os lugares foram liberados.');
  },

  snapshot: () => {
    const { seating, layout, prefs } = get();
    return { seating, layout, prefs };
  },

  replaceAll: (snap, label) => {
    const prev = get().seating;
    set((st) => ({
      seating: snap.seating,
      layout: snap.layout,
      prefs: snap.prefs,
      history: record(st.history, prev, label),
      selectedTable: null,
      highlightGuestId: null,
      pickedGuestId: null,
    }));
  },

  apply: (r, label) => {
    if (!r.ok) {
      get().toast('erro', r.reason);
      return false;
    }
    const prev = get().seating;
    set((st) => ({ seating: r.state, history: record(st.history, prev, label) }));
    if (r.message) get().toast('ok', r.message, true);
    return true;
  },

  dropGuestOnSeat: (guestId, ref) => {
    const st = get();
    const r = S.moveOrSwap(st.seating, guestId, ref);
    if (!r.ok && r.code === 'occupied' && r.occupantId) {
      set({ pendingReplace: { guestId, ref, occupantId: r.occupantId } });
      return false;
    }
    if (!r.ok && r.code === 'same-seat') return false;
    const ok = st.apply(r, 'Mover convidado');
    if (ok) set({ highlightGuestId: guestId, pickedGuestId: null });
    return ok;
  },

  dropGuestOnTable: (guestId, table) => {
    const st = get();
    const r = S.placeInTable(st.seating, guestId, table);
    if (!r.ok && r.code === 'table-full') {
      set({ pendingFull: { guestId, table }, selectedTable: table });
      return false;
    }
    const ok = st.apply(r, 'Mover convidado');
    if (ok) set({ highlightGuestId: guestId, pickedGuestId: null });
    return ok;
  },

  confirmReplace: () => {
    const p = get().pendingReplace;
    if (!p) return;
    set({ pendingReplace: null, pickedGuestId: null });
    get().apply(S.replaceOccupant(get().seating, p.guestId, p.ref), 'Substituir ocupante');
  },
  cancelReplace: () => set({ pendingReplace: null }),

  resolveFull: (occupantId, mode) => {
    const p = get().pendingFull;
    if (!p) return;
    const st = get();
    const seat = S.seatOf(st.seating, occupantId);
    set({ pendingFull: null, pickedGuestId: null });
    if (!seat || seat.table !== p.table) { st.toast('erro', 'Essa pessoa não está mais nesta mesa. Nada foi alterado.'); return; }
    const r = mode === 'trocar'
      ? S.swapGuests(st.seating, p.guestId, occupantId)
      : S.replaceOccupant(st.seating, p.guestId, seat);
    if (get().apply(r, mode === 'trocar' ? 'Trocar de lugar' : 'Substituir na mesa lotada')) set({ highlightGuestId: p.guestId });
  },
  cancelFull: () => set({ pendingFull: null }),

  unassignGuest: (guestId) => {
    get().apply(S.unassign(get().seating, guestId), 'Remover da mesa');
  },

  pickGuest: (guestId) => set({ pickedGuestId: guestId, highlightGuestId: guestId }),

  seatPicked: (ref) => {
    const id = get().pickedGuestId;
    if (!id) return;
    get().dropGuestOnSeat(id, ref);
  },

  undo: () => {
    const st = get();
    const r = hUndo(st.history, st.seating);
    if (!r) { st.toast('info', 'Nada para desfazer.'); return; }
    set({ history: r.history, seating: r.state, pendingReplace: null });
    st.toast('info', `Desfeito: ${r.label}`);
  },
  redo: () => {
    const st = get();
    const r = hRedo(st.history, st.seating);
    if (!r) { st.toast('info', 'Nada para refazer.'); return; }
    set({ history: r.history, seating: r.state });
    st.toast('info', `Refeito: ${r.label}`);
  },

  selectTable: (n, focus = false) =>
    set((st) => ({ selectedTable: n, focusRequest: focus ? st.focusRequest + 1 : st.focusRequest })),

  locateGuest: (guestId) => {
    const seat = S.seatOf(get().seating, guestId);
    set((st) => ({
      highlightGuestId: guestId,
      selectedTable: seat ? seat.table : st.selectedTable,
      focusRequest: seat ? st.focusRequest + 1 : st.focusRequest,
    }));
  },

  setTableFilter: (f) => set({ tableFilter: f }),
  setFamilyHighlight: (f) => set({ familyHighlight: f }),
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  setPrefs: (p) => set((st) => ({ prefs: { ...st.prefs, ...p } })),
  dismissTip: (id) => set((st) => ({ prefs: { ...st.prefs, tipsDismissed: Array.from(new Set([...st.prefs.tipsDismissed, id])) } })),

  startCalibration: () => set((st) => ({ calibrating: true, calibrationDraft: st.layout.tables.map((t) => ({ ...t })), pickedGuestId: null })),
  moveDraftTable: (n, x, y) =>
    set((st) => ({ calibrationDraft: st.calibrationDraft?.map((t) => (t.number === n ? { ...t, x, y } : t)) ?? null })),
  rotateDraftSeats: (n, delta) =>
    set((st) => ({
      calibrationDraft: st.calibrationDraft?.map((t) => (t.number === n ? { ...t, seatRotation: (((t.seatRotation + delta) % 360) + 360) % 360 } : t)) ?? null,
    })),
  resetDraftToOriginal: () => set({ calibrationDraft: defaultTables() }),
  finishCalibration: (save) => {
    const draft = get().calibrationDraft;
    if (save && draft) {
      set((st) => ({ layout: { ...st.layout, tables: sanitizeTables(draft) }, calibrating: false, calibrationDraft: null }));
      get().toast('ok', 'Posições das mesas salvas.');
    } else {
      set({ calibrating: false, calibrationDraft: null });
    }
  },
  setCustomPlan: (dataUrl) => set((st) => ({ layout: { ...st.layout, customPlan: dataUrl } })),

  toast: (kind, text, undoable) => {
    const id = toastSeq++;
    set((st) => ({ toasts: [...st.toasts.slice(-3), { id, kind, text, undoable }] }));
    setTimeout(() => get().dismissToast(id), kind === 'erro' ? 7000 : 4500);
  },
  dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),
  setSaveState: (s, at, err) =>
    set((st) => ({ saveStatus: s, lastSavedAt: at === undefined ? st.lastSavedAt : at, saveError: err === undefined ? st.saveError : err })),
}));

/** Helpers derivados (memo simples por referência). */
let idxCache: { a: SeatingState['assignments'] | null; idx: Map<string, SeatRef> } = { a: null, idx: new Map() };
export function useSeatIndex(): Map<string, SeatRef> {
  const a = useApp((s) => s.seating.assignments);
  if (idxCache.a !== a) idxCache = { a, idx: S.buildGuestSeatIndex(a) };
  return idxCache.idx;
}

export function guestById(id: string | null | undefined): Guest | undefined {
  return id ? useApp.getState().seating.guests[id] : undefined;
}
