import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, pointerWithin, rectIntersection,
  useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import { Suspense, lazy, useEffect, useState } from 'react';
import { label } from '../domain/guests';
import { useApp } from '../state/store';
import { useUi } from '../state/ui';
import { Toasts } from '../components/common/Toasts';
import { DialogHost } from '../components/dialogs/DialogHost';
import { parseDrop, type DragData } from '../components/dnd';
import { GuestSidebar } from '../components/guest-list/GuestSidebar';
import { CalibrationBanner, PickBanner } from '../components/layout/Banners';
import { StatsBar } from '../components/layout/StatsBar';
import { TopBar } from '../components/layout/TopBar';
import { TableEditor } from '../components/seat-editor/TableEditor';
import { SeatingMap } from '../components/seating-map/SeatingMap';
import { Welcome } from './Welcome';

const Hall3D = lazy(() => import('../components/three/Hall3D'));

// Prioriza o alvo sob o ponteiro (assento do painel > mesa do mapa > lista).
// Entre mesas vizinhas, vence a de centro mais próximo do ponteiro.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length) {
    const seat = hits.find((h) => String(h.id).startsWith('assento:'));
    if (seat) return [seat];
    const p = args.pointerCoordinates;
    if (!p || hits.length === 1) return hits;
    const dist = (id: string | number) => {
      const r = args.droppableRects.get(id);
      return r ? Math.hypot(r.left + r.width / 2 - p.x, r.top + r.height / 2 - p.y) : Infinity;
    };
    return [...hits].sort((a, b) => dist(a.id) - dist(b.id));
  }
  return rectIntersection(args);
};

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (useUi.getState().dialog) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); useApp.getState().undo(); }
      else if (mod && ((k === 'z' && e.shiftKey) || k === 'y')) { e.preventDefault(); useApp.getState().redo(); }
      else if (e.key === 'Escape') {
        const s = useApp.getState();
        if (s.pickedGuestId) s.pickGuest(null);
        else if (s.selectedTable != null && !s.calibrating) s.selectTable(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  const mode = useApp((s) => s.prefs.mode);
  const loaded = useApp((s) => s.loaded);
  const calibrating = useApp((s) => s.calibrating);
  const saveError = useApp((s) => s.saveError);
  const saveStatus = useApp((s) => s.saveStatus);
  const guests = useApp((s) => s.seating.guests);
  const [dragging, setDragging] = useState<string | null>(null);
  useShortcuts();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const onDragStart = (e: DragStartEvent) => {
    const d = e.active.data.current as DragData | undefined;
    setDragging(d?.guestId ?? null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const d = e.active.data.current as DragData | undefined;
    const target = parseDrop(e.over?.id);
    if (!d || !target) return;
    const st = useApp.getState();
    if (st.calibrating) return;
    if (!st.seating.guests[d.guestId]) { st.toast('erro', 'Este convidado não existe mais.'); return; }
    if (target.kind === 'seat') st.dropGuestOnSeat(d.guestId, { table: target.table, seat: target.seat });
    else if (target.kind === 'table') {
      const cur = Object.entries(st.seating.assignments).find(([, v]) => v === d.guestId)?.[0];
      if (cur?.startsWith(`${target.table}-`)) return; // soltou na própria mesa: nada muda
      if (st.dropGuestOnTable(d.guestId, target.table)) st.selectTable(target.table);
    } else if (target.kind === 'unassign' && d.origin === 'assento') st.unassignGuest(d.guestId);
  };

  if (!loaded) return <div className="vazio" style={{ marginTop: '20vh' }}><h3>Abrindo o organizador…</h3></div>;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
      accessibility={{
        screenReaderInstructions: { draggable: 'Para pegar um convidado, pressione espaço ou Enter. Use as setas para mover e espaço para soltar. Esc cancela.' },
        announcements: {
          onDragStart: () => 'Convidado pego.',
          onDragOver: ({ over }) => (over ? `Sobre ${String(over.id).replace('assento:', 'lugar ').replace('mesa:', 'mesa ')}` : 'Fora de um lugar.'),
          onDragEnd: ({ over }) => (over ? 'Convidado solto.' : 'Solto fora de um lugar; nada mudou.'),
          onDragCancel: () => 'Movimento cancelado; nada mudou.',
        },
      }}
    >
      <div className="app">
        <TopBar />
        <div>
          <StatsBar />
          {saveStatus === 'erro' && saveError && <div className="faixa" style={{ background: 'var(--erro-claro)', color: '#7b3329' }} role="alert">{saveError}</div>}
          <PickBanner />
          <CalibrationBanner />
        </div>
        <div className="corpo">
          <GuestSidebar />
          {mode === '3d' && !calibrating ? (
            <Suspense fallback={<div className="mapa-area"><div className="vazio">Carregando visualização 3D…</div></div>}>
              <Hall3D />
            </Suspense>
          ) : (
            <SeatingMap />
          )}
          <TableEditor />
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging && guests[dragging] ? (
          <div className="arraste"><GripVertical size={15} /> {label(guests[dragging])}</div>
        ) : null}
      </DragOverlay>
      <DialogHost />
      <Toasts />
      <Welcome />
    </DndContext>
  );
}
