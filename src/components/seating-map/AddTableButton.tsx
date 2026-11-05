import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../state/store';

/** “+ Mesa”: adiciona uma mesa de 10 lugares (redonda ou retangular) e já salva. */
export function AddTableButton({ label = 'Mesa', goToMap = true }: { label?: string; goToMap?: boolean }) {
  const addTableNow = useApp((s) => s.addTableNow);
  const [open, setOpen] = useState(false);
  const [seats, setSeats] = useState(10);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);
  const add = (shape: 'round' | 'rect') => { setOpen(false); addTableNow(shape, seats, goToMap); };
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button className="btn" aria-expanded={open} onClick={() => setOpen((o) => !o)} title="Adicionar uma nova mesa" data-testid="adicionar-mesa">
        <Plus /> {label}
      </button>
      {open && (
        <div role="menu" className="menu-mesa"
          style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 30, background: 'var(--superficie, #fff)', border: '1px solid var(--linha, #ddd)', borderRadius: 10, padding: 10, boxShadow: '0 8px 24px rgba(0,0,0,.15)', display: 'grid', gap: 8, minWidth: 220 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            Lugares
            <input type="number" min={1} max={16} value={seats} onChange={(e) => setSeats(Math.min(16, Math.max(1, Number(e.target.value) || 10)))} style={{ width: 64 }} data-testid="nova-mesa-lugares" />
          </label>
          <button className="btn primario" role="menuitem" onClick={() => add('round')} data-testid="nova-mesa-redonda">Mesa redonda</button>
          <button className="btn" role="menuitem" onClick={() => add('rect')} data-testid="nova-mesa-retangular">Mesa retangular</button>
          <small style={{ color: 'var(--texto-suave, #777)' }}>{goToMap ? 'Já fica salva e aparece no canto do mapa; arraste para o lugar certo.' : 'Entra no fim da lista de mesas. Posicione depois no mapa 2D.'}</small>
        </div>
      )}
    </span>
  );
}
