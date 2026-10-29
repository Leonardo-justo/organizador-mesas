import type { Guest, Rsvp } from './types';

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Remove acentos, caixa e espaços extras — somente para comparação; o nome original é preservado. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanText(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s).normalize('NFC').replace(/\s+/g, ' ').trim();
}

export function label(g: Guest): string {
  return g.displayName?.trim() || g.fullName;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Nomes iguais (ignorando acentos/caixa) ou muito parecidos (até 2 letras de diferença). */
export function areNamesSimilar(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (Math.min(na.length, nb.length) < 6) return false;
  return levenshtein(na, nb) <= 2;
}

export function findSimilar(name: string, guests: Guest[], ignoreId?: string): Guest[] {
  return guests.filter((g) => g.id !== ignoreId && areNamesSimilar(g.fullName, name));
}

export function parseRsvp(v: unknown): Rsvp {
  const s = normalizeName(cleanText(v));
  if (!s) return 'pendente';
  if (/^(sim|s|confirmad[oa]s?|confirmou|ok|x|yes|y|vai|vou|presente|1|true)$/.test(s)) return 'confirmado';
  if (/^(nao|n|nao vai|nao ira|nao comparecera|recusou|recusad[oa]|no|ausente|0|false|declinou)$/.test(s)) return 'recusado';
  if (s.startsWith('confirm')) return 'confirmado';
  if (s.startsWith('nao')) return 'recusado';
  return 'pendente';
}

export function createGuest(input: Partial<Guest> & { fullName: string }): Guest {
  const opt = (v?: string) => {
    const c = cleanText(v ?? '');
    return c ? c : undefined;
  };
  return {
    id: input.id ?? newId(),
    fullName: cleanText(input.fullName),
    displayName: opt(input.displayName),
    group: opt(input.group),
    companion: opt(input.companion),
    notes: input.notes?.trim() ? input.notes.trim() : undefined,
    rsvp: input.rsvp ?? 'pendente',
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });
export const compareNames = (a: string, b: string) => collator.compare(a, b);

export function matchesQuery(g: Guest, q: string): boolean {
  const nq = normalizeName(q);
  if (!nq) return true;
  return normalizeName(`${g.fullName} ${g.displayName ?? ''} ${g.group ?? ''}`).includes(nq);
}
