/**
 * Visualização 3D esquemática do salão (React Three Fiber).
 * Usa a MESMA fonte de dados do 2D: posições das mesas (layout) e distribuição (seating).
 * Escala estimada pela pista (8 m ≈ 134 px da planta). Não representa medidas reais.
 */
import { Html, OrbitControls } from '@react-three/drei';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { Eye, RotateCcw, Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  HALL_OUTLINE, PLAN_ELEMENTS, PLAN_WALLS, PX_PER_METER, RECT_TABLE_H, RECT_TABLE_W,
  ROUND_TABLE_RADIUS, SEAT_RING_RADIUS,
} from '../../data/floorplan';
import { label } from '../../domain/guests';
import { seatOffsets } from '../../domain/layout';
import { seatKey } from '../../domain/seating';
import type { TableDef } from '../../domain/types';
import { useApp } from '../../state/store';
import { usePlan } from '../seating-map/usePlan';

const CX = (HALL_OUTLINE.x0 + HALL_OUTLINE.x1) / 2;
const CY = (HALL_OUTLINE.y0 + HALL_OUTLINE.y1) / 2;
const m = (px: number) => px / PX_PER_METER;
const toWorld = (px: number, py: number): [number, number] => [m(px - CX), m(py - CY)];

const COLORS = { livre: '#f4efe3', ocupado: '#6f8a6b', destaque: '#c9a24e', mesa: '#fbf8f1', mesaSel: '#f1e2b8' };

function Floor({ W, H, src }: { W: number; H: number; src: string }) {
  const texture = useMemo(() => {
    const t = new THREE.TextureLoader().load(src);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [src]);
  const [cx, cz] = toWorld(W / 2, H / 2);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[cx, -0.01, cz]} receiveShadow>
        <planeGeometry args={[m(W), m(H)]} />
        <meshStandardMaterial map={texture} transparent opacity={0.55} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[m(HALL_OUTLINE.x1 - HALL_OUTLINE.x0), m(HALL_OUTLINE.y1 - HALL_OUTLINE.y0)]} />
        <meshStandardMaterial color="#efe8d8" />
      </mesh>
    </group>
  );
}

function Walls() {
  return (
    <group>
      {PLAN_WALLS.map(([x0, y0, x1, y1], i) => {
        const [ax, az] = toWorld(x0, y0);
        const [bx, bz] = toWorld(x1, y1);
        const len = Math.hypot(bx - ax, bz - az);
        const ang = Math.atan2(bz - az, bx - ax);
        return (
          <mesh key={i} position={[(ax + bx) / 2, 1.2, (az + bz) / 2]} rotation-y={-ang} castShadow>
            <boxGeometry args={[len + 0.25, 2.4, 0.25]} />
            <meshStandardMaterial color="#5a564c" />
          </mesh>
        );
      })}
    </group>
  );
}

function Elements() {
  return (
    <group>
      {PLAN_ELEMENTS.map((e) => {
        const [x, z] = toWorld((e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2);
        const w = m(e.x1 - e.x0), d = m(e.y1 - e.y0);
        return (
          <group key={e.id} position={[x, 0, z]}>
            <mesh position-y={e.height / 2} castShadow={e.kind === 'block'} receiveShadow>
              <boxGeometry args={[w, e.height, d]} />
              <meshStandardMaterial color={e.color} transparent={e.kind === 'zone'} opacity={e.kind === 'zone' ? 0.7 : 1} />
            </mesh>
            <Html position={[0, e.height + 0.35, 0]} center distanceFactor={22} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
              <div style={{ fontSize: 13, fontFamily: 'Jost, sans-serif', color: '#2b2b26', background: 'rgba(255,255,255,.75)', padding: '1px 6px', borderRadius: 6, whiteSpace: 'nowrap' }}>{e.label}</div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

function Table3D({ t, W, H }: { t: TableDef; W: number; H: number }) {
  const assignments = useApp((s) => s.seating.assignments);
  const guests = useApp((s) => s.seating.guests);
  const selected = useApp((s) => s.selectedTable === t.number);
  const highlight = useApp((s) => s.highlightGuestId);
  const family = useApp((s) => s.familyHighlight);
  const selectTable = useApp((s) => s.selectTable);
  const [hover, setHover] = useState(false);
  const [x, z] = toWorld(t.x * W, t.y * H);
  const seats = seatOffsets(t.shape, t.seatRotation, SEAT_RING_RADIUS, RECT_TABLE_W, RECT_TABLE_H, t.seats);
  const ids = Array.from({ length: t.seats }, (_, i) => assignments[seatKey(t.number, i + 1)]);
  const n = ids.filter(Boolean).length;

  const onClick = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); selectTable(selected ? null : t.number); };

  return (
    <group position={[x, 0, z]}>
      <group
        onClick={onClick}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = ''; }}
      >
        {t.shape === 'round' ? (
          <mesh position-y={0.74} castShadow>
            <cylinderGeometry args={[m(ROUND_TABLE_RADIUS), m(ROUND_TABLE_RADIUS), 0.06, 40]} />
            <meshStandardMaterial color={selected ? COLORS.mesaSel : COLORS.mesa} />
          </mesh>
        ) : (
          <mesh position-y={0.74} castShadow>
            <boxGeometry args={[m(RECT_TABLE_W), 0.06, m(RECT_TABLE_H)]} />
            <meshStandardMaterial color={selected ? COLORS.mesaSel : COLORS.mesa} />
          </mesh>
        )}
        {/* toalha até o chão */}
        {t.shape === 'round' ? (
          <mesh position-y={0.37}>
            <cylinderGeometry args={[m(ROUND_TABLE_RADIUS) * 0.98, m(ROUND_TABLE_RADIUS) * 1.04, 0.72, 40, 1, true]} />
            <meshStandardMaterial color="#efe7d6" side={THREE.DoubleSide} />
          </mesh>
        ) : (
          <mesh position-y={0.37}>
            <boxGeometry args={[m(RECT_TABLE_W) * 0.98, 0.72, m(RECT_TABLE_H) * 0.98]} />
            <meshStandardMaterial color="#efe7d6" />
          </mesh>
        )}
        {seats.map(({ seat, dx, dy }) => {
          const gid = ids[seat - 1];
          const hi = !!gid && (gid === highlight || (!!family && guests[gid]?.group === family));
          const ang = Math.atan2(dy, dx);
          return (
            <group key={seat} position={[m(dx), 0, m(dy)]} rotation-y={-ang - Math.PI / 2}>
              <mesh position-y={0.23} castShadow>
                <boxGeometry args={[0.42, 0.06, 0.42]} />
                <meshStandardMaterial color={hi ? COLORS.destaque : gid ? COLORS.ocupado : COLORS.livre} />
              </mesh>
              <mesh position={[0, 0.5, 0.19]} castShadow>
                <boxGeometry args={[0.42, 0.5, 0.05]} />
                <meshStandardMaterial color={hi ? COLORS.destaque : gid ? COLORS.ocupado : COLORS.livre} />
              </mesh>
            </group>
          );
        })}
        {selected && (
          <mesh rotation-x={-Math.PI / 2} position-y={0.01}>
            <ringGeometry args={[m(SEAT_RING_RADIUS) + 0.45, m(SEAT_RING_RADIUS) + 0.65, 48]} />
            <meshBasicMaterial color="#a88a4a" />
          </mesh>
        )}
      </group>
      <Html position={[0, 1.15, 0]} center distanceFactor={20} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div style={{
          fontFamily: 'Cormorant Garamond, serif', fontWeight: 700, fontSize: 22, lineHeight: 1, textAlign: 'center',
          color: n >= t.seats ? '#fff' : '#2b2b26', background: n >= t.seats ? '#4e6550' : 'rgba(255,255,255,.85)',
          borderRadius: 999, padding: '3px 9px', border: selected ? '2px solid #a88a4a' : '1px solid #ddd4c1', whiteSpace: 'nowrap',
        }}>
          {t.number}<span style={{ fontFamily: 'Jost, sans-serif', fontSize: 12, fontWeight: 500, marginLeft: 5 }}>{n}/{t.seats}</span>
        </div>
      </Html>
      {(selected || hover) && (
        <Html position={[0, 2.1, 0]} center distanceFactor={16} zIndexRange={[30, 20]}>
          <div className="rotulo3d">
            <strong>Mesa {t.number}</strong> — {n} de {t.seats}
            <ol>
              {ids.map((id, i) => <li key={i} style={{ color: id ? undefined : '#999' }}>{id && guests[id] ? label(guests[id]) : 'livre'}</li>)}
            </ol>
          </div>
        </Html>
      )}
    </group>
  );
}

type View = 'inicial' | 'topo' | 'perspectiva';

function CameraRig({ view, nonce, controls }: { view: View; nonce: number; controls: React.RefObject<OrbitControlsImpl> }) {
  const { camera } = useThree();
  useEffect(() => {
    const target = new THREE.Vector3(0, 0, 0);
    const pos =
      view === 'topo' ? new THREE.Vector3(0, 52, 0.01)
      : view === 'perspectiva' ? new THREE.Vector3(-26, 16, 26)
      : new THREE.Vector3(0, 40, 34);
    camera.position.copy(pos);
    camera.lookAt(target);
    controls.current?.target.copy(target);
    controls.current?.update();
  }, [view, nonce, camera, controls]);
  return null;
}

/** Ponte para testes automatizados: projeta o centro de uma mesa na tela. */
function TestBridge({ W, H }: { W: number; H: number }) {
  const { camera, size, gl } = useThree();
  const tables = useApp((s) => s.layout.tables);
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__mesa3d = (n: number) => {
      const t = tables.find((x) => x.number === n);
      if (!t) return null;
      const [x, z] = toWorld(t.x * W, t.y * H);
      const v = new THREE.Vector3(x, 0.74, z).project(camera);
      const r = gl.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * size.width, y: r.top + ((1 - v.y) / 2) * size.height };
    };
  }, [camera, size, gl, tables, W, H]);
  return null;
}

export default function Hall3D() {
  const plan = usePlan();
  const tables = useApp((s) => s.layout.tables);
  const selectTable = useApp((s) => s.selectTable);
  const controls = useRef<OrbitControlsImpl>(null);
  const [view, setView] = useState<View>('inicial');
  const [nonce, setNonce] = useState(0);
  const go = (v: View) => { setView(v); setNonce((k) => k + 1); };

  return (
    <div className="mapa-area">
      <div className="mapa-barra" role="toolbar" aria-label="Câmera 3D">
        <button className="btn" onClick={() => go('topo')} aria-pressed={view === 'topo'}><Square /> Vista de cima</button>
        <button className="btn" onClick={() => go('perspectiva')} aria-pressed={view === 'perspectiva'}><Eye /> Perspectiva</button>
        <button className="btn" onClick={() => go('inicial')}><RotateCcw /> Restaurar visão inicial</button>
        <span className="nota some-celular" style={{ margin: 0 }}>Arraste para girar · roda para aproximar · botão direito (ou dois dedos) para mover</span>
      </div>
      <div className="cena" data-testid="cena-3d">
        <Canvas shadows camera={{ fov: 45, position: [0, 40, 34], near: 0.1, far: 500 }} onPointerMissed={() => selectTable(null)} dpr={[1, 2]}>
          <color attach="background" args={['#f1ece0']} />
          <hemisphereLight args={['#ffffff', '#d8ccb0', 0.9]} />
          <directionalLight position={[18, 30, 12]} intensity={1.3} castShadow shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-35} shadow-camera-right={35} shadow-camera-top={25} shadow-camera-bottom={-25} />
          <Floor W={plan.width} H={plan.height} src={plan.src} />
          <Walls />
          <Elements />
          {tables.map((t) => <Table3D key={t.number} t={t} W={plan.width} H={plan.height} />)}
          <OrbitControls ref={controls} makeDefault maxPolarAngle={Math.PI / 2.05} minDistance={6} maxDistance={110} />
          <CameraRig view={view} nonce={nonce} controls={controls} />
          <TestBridge W={plan.width} H={plan.height} />
        </Canvas>
        <div className="legenda3d">
          Modelo esquemático: proporções estimadas a partir da planta (pista 8 m × 6 m como escala). Cadeiras verdes estão ocupadas; douradas, destacadas.
        </div>
      </div>
    </div>
  );
}
