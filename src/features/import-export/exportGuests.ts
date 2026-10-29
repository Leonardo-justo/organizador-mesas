import { compareNames, label } from '../../domain/guests';
import { buildGuestSeatIndex, seatKey, seatNumbers, tableNumbers } from '../../domain/seating';
import { RSVP_LABEL, type SeatingState } from '../../domain/types';
import { toCsv } from './csv';

export type ExportKind = 'por-mesa' | 'alfabetica' | 'sem-lugar';

export const EXPORT_TITLES: Record<ExportKind, string> = {
  'por-mesa': 'Convidados por mesa',
  alfabetica: 'Lista alfabética',
  'sem-lugar': 'Convidados sem lugar',
};

export function exportRows(state: SeatingState, kind: ExportKind): string[][] {
  const idx = buildGuestSeatIndex(state.assignments);
  const guests = Object.values(state.guests);
  if (kind === 'por-mesa') {
    const rows: string[][] = [['Mesa', 'Assento', 'Convidado', 'Família/Grupo', 'Acompanhante', 'Presença', 'Observações']];
    for (const t of tableNumbers()) {
      for (const s of seatNumbers(t)) {
        const g = state.guests[state.assignments[seatKey(t, s)] ?? ''];
        rows.push([String(t), String(s), g ? g.fullName : '(livre)', g?.group ?? '', g?.companion ?? '', g ? RSVP_LABEL[g.rsvp] : '', g?.notes ?? '']);
      }
    }
    return rows;
  }
  if (kind === 'alfabetica') {
    const rows: string[][] = [['Convidado', 'Mesa', 'Assento', 'Família/Grupo', 'Presença']];
    guests
      .sort((a, b) => compareNames(a.fullName, b.fullName))
      .forEach((g) => {
        const s = idx.get(g.id);
        rows.push([g.fullName, s ? String(s.table) : 'Sem lugar', s ? String(s.seat) : '', g.group ?? '', RSVP_LABEL[g.rsvp]]);
      });
    return rows;
  }
  const rows: string[][] = [['Convidado', 'Nome de exibição', 'Família/Grupo', 'Acompanhante', 'Presença', 'Observações']];
  guests
    .filter((g) => !idx.has(g.id))
    .sort((a, b) => compareNames(a.fullName, b.fullName))
    .forEach((g) => rows.push([g.fullName, label(g) !== g.fullName ? label(g) : '', g.group ?? '', g.companion ?? '', RSVP_LABEL[g.rsvp], g.notes ?? '']));
  return rows;
}

export function exportCsv(state: SeatingState, kind: ExportKind): string {
  return toCsv(exportRows(state, kind));
}

export async function exportXlsxBlob(state: SeatingState): Promise<Blob> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  (['por-mesa', 'alfabetica', 'sem-lugar'] as ExportKind[]).forEach((k) => {
    const ws = XLSX.utils.aoa_to_sheet(exportRows(state, k));
    ws['!cols'] = exportRows(state, k)[0].map((h) => ({ wch: Math.max(10, h.length + 4, h === 'Convidado' ? 32 : 0) }));
    XLSX.utils.book_append_sheet(wb, ws, EXPORT_TITLES[k].slice(0, 31));
  });
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function dateStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}h${p(d.getMinutes())}`;
}
