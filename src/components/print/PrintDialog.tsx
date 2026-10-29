import { Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { SEATS_PER_TABLE } from '../../data/floorplan';
import { compareNames } from '../../domain/guests';
import * as S from '../../domain/seating';
import { useApp } from '../../state/store';
import { useUi } from '../../state/ui';
import { Modal } from '../common/Modal';
import { TableMarkerView } from '../seating-map/TableMarker';
import { usePlan } from '../seating-map/usePlan';

interface PrintOpts {
  paper: 'A4' | 'A3';
  initials: boolean;
  tableLists: boolean;
  alphabetical: boolean;
  onlyTable?: number;
}

const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' });

function PrintContent({ o }: { o: PrintOpts }) {
  const plan = usePlan();
  const seating = useApp((s) => s.seating);
  const tables = useApp((s) => s.layout.tables);
  const stats = S.computeStats(seating);
  const idx = S.buildGuestSeatIndex(seating.assignments);
  const nameAt = (t: number, s: number) => {
    const id = seating.assignments[S.seatKey(t, s)];
    return id ? seating.guests[id] : undefined;
  };
  const tableCard = (t: number) => (
    <div className="imp-mesa" key={t}>
      <h2>Mesa {t} <small>{S.tableOccupancy(seating.assignments, t)}/{SEATS_PER_TABLE} lugares</small></h2>
      <ol>
        {S.seatNumbers().map((s) => {
          const g = nameAt(t, s);
          return <li key={s} className={g ? '' : 'livre'}>{g ? g.fullName : '— livre —'}</li>;
        })}
      </ol>
    </div>
  );
  const stamp = `Gerado em ${dateFmt.format(new Date())}`;

  if (o.onlyTable) {
    return (
      <section className="imp-pagina">
        <h1>Mesa {o.onlyTable}</h1>
        <p className="sub">{stamp}</p>
        <div className="imp-mesas uma">{tableCard(o.onlyTable)}</div>
      </section>
    );
  }
  return (
    <>
      <section className="imp-pagina imp-mapa">
        <h1>Mapa das mesas</h1>
        <p className="sub">
          {stats.seated} de {stats.totalGuests} convidados distribuídos · {stats.freeSeats} lugares livres · {stamp}
        </p>
        <svg viewBox={`0 0 ${plan.width} ${plan.height}`}>
          <image href={plan.src} width={plan.width} height={plan.height} preserveAspectRatio="none" />
          {tables.map((t) => (
            <TableMarkerView key={t.number} table={t} W={plan.width} H={plan.height} assignments={seating.assignments} guests={seating.guests}
              selected={false} dimmed={false} highlightGuestId={null} family={null} calibrating={false} dropDisabled showInitials={o.initials} />
          ))}
        </svg>
        <div className="imp-legenda">
          <span><svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="#fff" stroke="#9a9483" strokeDasharray="3 2" /></svg> Mesa vazia (0/10)</span>
          <span><svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="#dfe8dc" stroke="#6f8a6b" /></svg> Parcialmente ocupada (ex.: 6/10)</span>
          <span><svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="#4e6550" /></svg> Completa (✓ 10/10)</span>
          <span><svg width="14" height="14"><circle cx="7" cy="7" r="4" fill="#6f8a6b" /></svg> Cadeira ocupada{o.initials ? ' (iniciais do convidado)' : ''}</span>
          <span><svg width="14" height="14"><circle cx="7" cy="7" r="4" fill="#fff" stroke="#9a9483" /></svg> Cadeira livre</span>
          <span>Lugar 1 no topo de cada mesa, sentido horário.</span>
        </div>
      </section>
      {o.tableLists && (
        <section className="imp-pagina">
          <h1>Convidados por mesa</h1>
          <p className="sub">{stamp}</p>
          <div className="imp-mesas">{S.tableNumbers().map(tableCard)}</div>
        </section>
      )}
      {o.alphabetical && (
        <section className="imp-pagina">
          <h1>Lista alfabética</h1>
          <p className="sub">{stamp}</p>
          <div style={{ columns: 3, columnGap: 24, fontSize: 11.5, lineHeight: 1.55 }}>
            {Object.values(seating.guests)
              .sort((a, b) => compareNames(a.fullName, b.fullName))
              .map((g) => {
                const s = idx.get(g.id);
                return <div key={g.id} style={{ breakInside: 'avoid' }}>{g.fullName} — <b>{s ? `mesa ${s.table}, lugar ${s.seat}` : 'sem lugar'}</b></div>;
              })}
          </div>
        </section>
      )}
    </>
  );
}

export function PrintDialog({ onlyTable }: { onlyTable?: number }) {
  const close = useUi((s) => s.close);
  const prefs = useApp((s) => s.prefs);
  const setPrefs = useApp((s) => s.setPrefs);
  const [o, setO] = useState<PrintOpts>({ paper: prefs.paper, initials: prefs.showNamesOnPrint, tableLists: true, alphabetical: false, onlyTable });
  const host = document.getElementById('impressao');

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `@page { size: ${o.onlyTable ? 'A4 portrait' : `${o.paper} landscape`}; margin: 10mm; }`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [o.paper, o.onlyTable]);

  const print = () => {
    setPrefs({ paper: o.paper, showNamesOnPrint: o.initials });
    setTimeout(() => window.print(), 60);
  };

  return (
    <>
      <Modal
        title={onlyTable ? `Imprimir mesa ${onlyTable}` : 'Imprimir mapa'}
        subtitle="Na janela de impressão, escolha a impressora ou “Salvar como PDF”."
        onClose={close}
        footer={<><button className="btn" onClick={close}>Cancelar</button><button className="btn primario" onClick={print} data-testid="imprimir"><Printer /> Imprimir</button></>}
      >
        {!onlyTable && (
          <>
            <div className="opcoes" role="radiogroup" aria-label="Tamanho do papel">
              <label className="opcao"><input type="radio" checked={o.paper === 'A3'} onChange={() => setO({ ...o, paper: 'A3' })} /><span><b>A3 paisagem</b><small>Recomendado para o mapa (números e iniciais mais legíveis).</small></span></label>
              <label className="opcao"><input type="radio" checked={o.paper === 'A4'} onChange={() => setO({ ...o, paper: 'A4' })} /><span><b>A4 paisagem</b><small>Impressora comum; a planta é reduzida proporcionalmente.</small></span></label>
            </div>
            <label><input type="checkbox" checked={o.initials} onChange={(e) => setO({ ...o, initials: e.target.checked })} /> Mostrar as iniciais dos convidados nas cadeiras do mapa</label>
            <label><input type="checkbox" checked={o.tableLists} onChange={(e) => setO({ ...o, tableLists: e.target.checked })} /> Incluir a lista com os 10 lugares de cada mesa</label>
            <label><input type="checkbox" checked={o.alphabetical} onChange={(e) => setO({ ...o, alphabetical: e.target.checked })} /> Incluir lista alfabética (para a recepção)</label>
          </>
        )}
        {onlyTable && <p style={{ margin: 0 }}>Uma página A4 com os 10 lugares da mesa {onlyTable}, em letras grandes.</p>}
      </Modal>
      {host && createPortal(<PrintContent o={o} />, host)}
    </>
  );
}
