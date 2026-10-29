import { useMemo } from 'react';
import { computeStats } from '../../domain/seating';
import { useApp, type TableFilter } from '../../state/store';

const FILTERS: Array<{ id: TableFilter; label: string }> = [
  { id: 'todas', label: 'Todas as mesas' },
  { id: 'vazia', label: 'Vazias' },
  { id: 'parcial', label: 'Parciais' },
  { id: 'completa', label: 'Completas' },
];

/** Indicadores calculados a partir dos dados atuais (nada é fixo). */
export function StatsBar() {
  const seating = useApp((s) => s.seating);
  const filter = useApp((s) => s.tableFilter);
  const setFilter = useApp((s) => s.setTableFilter);
  const tables = useApp((s) => s.layout.tables);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const st = useMemo(() => computeStats(seating), [seating, tables]);
  const count: Record<TableFilter, number> = { todas: st.tables, vazia: st.emptyTables, parcial: st.partialTables, completa: st.fullTables };
  return (
    <div className="indicadores" data-testid="indicadores">
      <div className="grupo-ind" aria-label="Convidados">
        <span className="ind"><b data-testid="ind-total">{st.totalGuests}</b> convidados</span>
        <span className="ind"><b>{st.confirmed}</b> confirmados</span>
        <span className="ind"><b data-testid="ind-distribuidos">{st.seated}</b> distribuídos</span>
        <span className="ind"><b data-testid="ind-sem-lugar">{st.unseated}</b> sem lugar</span>
      </div>
      <span className="sep some-celular" aria-hidden />
      <div className="grupo-ind" aria-label="Lugares">
        <span className="ind"><b>{st.occupiedSeats}</b> lugares ocupados</span>
        <span className="ind"><b data-testid="ind-livres">{st.freeSeats}</b> livres de {st.capacity}</span>
      </div>
      <div className="filtros-mesa" role="group" aria-label="Filtrar mesas no mapa">
        {FILTERS.map((f) => (
          <button key={f.id} className="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label} <span aria-label={`${count[f.id]} mesas`}>({count[f.id]})</span>
          </button>
        ))}
      </div>
    </div>
  );
}
