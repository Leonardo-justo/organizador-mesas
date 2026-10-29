import { Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { compareNames, label, matchesQuery, normalizeName } from '../../domain/guests';
import { RSVP_LABEL } from '../../domain/types';
import { useApp, useSeatIndex } from '../../state/store';
import { useUi } from '../../state/ui';

/** Busca global: seleciona a mesa, destaca o assento e centraliza o mapa. */
export function SearchBox() {
  const guests = useApp((s) => s.seating.guests);
  const idx = useSeatIndex();
  const locate = useApp((s) => s.locateGuest);
  const pick = useApp((s) => s.pickGuest);
  const openDialog = useUi((s) => s.open);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    if (!normalizeName(q)) return [];
    const nq = normalizeName(q);
    return Object.values(guests)
      .filter((g) => matchesQuery(g, q))
      .sort((a, b) => {
        const sa = normalizeName(a.fullName).startsWith(nq) ? 0 : 1;
        const sb = normalizeName(b.fullName).startsWith(nq) ? 0 : 1;
        return sa - sb || compareNames(a.fullName, b.fullName);
      })
      .slice(0, 12);
  }, [guests, q]);

  const choose = (id: string) => {
    setOpen(false);
    setQ('');
    inputRef.current?.blur();
    if (idx.has(id)) locate(id);
    else openDialog({ type: 'guest-details', guestId: id });
  };

  return (
    <div className="busca" role="combobox" aria-expanded={open && results.length > 0} aria-haspopup="listbox" aria-owns="busca-resultados">
      <Search aria-hidden />
      <input
        ref={inputRef}
        className="entrada"
        type="search"
        placeholder="Buscar convidado pelo nome…"
        aria-label="Buscar convidado"
        aria-autocomplete="list"
        aria-controls="busca-resultados"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Enter' && results[active]) choose(results[active].id);
          if (e.key === 'Escape') { setQ(''); setOpen(false); }
        }}
      />
      {open && normalizeName(q) && (
        <div className="resultados" id="busca-resultados" role="listbox">
          {results.length === 0 && <div className="vazio" style={{ padding: 14 }}>Nenhum convidado encontrado para “{q}”.</div>}
          {results.map((g, i) => {
            const s = idx.get(g.id);
            return (
              <div
                key={g.id}
                role="option"
                aria-selected={i === active}
                className="resultado"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(g.id)}
                onMouseEnter={() => setActive(i)}
              >
                <span className="nome">{g.fullName}{label(g) !== g.fullName ? ` (${label(g)})` : ''}</span>
                <span className="meta">{[g.group || 'Sem família/grupo', RSVP_LABEL[g.rsvp]].join(' · ')}</span>
                <span className="onde">
                  {s ? (
                    <span className="lugar-tag">Mesa {s.table} · lugar {s.seat}</span>
                  ) : (
                    <button
                      className="btn pequeno"
                      onClick={(e) => { e.stopPropagation(); setOpen(false); setQ(''); pick(g.id); }}
                    >
                      Sem lugar · escolher mesa
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
