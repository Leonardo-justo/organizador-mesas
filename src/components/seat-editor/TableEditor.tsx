import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ArrowLeftRight, Shuffle, Pencil, Printer, UserPlus, Users, Undo, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { label } from '../../domain/guests';
import { seatOffsets } from '../../domain/layout';
import * as S from '../../domain/seating';
import type { Guest } from '../../domain/types';
import { useApp } from '../../state/store';
import { useUi } from '../../state/ui';
import { RsvpBadge } from '../guest-list/GuestSidebar';
import { dragGuestId, dropSeatId } from '../dnd';

function Seat({
  table, seat, guest, style, active, highlighted, picking, onClick,
}: {
  table: number; seat: number; guest?: Guest; style: React.CSSProperties; active: boolean; highlighted: boolean; picking: boolean; onClick: () => void;
}) {
  const drop = useDroppable({ id: dropSeatId(table, seat) });
  const drag = useDraggable({
    id: guest ? dragGuestId(guest.id, 'assento') : `vazio:${table}-${seat}`,
    data: guest ? { guestId: guest.id, origin: 'assento' } : undefined,
    disabled: !guest,
  });
  const ref = (el: HTMLButtonElement | null) => { drop.setNodeRef(el); drag.setNodeRef(el); };
  const cls = ['assento', guest && 'ocupado', drop.isOver && 'sobre', (active || highlighted) && 'destaque', drag.isDragging && 'arrastando', picking && 'alvo-escolha']
    .filter(Boolean).join(' ');
  return (
    <button
      ref={ref}
      className={cls}
      style={style}
      data-testid={`assento-${table}-${seat}`}
      aria-label={`Lugar ${seat}: ${guest ? label(guest) : 'livre'}`}
      {...(guest ? drag.attributes : {})}
      {...(guest ? drag.listeners : {})}
      aria-pressed={active}
      onClick={onClick}
    >
      <span className="num">{seat}</span>
      <span className="quem">{guest ? label(guest) : 'livre'}</span>
    </button>
  );
}

export function TableEditor() {
  const tableNo = useApp((s) => s.selectedTable);
  const tables = useApp((s) => s.calibrationDraft ?? s.layout.tables);
  const seating = useApp((s) => s.seating);
  const highlight = useApp((s) => s.highlightGuestId);
  const picked = useApp((s) => s.pickedGuestId);
  const calibrating = useApp((s) => s.calibrating);
  const selectTable = useApp((s) => s.selectTable);
  const seatPicked = useApp((s) => s.seatPicked);
  const pickGuest = useApp((s) => s.pickGuest);
  const unassign = useApp((s) => s.unassignGuest);
  const dropOnTable = useApp((s) => s.dropGuestOnTable);
  const open = useUi((s) => s.open);
  const [activeSeat, setActiveSeat] = useState<number | null>(null);

  useEffect(() => setActiveSeat(null), [tableNo]);
  // Ao localizar um convidado, abre a ficha do lugar dele
  useEffect(() => {
    if (!highlight || tableNo == null) return;
    const s = S.seatOf(seating, highlight);
    if (s?.table === tableNo) setActiveSeat(s.seat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight, tableNo]);

  if (tableNo == null || calibrating) return null;
  const t = tables.find((x) => x.number === tableNo);
  if (!t) return null;

  const guestAt = (seat: number) => {
    const id = seating.assignments[S.seatKey(tableNo, seat)];
    return id ? seating.guests[id] : undefined;
  };
  const n = S.tableOccupancy(seating.assignments, tableNo);
  const status = S.tableStatus(seating.assignments, tableNo);
  const isRect = t.shape === 'rect';
  const pos = isRect
    ? seatOffsets('rect', t.seatRotation, 0, 80, 34, t.seats).map((o) => ({ seat: o.seat, left: 50 + o.dx, top: 50 + o.dy * 1.25 }))
    : seatOffsets('round', t.seatRotation, 39, 0, 0, t.seats).map((o) => ({ seat: o.seat, left: 50 + o.dx, top: 50 + o.dy }));
  const pickedGuest = picked ? seating.guests[picked] : undefined;
  const activeGuest = activeSeat ? guestAt(activeSeat) : undefined;

  const clickSeat = (seat: number) => {
    if (picked) { seatPicked({ table: tableNo, seat }); setActiveSeat(seat); return; }
    setActiveSeat(activeSeat === seat ? null : seat);
  };

  return (
    <aside className="painel" aria-label={`Mesa ${tableNo}`} data-testid="painel-mesa">
      <div className="painel-cab">
        <div>
          <h2>Mesa {tableNo}</h2>
          <div className="status">
            <span className={`selo ${status}`}>{status === 'completa' ? 'Completa' : status === 'parcial' ? 'Parcialmente ocupada' : 'Vazia'}</span>
            <span data-testid="ocupados"><b>{n}</b> ocupados</span>
            <span><b>{t.seats - n}</b> livres</span>
          </div>
        </div>
        <div className="fim">
          <button
            className="btn pequeno"
            onClick={() => open({ type: 'swap-table', table: tableNo })}
            disabled={n === 0}
            title="Trocar todos os convidados desta mesa com outra mesa de uma vez"
            data-testid="trocar-mesa"
          >
            <Shuffle /> Trocar mesa inteira
          </button>
          <button className="btn fantasma icone" title="Imprimir lista desta mesa" aria-label="Imprimir lista desta mesa" onClick={() => open({ type: 'print', onlyTable: tableNo })}><Printer /></button>
          <button className="btn fantasma icone" aria-label="Fechar painel da mesa" onClick={() => selectTable(null)}><X /></button>
        </div>
      </div>
      <div className="painel-corpo">
        {pickedGuest && (
          <div className="ficha">
            Movendo <strong>{label(pickedGuest)}</strong>: toque em um lugar.
            <div style={{ marginTop: 6 }}>
              <button className="btn pequeno dourado" onClick={() => dropOnTable(pickedGuest.id, tableNo)}>
                {n < t.seats ? 'Colocar no primeiro lugar livre' : 'Mesa lotada: escolher quem sai'}
              </button>
            </div>
          </div>
        )}
        <div className={`roda${isRect ? ' ret' : ''}`}>
          <div className="tampo" aria-hidden>{tableNo}</div>
          {pos.map((p) => (
            <Seat
              key={p.seat}
              table={tableNo}
              seat={p.seat}
              guest={guestAt(p.seat)}
              style={{ left: `${p.left}%`, top: `${p.top}%`, ...(isRect ? { width: 64, marginLeft: -32 } : {}) }}
              active={activeSeat === p.seat}
              highlighted={!!highlight && guestAt(p.seat)?.id === highlight}
              picking={!!picked}
              onClick={() => clickSeat(p.seat)}
            />
          ))}
        </div>

        {activeSeat != null && !picked && (
          <div className="ficha" data-testid="ficha-lugar">
            {activeGuest ? (
              <>
                <div><strong>{activeGuest.fullName}</strong> — lugar {activeSeat}</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '2px 0 8px', fontSize: 12.5 }}>
                  <RsvpBadge rsvp={activeGuest.rsvp} />
                  {activeGuest.group && <span>Família/grupo: {activeGuest.group}</span>}
                  {activeGuest.companion && <span>Acompanhante: {activeGuest.companion}</span>}
                </div>
                {activeGuest.notes && <div style={{ fontSize: 12.5, marginBottom: 8 }}>Obs.: {activeGuest.notes}</div>}
                <div className="linha-acoes">
                  <button className="btn pequeno" onClick={() => pickGuest(activeGuest.id)}><ArrowLeftRight /> Mover ou trocar</button>
                  <button className="btn pequeno" onClick={() => { unassign(activeGuest.id); setActiveSeat(null); }}><Undo /> Devolver à lista</button>
                  <button className="btn pequeno" onClick={() => open({ type: 'guest-form', guestId: activeGuest.id })}><Pencil /> Editar</button>
                </div>
              </>
            ) : (
              <>
                <div><strong>Lugar {activeSeat}</strong> está livre.</div>
                <div className="linha-acoes" style={{ marginTop: 6 }}>
                  <button className="btn pequeno primario" onClick={() => open({ type: 'picker', table: tableNo, seat: activeSeat })}><Users /> Escolher convidado</button>
                  <button className="btn pequeno" onClick={() => open({ type: 'guest-form', presetSeat: { table: tableNo, seat: activeSeat } })}><UserPlus /> Novo convidado aqui</button>
                </div>
              </>
            )}
          </div>
        )}

        <ol className="lugares" aria-label="Lugares da mesa">
          {S.seatNumbers(tableNo).map((seat) => {
            const g = guestAt(seat);
            return (
              <li key={seat} className={`${g ? '' : 'livre'}${g && g.id === highlight ? ' destaque' : ''}`}>
                <span className="n">{seat}</span>
                <span className="quem">{g ? g.fullName : 'Livre'}</span>
                <span className="acoes-l">
                  {g ? (
                    <>
                      <button className="btn fantasma pequeno icone" title="Mover ou trocar" aria-label={`Mover ou trocar ${g.fullName}`} onClick={() => pickGuest(g.id)}><ArrowLeftRight /></button>
                      <button className="btn fantasma pequeno icone" title="Devolver à lista (não exclui o cadastro)" aria-label={`Devolver ${g.fullName} à lista`} onClick={() => unassign(g.id)}><Undo /></button>
                    </>
                  ) : picked ? (
                    <button className="btn pequeno dourado" onClick={() => seatPicked({ table: tableNo, seat })}>Colocar aqui</button>
                  ) : (
                    <button className="btn fantasma pequeno" onClick={() => open({ type: 'picker', table: tableNo, seat })}>Escolher</button>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="nota">
          Mesa de {t.seats} lugares. Numeração: {isRect ? 'começa no lado de cima (esquerda → direita), segue pela cabeceira direita, volta por baixo e termina na cabeceira esquerda' : 'lugar 1 no topo, seguindo no sentido horário'}
          {t.seatRotation ? ` (girada ${t.seatRotation}°)` : ''}. Para girar, use “Mover mesas”. Solte um convidado sobre um lugar ocupado para trocar.
        </p>
      </div>
    </aside>
  );
}
