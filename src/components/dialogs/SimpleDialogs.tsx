import { ImageUp, MapPin, Move, Pencil, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { compareNames, label, matchesQuery } from '../../domain/guests';
import * as S from '../../domain/seating';
import { RSVP_LABEL } from '../../domain/types';
import { useApp, useSeatIndex } from '../../state/store';
import { confirmAction, useUi, type Dialog } from '../../state/ui';
import { Modal } from '../common/Modal';
import { fileToArrayBuffer } from '../../features/import-export/importGuests';

export function ConfirmDialog({ d }: { d: Extract<Dialog, { type: 'confirm' }> }) {
  const close = useUi((s) => s.close);
  return (
    <Modal
      title={d.title}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close} data-autofocus>Cancelar</button>
          <button className={`btn ${d.danger ? 'perigo-forte' : 'primario'}`} onClick={() => { close(); d.onConfirm(); }} data-testid="confirmar">
            {d.confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{d.body}</p>
    </Modal>
  );
}

/** Soltar um convidado sem lugar em assento ocupado: nunca descarta o ocupante em silêncio. */
export function ReplaceDialog() {
  const p = useApp((s) => s.pendingReplace);
  const guests = useApp((s) => s.seating.guests);
  const confirm = useApp((s) => s.confirmReplace);
  const cancel = useApp((s) => s.cancelReplace);
  if (!p) return null;
  const g = guests[p.guestId], o = guests[p.occupantId];
  if (!g || !o) return null;
  return (
    <Modal
      title="Este lugar já está ocupado"
      subtitle={`Mesa ${p.ref.table}, lugar ${p.ref.seat}`}
      onClose={cancel}
      footer={
        <>
          <button className="btn" onClick={cancel}>Cancelar</button>
          <button className="btn primario" onClick={confirm} data-testid="confirmar-substituir">
            Colocar {label(g)} e devolver {label(o)} à lista
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>
        <b>{o.fullName}</b> está sentado(a) aqui. Se continuar, <b>{g.fullName}</b> ocupa este lugar e {o.fullName} volta para a lista de
        convidados sem lugar — o cadastro não é excluído.
      </p>
    </Modal>
  );
}

export function GuestPicker({ table, seat }: { table: number; seat: number }) {
  const guests = useApp((s) => s.seating.guests);
  const idx = useSeatIndex();
  const drop = useApp((s) => s.dropGuestOnSeat);
  const close = useUi((s) => s.close);
  const open = useUi((s) => s.open);
  const [q, setQ] = useState('');
  const [onlyFree, setOnlyFree] = useState(true);
  const list = useMemo(
    () => Object.values(guests)
      .filter((g) => matchesQuery(g, q) && (!onlyFree || !idx.has(g.id)))
      .sort((a, b) => compareNames(a.fullName, b.fullName))
      .slice(0, 200),
    [guests, q, onlyFree, idx],
  );
  return (
    <Modal title={`Escolher convidado`} subtitle={`Mesa ${table}, lugar ${seat}`} onClose={close}>
      <input className="entrada" placeholder="Digite parte do nome…" value={q} onChange={(e) => setQ(e.target.value)} data-autofocus aria-label="Buscar convidado" />
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
        <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} /> Mostrar somente quem ainda não tem lugar
      </label>
      <div className="lista-escolha" role="listbox" aria-label="Convidados">
        {list.length === 0 && <div className="vazio" style={{ padding: 16 }}>Ninguém encontrado.</div>}
        {list.map((g) => {
          const s = idx.get(g.id);
          return (
            <button key={g.id} role="option" aria-selected={false} onClick={() => { close(); drop(g.id, { table, seat }); }}>
              <span>{g.fullName}{g.group ? <small style={{ color: 'var(--suave)' }}> — {g.group}</small> : null}</span>
              <span className={`lugar-tag${s ? '' : ' sem'}`}>{s ? `Mesa ${s.table} · ${s.seat}` : 'Sem lugar'}</span>
            </button>
          );
        })}
      </div>
      <button className="btn" onClick={() => open({ type: 'guest-form', presetSeat: { table, seat } })}>Cadastrar novo convidado neste lugar</button>
    </Modal>
  );
}

export function GuestDetails({ guestId }: { guestId: string }) {
  const g = useApp((s) => s.seating.guests[guestId]);
  const seating = useApp((s) => s.seating);
  const pick = useApp((s) => s.pickGuest);
  const locate = useApp((s) => s.locateGuest);
  const close = useUi((s) => s.close);
  const open = useUi((s) => s.open);
  if (!g) return null;
  const seat = S.seatOf(seating, guestId);
  return (
    <Modal title={g.fullName} subtitle={seat ? `Mesa ${seat.table}, lugar ${seat.seat}` : 'Ainda sem lugar'} onClose={close}
      footer={
        <>
          <button className="btn" onClick={() => open({ type: 'guest-form', guestId })}><Pencil /> Editar</button>
          {seat ? (
            <button className="btn primario" onClick={() => { close(); locate(guestId); }}><MapPin /> Mostrar no mapa</button>
          ) : (
            <button className="btn primario" onClick={() => { close(); pick(guestId); }} data-testid="escolher-mesa"><Move /> Escolher mesa e lugar</button>
          )}
        </>
      }
    >
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 14 }}>
        <dt>Nome de exibição</dt><dd style={{ margin: 0 }}>{label(g)}</dd>
        <dt>Família/grupo</dt><dd style={{ margin: 0 }}>{g.group || '—'}</dd>
        <dt>Acompanhante</dt><dd style={{ margin: 0 }}>{g.companion || '—'}</dd>
        <dt>Presença</dt><dd style={{ margin: 0 }}>{RSVP_LABEL[g.rsvp]}</dd>
        <dt>Observações</dt><dd style={{ margin: 0 }}>{g.notes || '—'}</dd>
      </dl>
    </Modal>
  );
}

export function HelpDialog() {
  const close = useUi((s) => s.close);
  return (
    <Modal title="Como usar" onClose={close} wide footer={<button className="btn primario" onClick={close}>Fechar</button>}>
      <div className="ajuda">
        <h3>1. Traga a lista de convidados</h3>
        <p>Clique em <b>Importar convidados</b> e escolha o arquivo do Excel (.xlsx, .xls) ou .csv. No Google Planilhas, use Arquivo → Fazer download → Microsoft Excel ou CSV. Você confere a prévia antes de confirmar.</p>
        <h3>2. Distribua nas mesas</h3>
        <p>Arraste um nome da lista até uma mesa no mapa (ele ocupa o primeiro lugar livre) ou abra a mesa e solte no lugar exato. Soltar sobre alguém já sentado troca as duas pessoas de lugar.</p>
        <p>Sem mouse ou no celular: toque no ícone de mover ao lado do nome, depois na mesa e no lugar desejado.</p>
        <h3>3. Ajuste e confira</h3>
        <p>Use a busca no topo para achar qualquer pessoa. Os indicadores e os filtros mostram mesas vazias, parciais e completas. Desfazer: Ctrl+Z (⌘Z no Mac). Refazer: Ctrl+Shift+Z.</p>
        <h3>Onde ficam os dados</h3>
        <p>Tudo é salvo automaticamente <b>neste navegador, neste computador</b>. Não há sincronização entre aparelhos. Use <b>Backup</b> para guardar uma cópia em arquivo e para levar os dados a outro computador.</p>
        <h3>Planta e posições</h3>
        <p>As mesas foram posicionadas sobre a planta original. Para mudar alguma de lugar, use <b>Mover mesas</b> (barra do mapa) — fica separado da organização para não ser ativado sem querer.</p>
        <h3>Visualização 3D</h3>
        <p>O modelo 3D é esquemático: proporções estimadas a partir da planta (a pista de 8 m × 6 m serve de escala). Arraste para girar, use a roda para aproximar e clique em uma mesa para abri-la.</p>
      </div>
    </Modal>
  );
}

export function PlanDialog() {
  const close = useUi((s) => s.close);
  const custom = useApp((s) => s.layout.customPlan);
  const setPlan = useApp((s) => s.setCustomPlan);
  const toast = useApp((s) => s.toast);
  const [err, setErr] = useState('');
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { setErr('Use uma imagem PNG, JPG ou WEBP.'); return; }
    if (f.size > 8_000_000) { setErr('Imagem muito grande (máximo 8 MB).'); return; }
    const buf = await fileToArrayBuffer(f);
    let bin = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    setPlan(`data:${f.type};base64,${btoa(bin)}`);
    toast('ok', 'Planta trocada. Confira as posições das mesas em “Mover mesas”.');
    close();
  };
  return (
    <Modal title="Imagem da planta" onClose={close} footer={<button className="btn" onClick={close}>Fechar</button>}>
      <p style={{ margin: 0 }}>
        O organizador já vem com a planta original do salão. Troque somente se receber uma versão atualizada da planta; as mesas mantêm as
        coordenadas relativas e podem ser corrigidas em “Mover mesas”.
      </p>
      {err && <div className="aviso erro">{err}</div>}
      <label className="btn primario" style={{ alignSelf: 'flex-start' }}>
        <ImageUp /> Escolher nova imagem
        <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>
      {custom && (
        <button
          className="btn"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => confirmAction({ title: 'Voltar para a planta original?', body: 'A imagem personalizada será removida.', confirmLabel: 'Usar planta original', onConfirm: () => setPlan(undefined) })}
        >
          <RotateCcw /> Usar a planta original
        </button>
      )}
    </Modal>
  );
}

/** Mesa lotada: escolher quem sai para abrir lugar (nunca exclui cadastro). */
export function FullTableDialog() {
  const p = useApp((s) => s.pendingFull);
  const seating = useApp((s) => s.seating);
  const resolve = useApp((s) => s.resolveFull);
  const cancel = useApp((s) => s.cancelFull);
  if (!p) return null;
  const g = seating.guests[p.guestId];
  if (!g) return null;
  const from = S.seatOf(seating, p.guestId);
  const occupants = S.seatNumbers()
    .map((n) => ({ n, id: seating.assignments[S.seatKey(p.table, n)] }))
    .filter((o): o is { n: number; id: string } => !!o.id && !!seating.guests[o.id]);
  return (
    <Modal
      title={`A mesa ${p.table} está lotada`}
      subtitle={`Para colocar ${label(g)}, escolha quem sai da mesa.`}
      onClose={cancel}
      footer={<button className="btn" onClick={cancel}>Cancelar</button>}
    >
      <p style={{ margin: 0, fontSize: 14 }}>
        {from
          ? <>“<b>Trocar</b>” leva a pessoa escolhida para o lugar atual de {label(g)} (mesa {from.table}, lugar {from.seat}). “<b>Tirar</b>” devolve a pessoa para a lista de convidados sem lugar.</>
          : <>A pessoa escolhida volta para a lista de convidados sem lugar. O cadastro dela não é excluído.</>}
      </p>
      <div className="lista-escolha" role="list" data-testid="lista-mesa-lotada">
        {occupants.map(({ n, id }) => {
          const o = seating.guests[id];
          return (
            <div key={id} role="listitem" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #eee8db' }}>
              <span style={{ fontFamily: 'var(--serif)', fontWeight: 700, width: 22, color: 'var(--suave)' }}>{n}</span>
              <span style={{ flex: 1 }}>{o.fullName}{o.group ? <small style={{ color: 'var(--suave)' }}> — {o.group}</small> : null}</span>
              {from && (
                <button className="btn pequeno" onClick={() => resolve(id, 'trocar')} aria-label={`Trocar ${label(g)} com ${o.fullName}`}>Trocar</button>
              )}
              <button className="btn pequeno primario" onClick={() => resolve(id, 'tirar')} aria-label={`Tirar ${o.fullName} da mesa`}>Tirar</button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

/** Trocar todos os convidados de uma mesa com outra (ou mudar o grupo para mesa vazia). */
export function SwapTableDialog({ table }: { table: number }) {
  const seating = useApp((s) => s.seating);
  const apply = useApp((s) => s.apply);
  const selectTable = useApp((s) => s.selectTable);
  const close = useUi((s) => s.close);
  const n = S.tableOccupancy(seating.assignments, table);
  return (
    <Modal
      title={`Trocar a mesa ${table} inteira`}
      subtitle={`Escolha a mesa de destino. Os ${n} convidado(s) da mesa ${table} vão para ela, e quem estiver lá vem para a mesa ${table}, cada um no mesmo número de lugar.`}
      onClose={close}
      wide
      footer={<button className="btn" onClick={close}>Cancelar</button>}
    >
      <div className="grade-mesas" role="list" data-testid="destinos-mesa">
        {S.tableNumbers().filter((t) => t !== table).map((t) => {
          const k = S.tableOccupancy(seating.assignments, t);
          const first = S.seatNumbers().map((s) => seating.guests[seating.assignments[S.seatKey(t, s)] ?? ''])
            .filter(Boolean).slice(0, 2).map((g) => label(g!)).join(', ');
          return (
            <button
              key={t}
              role="listitem"
              className="destino-mesa"
              aria-label={`Trocar com a mesa ${t} (${k} de 10)`}
              onClick={() => {
                if (apply(S.swapTables(seating, table, t), 'Trocar mesa inteira')) { close(); selectTable(t, true); }
              }}
            >
              <b>Mesa {t}</b>
              <span className={`selo ${k === 10 ? 'completa' : k ? 'parcial' : ''}`}>{k === 0 ? 'vazia' : `${k}/10`}</span>
              <small>{k ? `${first}${k > 2 ? '…' : ''}` : 'grupo só muda de mesa'}</small>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
