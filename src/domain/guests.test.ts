import { describe, expect, it } from 'vitest';
import { areNamesSimilar, normalizeName, parseRsvp } from './guests';

describe('nomes', () => {
  it('normaliza acentos só para comparação', () => {
    expect(normalizeName('  Conceição  Antônio ')).toBe('conceicao antonio');
  });
  it('detecta nomes iguais e muito parecidos', () => {
    expect(areNamesSimilar('José Silva', 'jose silva')).toBe(true);
    expect(areNamesSimilar('Ana Júlia Souza', 'Ana Julia Sousa')).toBe(true);
    expect(areNamesSimilar('Ana', 'Ane')).toBe(false);
    expect(areNamesSimilar('João Pedro', 'Maria Clara')).toBe(false);
  });
  it('interpreta presença', () => {
    expect(parseRsvp('Sim')).toBe('confirmado');
    expect(parseRsvp('Confirmado')).toBe('confirmado');
    expect(parseRsvp('Não')).toBe('recusado');
    expect(parseRsvp('')).toBe('pendente');
    expect(parseRsvp('talvez')).toBe('pendente');
  });
});

import { defaultTables } from '../data/floorplan';
import { SPACING_ON, spreadTables } from './layout';
describe('espaçamento visual', () => {
  it('afasta as mesas sem alterar as coordenadas originais', () => {
    const t = defaultTables();
    const s = spreadTables(t, SPACING_ON);
    expect(t[0]).toEqual(defaultTables()[0]);
    const d = (a: typeof t, i: number, j: number) => Math.hypot(a[i].x - a[j].x, a[i].y - a[j].y);
    // mesas 13 e 14 (índices 12 e 13) ficam mais distantes
    expect(d(s, 12, 13)).toBeCloseTo(d(t, 12, 13) * SPACING_ON, 5);
    expect(spreadTables(t, 1)).toBe(t);
  });
});
