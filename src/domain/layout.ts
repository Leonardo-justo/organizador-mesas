import { DEFAULT_SEATS, LAYOUT_VERSION, LEGACY_SEATS, MAX_SEATS_PER_TABLE, MAX_TABLES, defaultTables } from '../data/floorplan';
import type { TableDef } from './types';

export function validateTables(tables: unknown): string[] {
  const errors: string[] = [];
  if (!Array.isArray(tables)) return ['Lista de mesas ausente'];
  if (tables.length < 1 || tables.length > MAX_TABLES) errors.push(`Quantidade de mesas inválida: ${tables.length}`);
  const nums = new Set<number>();
  for (const t of tables as TableDef[]) {
    if (!t || typeof t !== 'object') { errors.push('Mesa inválida'); continue; }
    if (!Number.isInteger(t.number) || t.number < 1 || t.number > 999) errors.push(`Número de mesa inválido: ${String(t.number)}`);
    if (nums.has(t.number)) errors.push(`Mesa ${t.number} repetida`);
    nums.add(t.number);
    if (typeof t.x !== 'number' || typeof t.y !== 'number' || t.x < 0 || t.x > 1 || t.y < 0 || t.y > 1) {
      errors.push(`Coordenadas inválidas na mesa ${t.number}`);
    }
    if (t.shape !== 'round' && t.shape !== 'rect') errors.push(`Formato inválido na mesa ${t.number}`);
    if (t.seats !== undefined && (!Number.isInteger(t.seats) || t.seats < 1 || t.seats > MAX_SEATS_PER_TABLE)) {
      errors.push(`Quantidade de lugares inválida na mesa ${t.number}`);
    }
  }
  return errors;
}

/** Layout salvo numa versão anterior do padrão (precisa de conversão). */
export function needsLayoutUpgrade(layout: { tables?: unknown; version?: number } | undefined): boolean {
  return !!layout && Array.isArray(layout.tables) && layout.tables.length > 0 && (layout.version ?? 0) < LAYOUT_VERSION;
}

/** Normaliza: mesas sem "seats" recebem 10 (formato antigo). Layout inválido volta ao padrão. */
export function sanitizeTables(tables: TableDef[] | undefined): TableDef[] {
  if (!tables || validateTables(tables).length) return defaultTables();
  return [...tables]
    .map((t) => ({
      ...t,
      seatRotation: Number.isFinite(t.seatRotation) ? t.seatRotation : 0,
      seats: Number.isInteger(t.seats) ? t.seats : LEGACY_SEATS,
    }))
    .sort((a, b) => a.number - b.number);
}

/**
 * Converte um layout de versão anterior para o padrão atual (29 mesas de 10):
 * mantém posição, formato e rotação que o usuário já tinha nas mesas 1–29,
 * remove as mesas 30–35 do layout de 35 e preserva mesas criadas pelo usuário (36+).
 */
export function upgradeLayout(old: TableDef[]): TableDef[] {
  const byNum = new Map(old.map((t) => [t.number, t]));
  const base = defaultTables().map((d) => {
    const o = byNum.get(d.number);
    return o ? { ...d, x: o.x, y: o.y, seatRotation: o.seatRotation ?? 0, seats: DEFAULT_SEATS } : d;
  });
  const custom = old.filter((t) => t.number > 35).map((t) => ({ ...t, seats: Number.isInteger(t.seats) ? t.seats : DEFAULT_SEATS }));
  return [...base, ...custom].sort((a, b) => a.number - b.number);
}

export function newTable(tables: TableDef[], shape: TableDef['shape']): TableDef {
  const number = Math.max(0, ...tables.map((t) => t.number)) + 1;
  const k = tables.filter((t) => t.y < 0.2 && t.x < 0.2).length;
  return { number, shape, x: 0.06 + (k % 3) * 0.05, y: 0.08 + Math.floor(k / 3) * 0.08, seatRotation: 0, seats: DEFAULT_SEATS };
}

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Posição de cada cadeira em relação ao centro da mesa (unidades da planta, px).
 * Convenção documentada:
 *  - Mesa redonda: lugar 1 no topo (12 h) e numeração no sentido horário.
 *  - Mesa retangular: metade dos lugares (menos as cabeceiras) no lado de cima,
 *    da esquerda para a direita; um lugar na cabeceira direita; o restante embaixo,
 *    da direita para a esquerda; e o último na cabeceira esquerda.
 *    Com 10 lugares: 1–4 em cima, 5 à direita, 6–9 embaixo e 10 à esquerda.
 *  - "seatRotation" gira apenas a numeração/cadeiras, nunca a posição da mesa.
 */
export function seatOffsets(shape: TableDef['shape'], rotationDeg: number, ringRadius: number, rectW: number, rectH: number, count = DEFAULT_SEATS) {
  const out: Array<{ seat: number; dx: number; dy: number }> = [];
  const rot = (rotationDeg * Math.PI) / 180;
  if (shape === 'round') {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / count + rot;
      out.push({ seat: i + 1, dx: Math.cos(a) * ringRadius, dy: Math.sin(a) * ringRadius });
    }
    return out;
  }
  const gap = 5;
  const ends = count >= 4 ? 2 : 0;
  const top = Math.ceil((count - ends) / 2);
  const bottom = count - ends - top;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < top; i++) pts.push([-rectW / 2 + (rectW / top) * (i + 0.5), -rectH / 2 - gap]);
  if (ends) pts.push([rectW / 2 + gap, 0]);
  for (let i = bottom - 1; i >= 0; i--) pts.push([-rectW / 2 + (rectW / bottom) * (i + 0.5), rectH / 2 + gap]);
  if (ends) pts.push([-rectW / 2 - gap, 0]);
  const c = Math.cos(rot), s = Math.sin(rot);
  pts.forEach(([x, y], i) => out.push({ seat: i + 1, dx: x * c - y * s, dy: x * s + y * c }));
  return out;
}

/**
 * Espaçamento visual: afasta as mesas a partir do centro de cada bloco da planta
 * (bloco esquerdo 13–28, bloco direito 1–12). Só altera o DESENHO do mapa 2D;
 * as coordenadas salvas, o 3D e a impressão continuam fiéis à planta.
 */
export const SPACING_ON = 1.22;
const LEFT_BLOCK = (n: number) => n >= 13 && n <= 28;
const IN_BLOCK = (n: number) => n >= 1 && n <= 28;

// Centros fixos dos dois blocos (da planta original): mover uma mesa não desloca as outras.
const ORIGINAL = defaultTables().filter((t) => IN_BLOCK(t.number));
const centroidOf = (sel: TableDef[]) => ({
  x: sel.reduce((a, t) => a + t.x, 0) / sel.length,
  y: sel.reduce((a, t) => a + t.y, 0) / sel.length,
});
const CENTER_LEFT = centroidOf(ORIGINAL.filter((t) => LEFT_BLOCK(t.number)));
const CENTER_RIGHT = centroidOf(ORIGINAL.filter((t) => !LEFT_BLOCK(t.number)));
const centerFor = (n: number) => (LEFT_BLOCK(n) ? CENTER_LEFT : CENTER_RIGHT);

export function spreadPoint(n: number, x: number, y: number, factor: number) {
  if (!IN_BLOCK(n)) return { x, y }; // mesas novas não se afastam
  const c = centerFor(n);
  return { x: clamp01(c.x + (x - c.x) * factor), y: clamp01(c.y + (y - c.y) * factor) };
}

/** Inverso de spreadPoint: posição desenhada -> posição real salva. */
export function unspreadPoint(n: number, x: number, y: number, factor: number) {
  if (!IN_BLOCK(n)) return { x, y };
  const c = centerFor(n);
  return { x: clamp01(c.x + (x - c.x) / factor), y: clamp01(c.y + (y - c.y) / factor) };
}

export function spreadTables(tables: TableDef[], factor: number): TableDef[] {
  if (factor === 1) return tables;
  return tables.map((t) => ({ ...t, ...spreadPoint(t.number, t.x, t.y, factor) }));
}

/** Áreas da imagem com o desenho original das mesas, cobertas quando o mapa está espaçado (px da planta). */
export const TABLE_BLOCK_MASKS: Array<[number, number, number, number]> = [
  [100, 198, 347, 446],
  [545, 198, 735, 512],
];
