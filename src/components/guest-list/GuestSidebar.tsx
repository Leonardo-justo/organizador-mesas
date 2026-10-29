import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Check, Clock, FileUp, GripVertical, Move, Pencil, Plus, UserX, X } from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import { compareNames, label, matchesQuery } from '../../domain/guests';
import * as S from '../../domain/seating';
import { RSVP_LABEL, type Guest, type Rsvp, type SeatRef } from '../../domain/types';
import { useApp, useSeatIndex } from '../../state/store';
import { confirmAction, useUi } from '../../state/ui';
import { Tip } from '../common/Tip';
import { DROP_UNASSIGN, dragGuestId } from '../dnd';

type SeatFilter = 'todos' | 'sem-lugar' | 'distribuidos';
type Sort = 'planilha' | 'az' | 'za' | 'mesa';

export function RsvpBadge({ rsvp }: { rsvp: Rsvp }) {
  const Icon = rsvp === 'confirmado' ? Check : rsvp === 'recusado' ? UserX : Clock;
  return (
    <span className={`rsvp ${rsvp}`}>
      <Icon aria-hidden /> {RSVP_LABEL[rsvp]}
    </span>
  );
}

const GuestRow = memo(function GuestRow({
  guest, seat, checked, onCheck, highlighted, picked, familyHi,
}: {
  guest: Guest; seat?: SeatRef; checked: boolean; onCheck: (v: boolean) => void; highlighted: boolean; picked: boolean; familyHi: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragGuestId(guest.id, 'lista'),
    data: { guestId: guest.id, origin: 'lista' },
  });
  const pick = useApp((s) => s.pickGuest);
  const locate = useApp((s) => s.locateGuest);
  const setSidebarOpen = useApp((s) => s.setSidebarOpen);
  const open = useUi((s) => s.open);
  return (
    <div
      ref={setNodeRef}
      className={`convidado${isDragging ? ' arrastando' : ''}${highlighted || familyHi ? ' destaque' : ''}${picked ? ' escolhido' : ''}`}
      data-testid="linha-convidado"
      data-nome={guest.fullName}
      {...attributes}
      {...listeners}
      aria-roledescription="convidado arrastável"
      aria-label={`${guest.fullName}, ${seat ? `mesa ${seat.table}, lugar ${seat.seat}` : 'sem lugar'}. Pressione espaço para arrastar.`}
      onDoubleClick={() => open({ type: 'guest-form', guestId: guest.id })}
    >
      <input
        type="checkbox"
        checked={checked}
        aria-label={`Selecionar ${guest.fullName}`}
        onChange={(e) => onCheck(e.target.checked)}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <div style={{ minWidth: 0 }} onClick={() => (seat ? (locate(guest.id), setSidebarOpen(false)) : undefined)}>
        <div className="nome">{label(guest)}</div>
        <div className="meta">
          {seat ? <span className="lugar-tag">Mesa {seat.table} · lugar {seat.seat}</span> : <span className="lugar-tag sem">Sem lugar</span>}
          <RsvpBadge rsvp={guest.rsvp} />
          {guest.group && <span>{guest.group}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 2 }} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <button
          className="btn fantasma pequeno icone"
          title="Mover ou trocar (toque depois no lugar de destino)"
          aria-label={`Mover ${guest.fullName}`}
          aria-pressed={picked}
          onClick={() => { pick(picked ? null : guest.id); setSidebarOpen(false); }}
        >
          <Move />
        </button>
        <button className="btn fantasma pequeno icone" title="Editar cadastro" aria-label={`Editar ${guest.fullName}`} onClick={() => open({ type: 'guest-form', guestId: guest.id })}>
          <Pencil />
        </button>
        <span aria-hidden style={{ display: 'grid', placeItems: 'center', color: 'var(--linha-2)' }}><GripVertical size={16} /></span>
      </div>
    </div>
  );
});

const LIST_MIN = 280, LIST_MAX = 720, LIST_KEY = 'largura-lista';

/** Largura da lista ajustável (arrastar a borda direita ou setas do teclado), lembrada neste navegador. */
function useListWidth() {
  const [w, setW] = useState<number>(() => {
    try { const v = Number(localStorage.getItem(LIST_KEY)); return v >= LIST_MIN && v <= LIST_MAX ? v : 420; } catch { return 420; }
  });
  useEffect(() => {
    document.documentElement.style.setProperty('--largura-lista', `${w}px`);
    try { localStorage.setItem(LIST_KEY, String(w)); } catch { /* ignora */ }
  }, [w]);
  const clampW = (v: number) => Math.round(Math.min(LIST_MAX, Math.max(LIST_MIN, v)));
  return { w, setW: (v: number) => setW(clampW(v)) };
}

function ResizeHandle() {
  const { w, setW } = useListWidth();
  const [active, setActive] = useState(false);
  return (
    <div
      className={`alca-lista${active ? ' ativa' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Ajustar largura da lista de convidados"
      aria-valuenow={w}
      aria-valuemin={LIST_MIN}
      aria-valuemax={LIST_MAX}
      tabIndex={0}
      title="Arraste para aumentar ou diminuir a lista (duplo clique volta ao padrão)"
      data-testid="alca-lista"
      onDoubleClick={() => setW(420)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') setW(w + 20);
        if (e.key === 'ArrowLeft') setW(w - 20);
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        const x0 = e.clientX, w0 = w;
        setActive(true);
        const move = (ev: PointerEvent) => setW(w0 + ev.clientX - x0);
        const up = () => { setActive(false); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
    />
  );
}

export function GuestSidebar() {
  const guests = useApp((s) => s.seating.guests);
  const seating = useApp((s) => s.seating);
  const idx = useSeatIndex();
  const highlight = useApp((s) => s.highlightGuestId);
  const picked = useApp((s) => s.pickedGuestId);
  const family = useApp((s) => s.familyHighlight);
  const setFamily = useApp((s) => s.setFamilyHighlight);
  const apply = useApp((s) => s.apply);
  const sidebarOpen = useApp((s) => s.sidebarOpen);
  const setSidebarOpen = useApp((s) => s.setSidebarOpen);
  const open = useUi((s) => s.open);

  const [q, setQ] = useState('');
  const [rsvp, setRsvp] = useState<'todas' | Rsvp>('todas');
  const [seatF, setSeatF] = useState<SeatFilter>('todos');
  const [group, setGroup] = useState('');
  const [sort, setSort] = useState<Sort>('planilha');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchTable, setBatchTable] = useState('');

  const { setNodeRef, isOver, active } = useDroppable({ id: DROP_UNASSIGN });
  const draggingFromSeat = (active?.data.current as { origin?: string } | undefined)?.origin === 'assento';

  const groups = useMemo(
    () => Array.from(new Set(Object.values(guests).map((g) => g.group).filter((g): g is string => !!g))).sort(compareNames),
    [guests],
  );

  const list = useMemo(() => {
    const arr = Object.values(guests).filter((g) => {
      if (!matchesQuery(g, q)) return false;
      if (rsvp !== 'todas' && g.rsvp !== rsvp) return false;
      if (group && g.group !== group) return false;
      if (seatF === 'sem-lugar' && idx.has(g.id)) return false;
      if (seatF === 'distribuidos' && !idx.has(g.id)) return false;
      return true;
    });
    arr.sort((a, b) => {
      // ordem da planilha: ordem de cadastro/importação (empates mantêm a ordem original)
      if (sort === 'planilha') return a.createdAt.localeCompare(b.createdAt);
      if (sort === 'za') return compareNames(b.fullName, a.fullName);
      if (sort === 'mesa') {
        const sa = idx.get(a.id), sb = idx.get(b.id);
        const ka = sa ? sa.table * 100 + sa.seat : 99999, kb = sb ? sb.table * 100 + sb.seat : 99999;
        return ka - kb || compareNames(a.fullName, b.fullName);
      }
      return compareNames(a.fullName, b.fullName);
    });
    return arr;
  }, [guests, q, rsvp, group, seatF, sort, idx]);

  const selIds = Array.from(selected).filter((id) => guests[id]);
  const total = Object.keys(guests).length;
  const toggle = (id: string, v: boolean) => setSelected((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n; });

  const batchDelete = () =>
    confirmAction({
      title: `Excluir ${selIds.length} cadastro(s)?`,
      body: `Os cadastros serão apagados${selIds.some((id) => idx.has(id)) ? ' e os lugares que ocupavam serão liberados' : ''}. Você pode desfazer logo em seguida.`,
      confirmLabel: 'Excluir cadastros',
      danger: true,
      onConfirm: () => { if (apply(S.deleteGuests(seating, selIds), 'Excluir cadastros')) setSelected(new Set()); },
    });

  return (
    <>
      <div className={`veu${sidebarOpen ? ' aberto' : ''}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`lateral${sidebarOpen ? ' aberta' : ''}`} aria-label="Lista de convidados">
        <ResizeHandle />
        <div className="lateral-cab">
          <h2>
            Convidados <small>{list.length === total ? `${total}` : `${list.length} de ${total}`}</small>
            <button className="btn fantasma pequeno icone so-celular" style={{ marginLeft: 'auto' }} aria-label="Fechar lista" onClick={() => setSidebarOpen(false)}><X /></button>
          </h2>
          <div className="linha-acoes">
            <button className="btn primario" onClick={() => open({ type: 'guest-form' })}>
              <Plus /> Adicionar convidado
            </button>
            <button className="btn" onClick={() => open({ type: 'import' })}>
              <FileUp /> Importar
            </button>
          </div>
          <input className="entrada" type="search" placeholder="Filtrar por nome ou família" aria-label="Filtrar lista por nome" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="filtros">
            <select className="selecao" aria-label="Filtrar por distribuição" value={seatF} onChange={(e) => setSeatF(e.target.value as SeatFilter)}>
              <option value="todos">Todos</option>
              <option value="sem-lugar">Somente sem lugar</option>
              <option value="distribuidos">Somente distribuídos</option>
            </select>
            <select className="selecao" aria-label="Filtrar por presença" value={rsvp} onChange={(e) => setRsvp(e.target.value as 'todas' | Rsvp)}>
              <option value="todas">Qualquer presença</option>
              <option value="confirmado">Confirmados</option>
              <option value="pendente">Presença pendente</option>
              <option value="recusado">Não comparecerão</option>
            </select>
            <select
              className="selecao"
              aria-label="Filtrar por família ou grupo"
              value={group}
              onChange={(e) => { setGroup(e.target.value); setFamily(e.target.value || null); }}
            >
              <option value="">Todas as famílias</option>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <select className="selecao" aria-label="Ordenar" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="planilha">Ordem da lista</option>
              <option value="az">Nome (A–Z)</option>
              <option value="za">Nome (Z–A)</option>
              <option value="mesa">Por mesa e lugar</option>
            </select>
          </div>
          {family && (
            <div className="aviso" style={{ padding: '6px 10px' }}>
              Destacando no mapa os lugares de <b>{family}</b>. Isso é só visual; ninguém é movido.
            </div>
          )}
        </div>

        {selIds.length > 0 && (
          <div className="lote" role="region" aria-label="Ações em lote">
            <b>{selIds.length} selecionado(s)</b>
            <select className="selecao" style={{ width: 'auto', minHeight: 30, padding: '2px 6px' }} aria-label="Mesa de destino" value={batchTable} onChange={(e) => setBatchTable(e.target.value)}>
              <option value="">Mesa…</option>
              {S.tableNumbers().map((t) => (
                <option key={t} value={t}>Mesa {t} ({S.freeSeats(seating.assignments, t).length} livres)</option>
              ))}
            </select>
            <button
              className="btn pequeno"
              disabled={!batchTable}
              onClick={() => { if (apply(S.placeManyInTable(seating, selIds, Number(batchTable)), 'Distribuição em lote')) setSelected(new Set()); }}
            >
              Distribuir
            </button>
            <button className="btn pequeno" onClick={() => { if (apply(S.unassignMany(seating, selIds), 'Devolver à lista')) setSelected(new Set()); }}>
              Devolver à lista
            </button>
            <button className="btn pequeno perigo" onClick={batchDelete}>Excluir</button>
            <button className="btn pequeno fantasma" onClick={() => setSelected(new Set())}>Limpar seleção</button>
          </div>
        )}

        <Tip id="lista">Arraste um nome até uma mesa do mapa ou até um lugar no painel da mesa. No celular, toque em <Move size={12} /> e depois no lugar.</Tip>

        <div ref={setNodeRef} className={`lista${isOver ? ' alvo' : ''}`} data-testid="lista-convidados">
          {draggingFromSeat && (
            <div className="aviso" style={{ margin: 6 }}>Solte aqui para devolver à lista (o cadastro não é excluído).</div>
          )}
          {total === 0 ? (
            <div className="vazio">
              <h3>Sua lista está vazia</h3>
              <p>Importe a planilha do Excel ou do Google Planilhas, ou adicione os convidados um a um.</p>
              <div className="linha-acoes">
                <button className="btn primario" onClick={() => open({ type: 'import' })}><FileUp /> Importar convidados</button>
                <button className="btn" onClick={() => open({ type: 'guest-form' })}><Plus /> Adicionar</button>
              </div>
            </div>
          ) : list.length === 0 ? (
            <div className="vazio"><p>Nenhum convidado com esses filtros.</p></div>
          ) : (
            list.map((g) => (
              <GuestRow
                key={g.id}
                guest={g}
                seat={idx.get(g.id)}
                checked={selected.has(g.id)}
                onCheck={(v) => toggle(g.id, v)}
                highlighted={highlight === g.id}
                picked={picked === g.id}
                familyHi={!!family && g.group === family}
              />
            ))
          )}
        </div>
      </aside>
    </>
  );
}
