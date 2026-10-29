import { create } from 'zustand';

export type Dialog =
  | { type: 'guest-form'; guestId?: string; presetSeat?: { table: number; seat: number } }
  | { type: 'confirm'; title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; secondaryLabel?: string; onSecondary?: () => void }
  | { type: 'import' }
  | { type: 'export' }
  | { type: 'backup' }
  | { type: 'help' }
  | { type: 'picker'; table: number; seat: number }
  | { type: 'print'; onlyTable?: number }
  | { type: 'guest-details'; guestId: string }
  | { type: 'plan' }
  | { type: 'swap-table'; table: number };

interface UiState {
  dialog: Dialog | null;
  open: (d: Dialog) => void;
  close: () => void;
}

export const useUi = create<UiState>((set) => ({
  dialog: null,
  open: (d) => set({ dialog: d }),
  close: () => set({ dialog: null }),
}));

export const confirmAction = (d: Omit<Extract<Dialog, { type: 'confirm' }>, 'type'>) => useUi.getState().open({ type: 'confirm', ...d });
