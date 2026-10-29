import { SEATS_PER_TABLE, TABLE_COUNT, defaultTables } from '../data/floorplan';
import type { TableDef } from './types';

export function validateTables(tables: unknown): string[] {
  const errors: string[] = [];
  if (!Array.isArray(tables)) return ['Lista de mesas ausente'];
  if (tables.length !== TABLE_COUNT) errors.push(`Esperadas ${TABLE_COUNT} mesas, encontradas ${tables.length}`);
  const nums = new Set<number>();
  for (const t of tables as TableDef[]) {
    if (!t || typeof t !== 'object') { errors.push('Mesa inválida'); continue; }
    if (!Number.isInteger(t.number) || t.number < 1 || t.number > TABLE_COUNT) errors.push(`Número de mesa inválido: ${String(t.number)}`);
    if (nums.has(t.number)) errors.push(`Mesa ${t.number} repetida`);
    nums.add(t.number);
    if (typeof t.x !== 'number' || typeof t.y !== 'number' || t.x < 0 || t.x > 1 || t.y < 0 || t.y > 1) {
      errors.push(`Coordenadas inválidas na mesa ${t.number}`);
    }
    if (t.shape !== 'round' && t.shape !== 'rect') errors.push(`Formato inválido na mesa ${t.number}`);
  }
  return errors;
}

export function sanitizeTables(tables: TableDef[] | undefined): TableDef[] {
  if (!tables || validateTables(tables).length) return defaultTables();
  return [...tables]
    .map((t) => ({ ...t, seatRotation: Number.isFinite(t.seatRotation) ? t.seatRotation : 0 }))
    .sort((a, b) => a.number - b.number);
}

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Posição de cada cadeira em relação ao centro da mesa (unidades da planta, px).
 * Convenção documentada:
 *  - Mesa redonda: lugar 1 no topo (12 h) e numeração no sentido horário.
 *  - Mesa retangular: lugares 1–4 no lado de cima (esquerda → direita), 5 na cabeceira
 *    direita, 6–9 no lado de baixo (direita → esquerda) e 10 na cabeceira esquerda.
 *  - "seatRotation" gira apenas a numeração/cadeiras, nunca a posição da mesa.
 */
export function seatOffsets(shape: TableDef['shape'], rotationDeg: number, ringRadius: number, rectW: number, rectH: number) {
  const out: Array<{ seat: number; dx: number; dy: number }> = [];
  const rot = (rotationDeg * Math.PI) / 180;
  if (shape === 'round') {
    for (let i = 0; i < SEATS_PER_TABLE; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / SEATS_PER_TABLE + rot;
      out.push({ seat: i + 1, dx: Math.cos(a) * ringRadius, dy: Math.sin(a) * ringRadius });
    }
    return out;
  }
  const gap = 5;
  const step = rectW / 4;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 4; i++) pts.push([-rectW / 2 + step * (i + 0.5), -rectH / 2 - gap]);
  pts.push([rectW / 2 + gap, 0]);
  for (let i = 3; i >= 0; i--) pts.push([-rectW / 2 + step * (i + 0.5), rectH / 2 + gap]);
  pts.push([-rectW / 2 - gap, 0]);
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
const LEFT_BLOCK = (n: number) => n >= 13;

// Centros fixos dos dois blocos (da planta original): mover uma mesa não desloca as outras.
const ORIGINAL = defaultTables();
const centroidOf = (sel: TableDef[]) => ({
  x: sel.reduce((a, t) => a + t.x, 0) / sel.length,
  y: sel.reduce((a, t) => a + t.y, 0) / sel.length,
});
const CENTER_LEFT = centroidOf(ORIGINAL.filter((t) => LEFT_BLOCK(t.number)));
const CENTER_RIGHT = centroidOf(ORIGINAL.filter((t) => !LEFT_BLOCK(t.number)));
const centerFor = (n: number) => (LEFT_BLOCK(n) ? CENTER_LEFT : CENTER_RIGHT);

export function spreadPoint(n: number, x: number, y: number, factor: number) {
  const c = centerFor(n);
  return { x: clamp01(c.x + (x - c.x) * factor), y: clamp01(c.y + (y - c.y) * factor) };
}

/** Inverso de spreadPoint: posição desenhada -> posição real salva. */
export function unspreadPoint(n: number, x: number, y: number, factor: number) {
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
