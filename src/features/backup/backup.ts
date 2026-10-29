import { SEATS_PER_TABLE } from '../../data/floorplan';
import { parseSeatKey, seatKey, validateState } from '../../domain/seating';
import { validateTables } from '../../domain/layout';
import type { Guest, Layout, SeatingState, TableDef, ViewPrefs } from '../../domain/types';

export const BACKUP_FORMAT = 'organizador-mesas-casamento';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  formato: typeof BACKUP_FORMAT;
  versao: number;
  exportadoEm: string;
  convidados: Guest[];
  mesas: Array<TableDef & { lugares: number }>;
  distribuicao: Array<{ mesa: number; lugar: number; convidadoId: string }>;
  preferencias: ViewPrefs;
  plantaPersonalizada?: string;
}

export interface AppSnapshot {
  seating: SeatingState;
  layout: Layout;
  prefs: ViewPrefs;
}

export function createBackup(snap: AppSnapshot, now = new Date()): BackupFile {
  return {
    formato: BACKUP_FORMAT,
    versao: BACKUP_VERSION,
    exportadoEm: now.toISOString(),
    convidados: Object.values(snap.seating.guests),
    mesas: snap.layout.tables.map((t) => ({ ...t, lugares: SEATS_PER_TABLE })),
    distribuicao: Object.entries(snap.seating.assignments)
      .map(([k, convidadoId]) => {
        const r = parseSeatKey(k)!;
        return { mesa: r.table, lugar: r.seat, convidadoId };
      })
      .sort((a, b) => a.mesa - b.mesa || a.lugar - b.lugar),
    preferencias: snap.prefs,
    plantaPersonalizada: snap.layout.customPlan,
  };
}

export type RestoreResult = { ok: true; snapshot: AppSnapshot; summary: string } | { ok: false; errors: string[] };

const RSVPS = new Set(['pendente', 'confirmado', 'recusado']);

/** Valida TODO o arquivo antes de devolver qualquer dado. Nada é aplicado se houver erro. */
export function parseBackup(text: string, fallbackPrefs: ViewPrefs): RestoreResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['O arquivo não é um JSON válido.'] };
  }
  const b = data as Partial<BackupFile>;
  if (!b || typeof b !== 'object' || b.formato !== BACKUP_FORMAT) {
    return { ok: false, errors: ['Este arquivo não é um backup do Organizador de Mesas.'] };
  }
  if (typeof b.versao !== 'number' || b.versao > BACKUP_VERSION) {
    return { ok: false, errors: [`Versão de backup incompatível (${String(b.versao)}). Atualize a aplicação.`] };
  }
  const errors: string[] = [];
  if (!Array.isArray(b.convidados)) errors.push('Lista de convidados ausente.');
  if (!Array.isArray(b.distribuicao)) errors.push('Distribuição ausente.');
  errors.push(...validateTables(b.mesas).map((e) => `Mesas: ${e}`));
  if (errors.length) return { ok: false, errors };

  const guests: Record<string, Guest> = {};
  for (const g of b.convidados as Guest[]) {
    if (!g || typeof g.id !== 'string' || typeof g.fullName !== 'string' || !g.fullName.trim()) {
      errors.push('Há convidados sem identificador ou sem nome.');
      break;
    }
    if (guests[g.id]) { errors.push(`Identificador repetido: ${g.id}`); break; }
    guests[g.id] = {
      id: g.id,
      fullName: g.fullName,
      displayName: g.displayName || undefined,
      group: g.group || undefined,
      companion: g.companion || undefined,
      notes: g.notes || undefined,
      rsvp: RSVPS.has(g.rsvp) ? g.rsvp : 'pendente',
      createdAt: g.createdAt || new Date().toISOString(),
    };
  }
  const assignments: Record<string, string> = {};
  for (const d of b.distribuicao as BackupFile['distribuicao']) {
    const key = seatKey(Number(d?.mesa), Number(d?.lugar));
    if (!parseSeatKey(key)) { errors.push(`Assento inválido: mesa ${d?.mesa}, lugar ${d?.lugar}`); continue; }
    if (assignments[key]) errors.push(`Assento ${key} aparece duas vezes.`);
    assignments[key] = d.convidadoId;
  }
  if (errors.length) return { ok: false, errors };
  const seating: SeatingState = { guests, assignments };
  const inv = validateState(seating);
  if (inv.length) return { ok: false, errors: inv };

  const tables = (b.mesas as BackupFile['mesas'])
    .map(({ number, shape, x, y, seatRotation }) => ({ number, shape, x, y, seatRotation: Number(seatRotation) || 0 }))
    .sort((a, c) => a.number - c.number);
  const prefs: ViewPrefs = { ...fallbackPrefs, ...(b.preferencias ?? {}) };
  return {
    ok: true,
    snapshot: { seating, layout: { tables, customPlan: b.plantaPersonalizada || undefined }, prefs },
    summary: `${Object.keys(guests).length} convidados e ${Object.keys(assignments).length} lugares ocupados`,
  };
}
