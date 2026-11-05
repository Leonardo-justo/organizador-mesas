/**
 * Página do cerimonialista: um único arquivo HTML, só leitura, que funciona sem
 * internet no celular. Busca por nome (sem acentos) e mostra mesa e lugar.
 * Contém apenas nome, mesa, lugar e presença — sem telefones nem observações.
 */
import { compareNames, label } from '../../domain/guests';
import { buildGuestSeatIndex, seatKey, seatNumbers, tableNumbers } from '../../domain/seating';
import type { SeatingState } from '../../domain/types';

interface Entry { n: string; a?: string; m: number | null; l: number | null }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function ceremonialEntries(state: SeatingState, includeUnseated: boolean): Entry[] {
  const idx = buildGuestSeatIndex(state.assignments);
  return Object.values(state.guests)
    .filter((g) => idx.has(g.id) || (includeUnseated && g.rsvp !== 'recusado'))
    .sort((a, b) => compareNames(a.fullName, b.fullName))
    .map((g) => {
      const s = idx.get(g.id);
      const shown = label(g);
      return { n: g.fullName, a: shown !== g.fullName ? shown : undefined, m: s?.table ?? null, l: s?.seat ?? null };
    });
}

export function ceremonialHtml(state: SeatingState, title: string, includeUnseated = false, now = new Date()): string {
  const entries = ceremonialEntries(state, includeUnseated);
  const tables = tableNumbers().map((t) => ({
    t,
    g: seatNumbers(t).map((s) => state.guests[state.assignments[seatKey(t, s)] ?? '']?.fullName ?? ''),
  })).filter((x) => x.g.some(Boolean));
  const stamp = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(now);
  const data = JSON.stringify({ e: entries, t: tables }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Mesas</title>
<style>
:root{--bg:#f7f4ec;--card:#fff;--tx:#2b2b26;--mut:#7a766a;--ln:#ddd4c1;--ac:#4e6550;--go:#a88a4a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
header{position:sticky;top:0;background:var(--bg);padding:14px 16px 10px;border-bottom:1px solid var(--ln);z-index:2}
h1{font:600 22px Georgia,serif;margin:0 0 2px}.sub{color:var(--mut);font-size:13px;margin:0 0 10px}
input{width:100%;font-size:18px;padding:12px 14px;border:1.5px solid var(--ln);border-radius:10px;background:#fff}
input:focus{outline:2px solid var(--go);border-color:var(--go)}
.tabs{display:flex;gap:6px;margin-top:10px}.tabs button{flex:1;padding:8px;border:1px solid var(--ln);border-radius:8px;background:#fff;font-size:14px}
.tabs button[aria-pressed=true]{background:var(--tx);color:#fff;border-color:var(--tx)}
main{padding:8px 12px 40px;max-width:720px;margin:0 auto}
.r{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--ln);border-radius:10px;padding:10px 12px;margin:6px 0}
.r .nm{flex:1;min-width:0}.r .nm b{display:block;font-weight:600;overflow-wrap:anywhere}.r .nm small{color:var(--mut)}
.mesa{min-width:70px;text-align:center;background:var(--ac);color:#fff;border-radius:8px;padding:4px 8px;line-height:1.1}
.mesa b{display:block;font:700 24px Georgia,serif}.mesa small{font-size:11px;opacity:.9}
.sem{background:#ede6d6;color:var(--mut)}
.t{background:var(--card);border:1px solid var(--ln);border-radius:10px;padding:8px 12px;margin:8px 0}
.t h2{font:700 19px Georgia,serif;margin:0 0 4px}.t ol{margin:0;padding-left:22px}.t li{padding:2px 0}
.vz{color:var(--mut);text-align:center;padding:24px}
@media print{header input,.tabs{display:none}header{position:static}.r,.t{break-inside:avoid}}
</style>
</head>
<body>
<header>
  <h1>${esc(title)}</h1>
  <p class="sub">Consulta de mesas · atualizado em ${esc(stamp)} · ${entries.filter((e) => e.m).length} convidados com mesa</p>
  <input id="q" type="search" placeholder="Digite o nome do convidado…" autocomplete="off" autofocus aria-label="Buscar convidado">
  <div class="tabs"><button id="bn" aria-pressed="true">Por nome</button><button id="bm" aria-pressed="false">Por mesa</button></div>
</header>
<main id="out"></main>
<script>
const D=${data};
const norm=s=>s.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let modo='n';const out=document.getElementById('out'),q=document.getElementById('q');
function render(){const t=norm(q.value.trim());
 if(modo==='n'){const l=D.e.filter(e=>!t||norm(e.n+' '+(e.a||'')).includes(t));
  out.innerHTML=l.length?l.map(e=>'<div class="r"><div class="nm"><b>'+esc(e.n)+'</b>'+(e.a?'<small>'+esc(e.a)+'</small>':'')+'</div>'+(e.m?'<div class="mesa"><b>'+e.m+'</b><small>lugar '+e.l+'</small></div>':'<div class="mesa sem"><small>sem mesa</small></div>')+'</div>').join(''):'<p class="vz">Nenhum convidado encontrado.</p>';}
 else{const l=D.t.filter(x=>!t||String(x.t)===t||x.g.some(n=>norm(n).includes(t)));
  out.innerHTML=l.map(x=>'<div class="t"><h2>Mesa '+x.t+'</h2><ol>'+x.g.map(n=>'<li>'+(n?esc(n):'<span style="color:#aaa">livre</span>')+'</li>').join('')+'</ol></div>').join('')||'<p class="vz">Nada encontrado.</p>';}}
q.addEventListener('input',render);
document.getElementById('bn').onclick=()=>{modo='n';bn.setAttribute('aria-pressed','true');bm.setAttribute('aria-pressed','false');render()};
document.getElementById('bm').onclick=()=>{modo='m';bm.setAttribute('aria-pressed','true');bn.setAttribute('aria-pressed','false');render()};
render();
</script>
</body>
</html>`;
}
