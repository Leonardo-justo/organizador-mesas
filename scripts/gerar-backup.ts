// Gera um backup do organizador a partir de uma lista JSON (ordem preservada).
// Coloca os confirmados em sequência: mesa 1 lugares 1–10, mesa 2, ...
import { readFileSync, writeFileSync } from 'node:fs';
import { LAYOUT_VERSION, defaultTables } from '../src/data/floorplan';
import { createGuest } from '../src/domain/guests';
import * as S from '../src/domain/seating';
import type { Rsvp, SeatingState } from '../src/domain/types';
import { createBackup } from '../src/features/backup/backup';
import { SPACING_ON } from '../src/domain/layout';

const [, , input, output] = process.argv;
const list = JSON.parse(readFileSync(input, 'utf-8')) as Array<{ fullName: string; rsvp: Rsvp; notes: string; table?: number | null }>;
const guests = list.map((g, i) => createGuest({ fullName: g.fullName, rsvp: g.rsvp, notes: g.notes, createdAt: new Date(Date.UTC(2026, 9, 28, 0, 0, i)).toISOString() }));
let state: SeatingState = { guests: {}, assignments: {} };
let r = S.addGuests(state, guests);
if (!r.ok) throw new Error(r.reason);
state = r.state;
if (list.some((g) => g.table)) {
  // planilha com coluna de mesa: cada um na sua mesa (quem "não vai" fica na lista)
  const items = guests.map((g, i) => ({ id: g.id, table: list[i].table ?? 0, rsvp: g.rsvp }))
    .filter((x) => x.table > 0 && x.rsvp !== 'recusado');
  const res = S.placeByTable(state, items);
  if (!res.ok) throw new Error(res.reason);
  state = res.state;
  for (const i of res.issues) console.error(`AVISO: ${state.guests[i.id].fullName} -> mesa ${i.table}: ${i.reason}`);
  const skipped = guests.filter((g, i) => list[i].table && g.rsvp === 'recusado');
  for (const g of skipped) console.error(`AVISO: ${g.fullName} tem mesa mas está como "não vai" (fica na lista)`);
} else {
  // sem coluna de mesa: confirmados em sequência
  const seq = S.placeSequential(state, guests.filter((g) => g.rsvp === 'confirmado').map((g) => g.id), 1);
  if (!seq.ok) throw new Error(seq.reason);
  state = seq.state;
}
const errors = S.validateState(state);
if (errors.length) throw new Error(errors.join('\n'));
const keepDate = process.argv[4]; // mantém a data do backup anterior (não pergunta de novo a quem já carregou)
const backup = createBackup({
  seating: state,
  layout: { tables: defaultTables(), version: LAYOUT_VERSION },
  prefs: { mode: '2d', zoom: 1, spacing: SPACING_ON, showNamesOnPrint: true, paper: 'A3', tipsDismissed: ['boas-vindas'] },
});
if (keepDate) backup.exportadoEm = keepDate;
writeFileSync(output, JSON.stringify(backup, null, 2));
const st = S.computeStats(state);
console.log(JSON.stringify(st));
