import { useDroppable } from '@dnd-kit/core';
import { memo } from 'react';
import { RECT_TABLE_H, RECT_TABLE_W, ROUND_TABLE_RADIUS, SEAT_RING_RADIUS, SEATS_PER_TABLE } from '../../data/floorplan';
import { label } from '../../domain/guests';
import { seatOffsets } from '../../domain/layout';
import { seatKey } from '../../domain/seating';
import type { Assignments, Guest, TableDef } from '../../domain/types';
import { dropTableId } from '../dnd';

export interface MarkerProps {
  table: TableDef;
  W: number;
  H: number;
  assignments: Assignments;
  guests: Record<string, Guest>;
  selected: boolean;
  dimmed: boolean;
  highlightGuestId: string | null;
  family: string | null;
  calibrating: boolean;
  dropDisabled: boolean;
  showInitials?: boolean;
  /** Quando definido, a mesa é desenhada como cartão com os nomes dos 10 lugares (zoom alto). */
  card?: { w: number; h: number };
  onSelect?: (n: number) => void;
  onCalibratePointerDown?: (n: number, e: React.PointerEvent) => void;
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');

/** Marcador de mesa no mapa 2D (SVG). Também é alvo de soltura: coloca no primeiro lugar livre. */
export const TableMarker = memo(function TableMarker(p: MarkerProps) {
  return <TableMarkerView {...p} />;
});

/**
 * Alvo de soltura em HTML sobreposto ao SVG (posição em % da planta), para que a
 * medição do arrastar-e-soltar seja precisa em qualquer zoom. Não captura cliques.
 * (Sem CSS transform: o dnd-kit mede alvos ignorando transformações.)
 */
export function TableDropZone({ table, W, disabled, sizeUnits }: { table: TableDef; W: number; disabled: boolean; sizeUnits?: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: dropTableId(table.number), disabled });
  const size = ((sizeUnits ?? 2 * (SEAT_RING_RADIUS + 8)) / W) * 100;
  return (
    <div
      ref={setNodeRef}
      className={`alvo-mesa${isOver ? ' sobre' : ''}`}
      style={{ left: `${table.x * 100}%`, top: `${table.y * 100}%`, width: `${size}%`, marginLeft: `${-size / 2}%`, marginTop: `${-size / 2}%` }}
      aria-hidden
    />
  );
}

/** Desenho puro (sem arrastar-e-soltar) — reutilizado na impressão. */
export function TableMarkerView(p: MarkerProps) {
  const { table: t, W, H, assignments, guests } = p;
  const cx = t.x * W;
  const cy = t.y * H;
  const occupied = Array.from({ length: SEATS_PER_TABLE }, (_, i) => assignments[seatKey(t.number, i + 1)]);
  const n = occupied.filter(Boolean).length;
  const full = n === SEATS_PER_TABLE;
  const status = n === 0 ? 'vazia' : full ? 'completa' : 'parcial';
  const fill = full ? '#4e6550' : n ? '#dfe8dc' : '#ffffff';
  const stroke = full ? '#4e6550' : n ? '#6f8a6b' : '#9a9483';
  const textColor = full ? '#ffffff' : '#2b2b26';
  const seats = seatOffsets(t.shape, t.seatRotation, SEAT_RING_RADIUS, RECT_TABLE_W, RECT_TABLE_H);
  const names = occupied.map((id, i) => `${i + 1}. ${id && guests[id] ? label(guests[id]) : '(livre)'}`).join('\n');

  const common = {
    className: `mesa${p.dimmed ? ' esmaecida' : ''}`,
    transform: `translate(${cx} ${cy})`,
    role: 'button',
    tabIndex: 0,
    'aria-label': `Mesa ${t.number}: ${n} de 10 lugares ocupados (${status})`,
    'aria-pressed': p.selected,
    'data-testid': `mesa-${t.number}`,
    onClick: () => !p.calibrating && p.onSelect?.(t.number),
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onSelect?.(t.number); } },
    onPointerDown: (e: React.PointerEvent) => p.calibrating && p.onCalibratePointerDown?.(t.number, e),
  };

  if (p.card) {
    const { w, h } = p.card;
    const header = h * 0.13;
    const lh = (h - header - 1.5) / SEATS_PER_TABLE;
    const fs = lh * 0.86;
    const maxChars = Math.max(6, Math.floor((w - fs * 1.9 - 3) / (fs * 0.5)));
    const cut = (s: string) => (s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s);
    const headFill = full ? '#4e6550' : n ? '#dfe8dc' : '#f4efe3';
    return (
      <g {...common}>
        <title>{`Mesa ${t.number} — ${n}/10\n${names}`}</title>
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={2.5} fill="#fffdf8" stroke={p.selected ? '#a88a4a' : stroke} strokeWidth={p.selected ? 1.6 : 0.6} className="anel" />
        <path d={`M${-w / 2} ${-h / 2 + header} V${-h / 2 + 2.5} Q${-w / 2} ${-h / 2} ${-w / 2 + 2.5} ${-h / 2} H${w / 2 - 2.5} Q${w / 2} ${-h / 2} ${w / 2} ${-h / 2 + 2.5} V${-h / 2 + header} Z`} fill={headFill} />
        <text x={-w / 2 + 2.5} y={-h / 2 + header * 0.78} fontSize={header * 0.85} fontWeight={700} fill={full ? '#fff' : '#2b2b26'}>Mesa {t.number}</text>
        <text x={w / 2 - 2.5} y={-h / 2 + header * 0.72} fontSize={header * 0.55} textAnchor="end" fill={full ? '#fff' : '#57554c'} style={{ fontFamily: 'Jost, sans-serif' }}>{full ? '✓ 10/10' : `${n}/10`}</text>
        {occupied.map((gid, i) => {
          const g = gid ? guests[gid] : undefined;
          const y = -h / 2 + header + 1 + lh * i;
          const hi = !!gid && (gid === p.highlightGuestId || (!!p.family && g?.group === p.family));
          return (
            <g key={i}>
              {hi && <rect x={-w / 2 + 0.8} y={y + 0.2} width={w - 1.6} height={lh - 0.2} rx={1} fill="#f1e2b8" />}
              <text x={-w / 2 + 2.2} y={y + lh * 0.78} fontSize={fs * 0.85} fill="#a39d8e" fontWeight={700}>{i + 1}</text>
              <text x={-w / 2 + 2.4 + fs * 1.3} y={y + lh * 0.78} fontSize={fs} fill={g ? '#2b2b26' : '#b3ad9f'} style={{ fontFamily: 'Jost, sans-serif', fontStyle: g ? 'normal' : 'italic' }}>
                {g ? cut(label(g)) : 'livre'}
              </text>
            </g>
          );
        })}
      </g>
    );
  }

  return (
    <g {...common}>
      <title>{`Mesa ${t.number} — ${n}/10\n${names}`}</title>
      {/* área de clique/soltura generosa */}
      <circle r={SEAT_RING_RADIUS + 7} fill="rgba(255,255,255,0.001)" />
      {p.selected && <circle r={SEAT_RING_RADIUS + 9} fill="none" stroke="#a88a4a" strokeWidth={3} />}
      {seats.map(({ seat, dx, dy }) => {
        const gid = occupied[seat - 1];
        const g = gid ? guests[gid] : undefined;
        const hi = !!gid && (gid === p.highlightGuestId || (!!p.family && g?.group === p.family));
        return (
          <g key={seat}>
            <circle
              cx={dx}
              cy={dy}
              r={hi ? 6.6 : 5.4}
              fill={hi ? '#a88a4a' : gid ? '#6f8a6b' : '#ffffff'}
              stroke={hi ? '#7a5f22' : gid ? '#4e6550' : '#9a9483'}
              strokeWidth={hi ? 1.6 : 1}
            />
            {p.showInitials && g && (
              <text x={dx} y={dy + 2} fontSize={5} textAnchor="middle" fill="#fff" style={{ fontFamily: 'Jost, sans-serif' }}>{initials(label(g))}</text>
            )}
            {gid === p.highlightGuestId && <circle cx={dx} cy={dy} r={10} fill="none" stroke="#a88a4a" strokeWidth={2} />}
          </g>
        );
      })}
      {t.shape === 'round' ? (
        <circle className="fundo anel" r={ROUND_TABLE_RADIUS} fill={fill} stroke={stroke} strokeWidth={1.2} strokeDasharray={n === 0 ? '3 2' : undefined} />
      ) : (
        <rect className="fundo anel" x={-RECT_TABLE_W / 2} y={-RECT_TABLE_H / 2} width={RECT_TABLE_W} height={RECT_TABLE_H} rx={3} fill={fill} stroke={stroke} strokeWidth={1.2} strokeDasharray={n === 0 ? '3 2' : undefined} />
      )}
      <text y={t.shape === 'round' ? 2 : 1} fontSize={14} fontWeight={700} textAnchor="middle" fill={textColor}>{t.number}</text>
      <text y={t.shape === 'round' ? 11 : 9} fontSize={7} textAnchor="middle" fill={textColor} style={{ fontFamily: 'Jost, sans-serif' }}>
        {full ? '✓ 10/10' : `${n}/10`}
      </text>
    </g>
  );
}
