import { Crosshair, Maximize2, Minus, MoveHorizontal, Plus, Settings2, Type } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { defaultTables } from '../../data/floorplan';
import { SPACING_ON, TABLE_BLOCK_MASKS, clamp01, spreadPoint, spreadTables, unspreadPoint } from '../../domain/layout';
import { tableStatus } from '../../domain/seating';
import { useApp } from '../../state/store';
import { useUi } from '../../state/ui';
import { Tip } from '../common/Tip';
import { TableDropZone, TableMarker } from './TableMarker';
import { usePlan } from './usePlan';

const ZMIN = 0.6, ZMAX = 6;
/** Tamanho mínimo da letra (px na tela) para mostrar os nomes nas mesas. */
const NAME_MIN_PX = 7.5;

export function SeatingMap() {
  const plan = usePlan();
  const tablesSaved = useApp((s) => s.layout.tables);
  const draft = useApp((s) => s.calibrationDraft);
  const calibrating = useApp((s) => s.calibrating);
  const assignments = useApp((s) => s.seating.assignments);
  const guests = useApp((s) => s.seating.guests);
  const selected = useApp((s) => s.selectedTable);
  const highlight = useApp((s) => s.highlightGuestId);
  const family = useApp((s) => s.familyHighlight);
  const filter = useApp((s) => s.tableFilter);
  const zoom = useApp((s) => s.prefs.zoom);
  const focusRequest = useApp((s) => s.focusRequest);
  const setPrefs = useApp((s) => s.setPrefs);
  const selectTable = useApp((s) => s.selectTable);
  const startCalibration = useApp((s) => s.startCalibration);
  const moveDraft = useApp((s) => s.moveDraftTable);
  const open = useUi((s) => s.open);

  const tables = draft ?? tablesSaved;
  const spacingPref = useApp((s) => s.prefs.spacing ?? SPACING_ON);
  const spacing = spacingPref;
  const shown = useMemo(() => spreadTables(tables, spacing), [tables, spacing]);
  // Se alguma mesa saiu do lugar original, cobre o desenho antigo das mesas na imagem
  const moved = useMemo(() => {
    const orig = defaultTables();
    return tables.some((t) => { const o = orig[t.number - 1]; return !o || Math.abs(o.x - t.x) > 0.003 || Math.abs(o.y - t.y) > 0.003; });
  }, [tables]);
  // Cartão com nomes: ocupa quase todo o espaço entre mesas vizinhas
  const card = useMemo(() => ({ w: 57 * spacing * 0.9, h: 57 * spacing * 0.95 }), [spacing]);
  const cardFontUnits = ((card.h * 0.87 - 1.5) / 10) * 0.86;
  const scroller = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [base, setBase] = useState(800);

  // Largura base: cabe inteira na área visível (largura e altura).
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const cw = el.clientWidth - 32;
      const ch = el.clientHeight - 32;
      setBase(Math.max(280, Math.min(cw, (ch * plan.width) / plan.height)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [plan.width, plan.height]);

  const setZoom = useCallback((z: number) => setPrefs({ zoom: Math.round(Math.min(ZMAX, Math.max(ZMIN, z)) * 100) / 100 }), [setPrefs]);

  // Centraliza a mesa selecionada quando solicitado (busca, localizar).
  useEffect(() => {
    if (!focusRequest) return;
    const el = scroller.current;
    const t = shown.find((x) => x.number === (selected ?? 16));
    if (!el || !t) return;
    const w = base * zoom;
    const h = (w * plan.height) / plan.width;
    const left = 16 + Math.max(0, (el.clientWidth - 32 - w) / 2) + t.x * w - el.clientWidth / 2;
    const top = 16 + t.y * h - el.clientHeight / 2;
    el.scrollTo({ left, top, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  // Ctrl + roda do mouse = zoom
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom(useApp.getState().prefs.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setZoom]);

  // Calibração: arrastar marcadores com o ponteiro (independente do arrastar de convidados)
  const onCalibratePointerDown = useCallback((n: number, e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    e.preventDefault();
    useApp.getState().selectTable(n);
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const inv = ctm.inverse();
    const factor = useApp.getState().prefs.spacing ?? SPACING_ON;
    const t0 = (useApp.getState().calibrationDraft ?? []).find((t) => t.number === n);
    if (!t0) return;
    // mantém o ponto onde a mesa foi "pega" (sem pular para o centro)
    const start = new DOMPoint(e.clientX, e.clientY).matrixTransform(inv);
    const shown0 = spreadPoint(n, t0.x, t0.y, factor);
    const off = { x: shown0.x - start.x / plan.width, y: shown0.y - start.y / plan.height };
    const move = (ev: PointerEvent) => {
      // recalcula a cada movimento: o mapa pode mudar de tamanho durante o arraste
      const m = svg.getScreenCTM();
      const pt = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m ? m.inverse() : inv);
      const dx = clamp01(pt.x / plan.width + off.x);
      const dy = clamp01(pt.y / plan.height + off.y);
      const real = unspreadPoint(n, dx, dy, factor);
      moveDraft(n, Math.round(real.x * 10000) / 10000, Math.round(real.y * 10000) / 10000);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [moveDraft, plan.width, plan.height]);

  const width = base * zoom;
  const pxPerUnit = width / plan.width;
  const showNames = !calibrating && cardFontUnits * pxPerUnit >= NAME_MIN_PX;
  const zoomForNames = 10 / (cardFontUnits * (base / plan.width));

  return (
    <div className={`mapa-area${calibrating ? ' calibrando' : ''}`}>
      <div className="mapa-barra" role="toolbar" aria-label="Ferramentas do mapa">
        <button className="btn icone" onClick={() => setZoom(zoom / 1.2)} aria-label="Reduzir zoom" title="Reduzir zoom"><Minus /></button>
        <span className="zoom-val" aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button className="btn icone" onClick={() => setZoom(zoom * 1.2)} aria-label="Ampliar zoom" title="Ampliar zoom"><Plus /></button>
        <button className="btn" onClick={() => setZoom(1)}><Maximize2 /> Ajustar à tela</button>
        <button
          className="btn"
          aria-pressed={showNames}
          onClick={() => {
            setZoom(showNames ? 1 : zoomForNames);
            // centraliza a mesa aberta (ou a mesa 16, no canto do bloco esquerdo)
            setTimeout(() => selectTable(selected ?? null, true), 60);
          }}
          title="Amplia o mapa até os nomes ficarem legíveis em cada mesa"
          data-testid="ver-nomes"
        >
          <Type /> {showNames ? 'Ver mapa inteiro' : 'Ver nomes nas mesas'}
        </button>
        {!calibrating && (
          <button
            className="btn"
            aria-pressed={spacing > 1}
            onClick={() => setPrefs({ spacing: spacing > 1 ? 1 : SPACING_ON })}
            title="Afasta as mesas no desenho para facilitar a leitura. As posições reais não mudam."
          >
            <MoveHorizontal /> {spacing > 1 ? 'Mesas espaçadas' : 'Espaçar mesas'}
          </button>
        )}
        {selected != null && (
          <button className="btn some-celular" onClick={() => selectTable(selected, true)}><Crosshair /> Centralizar mesa {selected}</button>
        )}
        <div className="fim">
          {!calibrating && (
            <button className="btn fantasma" onClick={() => open({ type: 'plan' })} title="Trocar a imagem da planta">Planta</button>
          )}
          {!calibrating && (
            <button className="btn" onClick={startCalibration} title="Arrastar as mesas para outro lugar do salão">
              <Settings2 /> Mover mesas
            </button>
          )}
        </div>
      </div>
      <div className="mapa-rolagem" ref={scroller}>
        <div className="mapa-folha" style={{ width }}>
          <svg
            ref={svgRef}
            className="mapa-svg"
            viewBox={`0 0 ${plan.width} ${plan.height}`}
            role="group"
            aria-label={`Planta do salão com ${tables.length} mesas`}
            data-testid="mapa-2d"
          >
            <image href={plan.src} x={0} y={0} width={plan.width} height={plan.height} preserveAspectRatio="none" />
            {(spacing > 1 || moved) && !plan.isCustom && TABLE_BLOCK_MASKS.map(([x0, y0, x1, y1], i) => (
              <rect key={i} x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="#ffffff" />
            ))}
            {shown.map((t) => (
              <TableMarker
                key={t.number}
                table={t}
                W={plan.width}
                H={plan.height}
                assignments={assignments}
                guests={guests}
                selected={selected === t.number}
                dimmed={!calibrating && filter !== 'todas' && tableStatus(assignments, t.number) !== filter}
                highlightGuestId={highlight}
                family={family}
                calibrating={calibrating}
                dropDisabled={calibrating}
                onSelect={(n) => selectTable(n)}
                onCalibratePointerDown={onCalibratePointerDown}
                card={showNames ? card : undefined}
              />
            ))}
          </svg>
          {shown.map((t) => <TableDropZone key={t.number} table={t} W={plan.width} disabled={calibrating} sizeUnits={showNames ? card.w : undefined} />)}
        </div>
      </div>
      {!calibrating && <Tip id="mapa">Clique em uma mesa para ver e editar os lugares. Ao ampliar (ou em “Ver nomes nas mesas”), cada mesa mostra os nomes de quem está sentado.</Tip>}
    </div>
  );
}
