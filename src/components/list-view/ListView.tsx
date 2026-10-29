/**
 * Tela "Lista": as 28 mesas como cartões, sem mapa 2D/3D.
 * Você vai adicionando nomes e eles entram no próximo lugar livre,
 * passando para a mesa seguinte quando a atual lota.
 */
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ListPlus, Undo, UserPlus, Users, UserX } from 'lucide-react';
import { memo, useMemo, useRef, useState } from 'react';
import { SEATS_PER_TABLE } from '../../data/floorplan';
import { compareNames, createGuest, findSimilar, label, matchesQuery, normalizeName } from '../../domain/guests';
import * as S from '../../domain/seating';
import type { Guest, Rsvp } from '../../domain/types';
import { useApp, useSeatIndex } from '../../state/store';
import { confirmAction, useUi } from '../../state/ui';
import { Tip } from '../common/Tip';
import { dragGuestId, dropSeatId } from '../dnd';

const SeatRow = memo(function SeatRow({ table, seat, guest, highlighted, onRemove }: {
  table: number; seat: number; guest?: Guest; highlighted: boolean; onRemove: (id: string) => void;
}) {
  const drop = useDroppable({ id: dropSeatId(table, seat) });
  const drag = useDraggable({
    id: guest ? dragGuestId(guest.id, 'assento') : `vazio-lista:${table}-${seat}`,
    data: guest ? { guestId: guest.id, origin: 'assento' } : undefined,
    disabled: !guest,
  });
  const ref = (el: HTMLLIElement | null) => { drop.setNodeRef(el); drag.setNodeRef(el); };
  return (
    <li
      ref={ref}
      className={`lv-lugar${guest ? ' ocupado' : ''}${drop.isOver ? ' sobre' : ''}${highlighted ? ' destaque' : ''}${drag.isDragging ? ' arrastando' : ''}`}
      data-testid={`lv-${table}-${seat}`}
      {...(guest ? drag.attributes : {})}
      {...(guest ? drag.listeners : {})}
    >
      <span className="n">{seat}</span>
      <span className="quem">{guest ? label(guest) : 'livre'}</span>
      {guest && (
        <button
          className="btn fantasma pequeno icone"
          title="Devolver à lista (não exclui o cadastro)"
          aria-label={`Devolver ${guest.fullName} à lista`}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onClick={() => onRemove(guest.id)}
        >
          <Undo />
        </button>
      )}
    </li>
  );
});

function TableCard({ table, current, onPick }: { table: number; current: boolean; onPick: (t: number) => void }) {
  const assignments = useApp((s) => s.seating.assignments);
  const guests = useApp((s) => s.seating.guests);
  const highlight = useApp((s) => s.highlightGuestId);
  const unassign = useApp((s) => s.unassignGuest);
  const n = S.tableOccupancy(assignments, table);
  const status = n === 0 ? 'vazia' : n === SEATS_PER_TABLE ? 'completa' : 'parcial';
  return (
    <section className={`lv-mesa ${status}${current ? ' atual' : ''}`} aria-label={`Mesa ${table}, ${n} de 10`} data-testid={`lv-mesa-${table}`}>
      <header>
        <button className="lv-titulo" onClick={() => onPick(table)} title="Começar a adicionar por esta mesa" aria-pressed={current}>
          Mesa {table}
        </button>
        <span className={`selo ${status}`}>{status === 'completa' ? '✓ 10/10' : `${n}/10`}</span>
      </header>
      <ol>
        {S.seatNumbers().map((s) => {
          const id = assignments[S.seatKey(table, s)];
          return <SeatRow key={s} table={table} seat={s} guest={id ? guests[id] : undefined} highlighted={!!id && id === highlight} onRemove={unassign} />;
        })}
      </ol>
    </section>
  );
}

export function ListView() {
  const seating = useApp((s) => s.seating);
  const apply = useApp((s) => s.apply);
  const toast = useApp((s) => s.toast);
  const idx = useSeatIndex();
  const open = useUi((s) => s.open);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [target, setTarget] = useState<number>(() => S.nextFreeSeat(seating.assignments, 1)?.table ?? 1);
  const [batchFilter, setBatchFilter] = useState<'confirmado' | 'todos'>('confirmado');
  const [rsvpNew, setRsvpNew] = useState<Rsvp>('confirmado');
  const [last, setLast] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const next = S.nextFreeSeat(seating.assignments, target);
  const unseatedAll = useMemo(
    () => Object.values(seating.guests).filter((g) => !idx.has(g.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [seating.guests, idx],
  );
  const suggestions = useMemo(() => {
    if (!normalizeName(q)) return [];
    return unseatedAll.filter((g) => matchesQuery(g, q)).sort((a, b) => compareNames(a.fullName, b.fullName)).slice(0, 8);
  }, [q, unseatedAll]);
  const exact = suggestions.find((g) => normalizeName(g.fullName) === normalizeName(q));
  const options: Array<{ kind: 'guest'; g: Guest } | { kind: 'new' }> = [
    ...suggestions.map((g) => ({ kind: 'guest' as const, g })),
    ...(normalizeName(q) && !exact ? [{ kind: 'new' as const }] : []),
  ];

  const placeId = (guestId: string, state = useApp.getState().seating) => {
    const ref = S.nextFreeSeat(state.assignments, target);
    if (!ref) { toast('erro', 'Todos os 280 lugares estão ocupados.'); return false; }
    const r = S.placeGuest(state, guestId, ref);
    return { r, ref };
  };

  const addExisting = (g: Guest) => {
    const res = placeId(g.id);
    if (!res) return;
    if (apply(res.r, 'Adicionar em sequência')) {
      setTarget(res.ref.table);
      setLast(`${label(g)} → mesa ${res.ref.table}, lugar ${res.ref.seat}`);
    }
    setQ(''); setActive(0); inputRef.current?.focus();
  };

  const addNew = () => {
    const name = q.trim();
    if (!name) return;
    const similar = findSimilar(name, Object.values(seating.guests));
    const g = createGuest({ fullName: name, rsvp: rsvpNew });
    const added = S.addGuest(seating, g);
    if (!added.ok) { toast('erro', added.reason); return; }
    const res = placeId(g.id, added.state);
    if (!res) return;
    if (!res.r.ok) { toast('erro', res.r.reason); return; }
    if (apply({ ...res.r, message: `${g.fullName} cadastrado(a) e colocado(a) na mesa ${res.ref.table}, lugar ${res.ref.seat}` }, 'Cadastrar e adicionar')) {
      setTarget(res.ref.table);
      setLast(`${g.fullName} → mesa ${res.ref.table}, lugar ${res.ref.seat}`);
      if (similar.length) toast('info', `Atenção: já existe nome parecido (${similar.map((x) => x.fullName).join(', ')}).`);
    }
    setQ(''); setActive(0); inputRef.current?.focus();
  };

  const choose = (i: number) => {
    const o = options[i];
    if (!o) return;
    if (o.kind === 'guest') addExisting(o.g); else addNew();
  };

  const batch = unseatedAll.filter((g) => batchFilter === 'todos' || g.rsvp === 'confirmado');

  return (
    <div className="mapa-area lista-mesas" data-testid="tela-lista">
      <div className="lv-barra">
        <div className="lv-add">
          <label htmlFor="lv-busca" className="lv-rotulo">
            Adicionar na sequência {next ? <>— próximo lugar: <b>mesa {next.table}, lugar {next.seat}</b></> : <b>— salão cheio</b>}
          </label>
          <div className="lv-campo">
            <UserPlus aria-hidden />
            <input
              id="lv-busca"
              ref={inputRef}
              className="entrada"
              placeholder="Digite o nome e tecle Enter…"
              value={q}
              autoComplete="off"
              data-testid="lv-busca"
              onChange={(e) => { setQ(e.target.value); setActive(0); }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === 'Enter') { e.preventDefault(); choose(active); }
                if (e.key === 'Escape') setQ('');
              }}
            />
            {options.length > 0 && (
              <div className="resultados" role="listbox">
                {options.map((o, i) => (
                  <div
                    key={o.kind === 'guest' ? o.g.id : 'novo'}
                    role="option"
                    aria-selected={i === active}
                    className="resultado"
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(i)}
                  >
                    {o.kind === 'guest' ? (
                      <>
                        <span className="nome">{o.g.fullName}</span>
                        <span className="meta">{o.g.group || 'Sem família/grupo'}</span>
                        <span className="onde"><span className="lugar-tag sem">Sem lugar</span></span>
                      </>
                    ) : (
                      <>
                        <span className="nome">Cadastrar “{q.trim()}”</span>
                        <span className="meta">Novo convidado, entra direto no próximo lugar</span>
                        <span className="onde"><span className="lugar-tag">Novo</span></span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="lv-opcoes">
            <label>
              Começar pela
              <select className="selecao" value={target} onChange={(e) => setTarget(Number(e.target.value))} aria-label="Mesa onde começar" data-testid="lv-mesa-alvo">
                {S.tableNumbers().map((t) => (
                  <option key={t} value={t}>Mesa {t} ({SEATS_PER_TABLE - S.tableOccupancy(seating.assignments, t)} livres)</option>
                ))}
              </select>
            </label>
            <label>
              Novos cadastros como
              <select className="selecao" value={rsvpNew} onChange={(e) => setRsvpNew(e.target.value as Rsvp)} aria-label="Presença dos novos cadastros">
                <option value="confirmado">Confirmado</option>
                <option value="pendente">Pendente</option>
              </select>
            </label>
          </div>
          {last && <div className="lv-ultimo" role="status">Último: {last}</div>}
        </div>
        <div className="lv-lote">
          <span className="lv-rotulo">Sem lugar: <b>{unseatedAll.length}</b> ({unseatedAll.filter((g) => g.rsvp === 'confirmado').length} confirmados)</span>
          <div className="linha-acoes">
            <select className="selecao" style={{ width: 'auto' }} value={batchFilter} onChange={(e) => setBatchFilter(e.target.value as 'confirmado' | 'todos')} aria-label="Quem colocar em sequência">
              <option value="confirmado">Só confirmados</option>
              <option value="todos">Todos sem lugar</option>
            </select>
            <button
              className="btn primario"
              disabled={!batch.length}
              data-testid="lv-colocar-todos"
              onClick={() => confirmAction({
                title: `Colocar ${batch.length} convidado(s) em sequência?`,
                body: `Eles entram na ordem da lista importada, a partir da mesa ${target}, preenchendo os lugares livres e passando para a próxima mesa quando lotar. Quem já está sentado não muda. Dá para desfazer.`,
                confirmLabel: 'Colocar em sequência',
                onConfirm: () => {
                  const r = S.placeSequential(useApp.getState().seating, batch.map((g) => g.id), target);
                  useApp.getState().apply(r, 'Colocar em sequência');
                },
              })}
            >
              <ListPlus /> Colocar em sequência
            </button>
            <button
              className="btn perigo"
              disabled={!Object.keys(seating.assignments).length}
              data-testid="lv-tirar-todos"
              onClick={() => confirmAction({
                title: 'Tirar todos das mesas?',
                body: `Os ${Object.keys(seating.assignments).length} convidados sentados voltam para a lista sem lugar. Nenhum cadastro é excluído e dá para desfazer.`,
                confirmLabel: 'Tirar todos das mesas',
                danger: true,
                onConfirm: () => useApp.getState().apply(S.unassignAll(useApp.getState().seating), 'Tirar todos das mesas'),
              })}
            >
              <UserX /> Tirar todos das mesas
            </button>
            <button className="btn" onClick={() => open({ type: 'import' })}><Users /> Importar convidados</button>
          </div>
        </div>
      </div>
      <Tip id="lista-mesas">Clique em “Mesa N” para escolher por onde começar. Também dá para arrastar nomes entre os cartões, ou da lista à esquerda para um lugar.</Tip>
      <div className="lv-grade">
        {S.tableNumbers().map((t) => (
          <TableCard key={t} table={t} current={next?.table === t} onPick={(n) => { setTarget(n); inputRef.current?.focus(); }} />
        ))}
      </div>
    </div>
  );
}
