/** Identificadores de arrastar-e-soltar. A lógica de cada soltura vive em App.handleDragEnd. */
export const dragGuestId = (guestId: string, origin: 'lista' | 'assento') => `convidado:${origin}:${guestId}`;
export const dropSeatId = (table: number, seat: number) => `assento:${table}-${seat}`;
export const dropTableId = (table: number) => `mesa:${table}`;
export const DROP_UNASSIGN = 'devolver-lista';

export interface DragData { guestId: string; origin: 'lista' | 'assento' }

export type DropTarget =
  | { kind: 'seat'; table: number; seat: number }
  | { kind: 'table'; table: number }
  | { kind: 'unassign' };

export function parseDrop(id: string | number | undefined | null): DropTarget | null {
  if (typeof id !== 'string') return null;
  if (id === DROP_UNASSIGN) return { kind: 'unassign' };
  let m = /^assento:(\d+)-(\d+)$/.exec(id);
  if (m) return { kind: 'seat', table: Number(m[1]), seat: Number(m[2]) };
  m = /^mesa:(\d+)$/.exec(id);
  if (m) return { kind: 'table', table: Number(m[1]) };
  return null;
}
