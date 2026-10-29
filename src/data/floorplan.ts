import type { TableDef } from '../domain/types';

/**
 * Dados da planta original (public/planta.png, 1013 × 631 px).
 *
 * Os centros das mesas foram medidos na própria imagem: para cada mesa redonda,
 * calculou-se o centróide do anel de cadeiras (pixels escuros a 14–30 px do centro),
 * de forma iterativa; para as mesas retangulares 11 e 25, o centro do retângulo.
 * As coordenadas são normalizadas (0–1) em relação à largura e à altura da imagem,
 * então continuam corretas em qualquer resolução. Use "Ajustar mapa" para refinar.
 */
export const PLAN_WIDTH = 1013;
export const PLAN_HEIGHT = 631;
export const PLAN_ASPECT = PLAN_WIDTH / PLAN_HEIGHT;

export const TABLE_COUNT = 28;
export const SEATS_PER_TABLE = 10;
export const TOTAL_CAPACITY = TABLE_COUNT * SEATS_PER_TABLE;

const RAW: Array<[number, number, number, 'round' | 'rect']> = [
  [1, 702.0, 231.4, 'round'],
  [2, 643.9, 233.6, 'round'],
  [3, 581.9, 233.7, 'round'],
  [4, 583.8, 291.5, 'round'],
  [5, 641.1, 291.7, 'round'],
  [6, 703.2, 290.4, 'round'],
  [7, 698.9, 412.0, 'round'],
  [8, 696.8, 478.7, 'round'],
  [9, 638.2, 409.7, 'round'],
  [10, 639.0, 476.3, 'round'],
  [11, 572.5, 413.5, 'rect'],
  [12, 576.9, 476.6, 'round'],
  [13, 310.1, 229.8, 'round'],
  [14, 252.7, 230.0, 'round'],
  [15, 196.0, 229.7, 'round'],
  [16, 139.8, 229.8, 'round'],
  [17, 309.7, 287.6, 'round'],
  [18, 253.3, 287.3, 'round'],
  [19, 196.2, 287.4, 'round'],
  [20, 139.5, 287.1, 'round'],
  [21, 309.6, 353.5, 'round'],
  [22, 253.3, 353.3, 'round'],
  [23, 196.3, 353.5, 'round'],
  [24, 132.7, 353.9, 'round'],
  [25, 308.0, 414.5, 'rect'],
  [26, 250.8, 415.4, 'round'],
  [27, 193.3, 415.5, 'round'],
  [28, 132.5, 411.2, 'round'],
];

const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function defaultTables(): TableDef[] {
  return RAW.map(([number, px, py, shape]) => ({
    number,
    shape,
    x: round4(px / PLAN_WIDTH),
    y: round4(py / PLAN_HEIGHT),
    seatRotation: 0,
  }));
}

/** Raio visual (em px da planta) usado para desenhar marcadores e cadeiras. */
export const ROUND_TABLE_RADIUS = 17;
export const SEAT_RING_RADIUS = 25;
export const RECT_TABLE_W = 44;
export const RECT_TABLE_H = 22;

/**
 * Elementos fixos da planta (em px da imagem original), usados no modelo 3D.
 * Medidos sobre a imagem; não fazem parte da área editável.
 */
export interface PlanBox {
  id: string;
  label: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  height: number; // metros (esquemático)
  color: string;
  kind: 'block' | 'floor' | 'zone';
  rounded?: boolean;
}

export const PLAN_ELEMENTS: PlanBox[] = [
  { id: 'pista', label: 'Pista 8 m × 6 m', x0: 378, y0: 382, x1: 512, y1: 493, height: 0.06, color: '#2f2a26', kind: 'floor' },
  { id: 'bar', label: 'Bar', x0: 379, y0: 287, x1: 513, y1: 367, height: 1.1, color: '#c8b48a', kind: 'block', rounded: true },
  { id: 'palco', label: 'Palco', x0: 374, y0: 500, x1: 523, y1: 600, height: 0.6, color: '#8a7d6c', kind: 'block' },
  { id: 'buffet1', label: 'Buffet', x0: 385, y0: 202, x1: 515, y1: 229, height: 0.9, color: '#e9dfc9', kind: 'block' },
  { id: 'buffet2', label: 'Buffet', x0: 593, y0: 525, x1: 723, y1: 551, height: 0.9, color: '#e9dfc9', kind: 'block' },
  { id: 'bolo', label: 'Bolo e doces', x0: 735, y0: 315, x1: 907, y1: 430, height: 0.02, color: '#f3e6e0', kind: 'zone' },
  { id: 'kids', label: 'Espaço kids', x0: 596, y0: 117, x1: 768, y1: 178, height: 0.02, color: '#e3ece0', kind: 'zone' },
  { id: 'lounge', label: 'Lounge', x0: 138, y0: 450, x1: 345, y1: 540, height: 0.02, color: '#ece4d4', kind: 'zone' },
  { id: 'pergolado', label: 'Pergolado', x0: 172, y0: 0, x1: 272, y1: 100, height: 0.02, color: '#e8e2d2', kind: 'zone' },
  { id: 'escada', label: 'Acesso', x0: 935, y0: 300, x1: 1013, y1: 440, height: 0.02, color: '#ddd6c8', kind: 'zone' },
];

/** Fechamentos laterais (linhas grossas pretas da planta), como segmentos em px. */
export const PLAN_WALLS: Array<[number, number, number, number]> = [
  [533, 179, 778, 179],
  [778, 179, 778, 300],
  [778, 300, 935, 300],
  [835, 440, 935, 440],
  [835, 440, 835, 578],
  [525, 578, 835, 578],
  [596, 117, 596, 179],
  [768, 117, 768, 179],
];

/** Contorno fino do salão (linha cinza) — usado como limite do piso no 3D. */
export const HALL_OUTLINE = { x0: 50, y0: 177, x1: 955, y1: 617 };

/** Escala estimada a partir da pista (8 m ≈ 134 px). O modelo 3D é esquemático. */
export const PX_PER_METER = 134 / 8;
