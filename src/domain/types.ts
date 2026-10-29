/** Modelo de dados central. Nenhum componente visual define regras: elas vivem em domain/. */

export type Rsvp = 'pendente' | 'confirmado' | 'recusado';

export interface Guest {
  id: string;
  fullName: string;
  displayName?: string;
  group?: string; // família ou grupo
  companion?: string; // acompanhante / vínculo
  notes?: string;
  rsvp: Rsvp;
  createdAt: string;
}

export type TableShape = 'round' | 'rect';

export interface TableDef {
  number: number; // 1..28
  shape: TableShape;
  /** Centro normalizado (0..1) em relação à largura/altura da imagem da planta. */
  x: number;
  y: number;
  /** Rotação (graus) da numeração das cadeiras. Não altera a posição da mesa. */
  seatRotation: number;
}

/** Identificador de assento: "<mesa>-<lugar>", ex.: "12-3". */
export type SeatId = `${number}-${number}`;

/** Distribuição: assento -> convidado. Somente assentos ocupados aparecem. */
export type Assignments = Record<string, string>;

export interface SeatingState {
  guests: Record<string, Guest>;
  assignments: Assignments;
}

export interface ViewPrefs {
  mode: '2d' | '3d';
  zoom: number;
  /** Fator de espaçamento visual das mesas no mapa 2D (1 = como na planta). */
  spacing: number;
  showNamesOnPrint: boolean;
  paper: 'A4' | 'A3';
  tipsDismissed: string[];
}

export interface Layout {
  tables: TableDef[];
  /** Imagem de planta personalizada (data URL). Vazio = planta original do projeto. */
  customPlan?: string;
}

export interface SeatRef {
  table: number;
  seat: number;
}

export const RSVP_LABEL: Record<Rsvp, string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  recusado: 'Não comparecerá',
};
