import { Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { compareNames, createGuest, findSimilar } from '../../domain/guests';
import * as S from '../../domain/seating';
import type { Rsvp } from '../../domain/types';
import { useApp } from '../../state/store';
import { confirmAction, useUi } from '../../state/ui';
import { Modal } from '../common/Modal';

export function GuestForm({ guestId, presetSeat }: { guestId?: string; presetSeat?: { table: number; seat: number } }) {
  const seating = useApp((s) => s.seating);
  const apply = useApp((s) => s.apply);
  const close = useUi((s) => s.close);
  const existing = guestId ? seating.guests[guestId] : undefined;
  const [fullName, setFullName] = useState(existing?.fullName ?? '');
  const [displayName, setDisplayName] = useState(existing?.displayName ?? '');
  const [group, setGroup] = useState(existing?.group ?? '');
  const [companion, setCompanion] = useState(existing?.companion ?? '');
  const [rsvp, setRsvp] = useState<Rsvp>(existing?.rsvp ?? 'pendente');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [error, setError] = useState('');
  const [confirmedDup, setConfirmedDup] = useState(false);

  const all = useMemo(() => Object.values(seating.guests), [seating.guests]);
  const groups = useMemo(() => Array.from(new Set(all.map((g) => g.group).filter(Boolean) as string[])).sort(compareNames), [all]);
  const similar = useMemo(() => (fullName.trim().length > 2 ? findSimilar(fullName, all, guestId) : []), [fullName, all, guestId]);
  const seat = guestId ? S.seatOf(seating, guestId) : null;

  const save = () => {
    if (!fullName.trim()) { setError('Informe o nome completo.'); return; }
    if (similar.length && !confirmedDup && fullName.trim() !== existing?.fullName) { setConfirmedDup(true); return; }
    const g = createGuest({ id: existing?.id, createdAt: existing?.createdAt, fullName, displayName, group, companion, rsvp, notes });
    if (existing) {
      if (apply(S.updateGuest(seating, g), 'Editar cadastro')) close();
      return;
    }
    let r = S.addGuest(seating, g);
    if (r.ok && presetSeat) {
      const placed = S.placeGuest(r.state, g.id, presetSeat);
      if (placed.ok) r = { ...placed, message: `${g.fullName} adicionado(a) à mesa ${presetSeat.table}, lugar ${presetSeat.seat}` };
    }
    if (apply(r, 'Adicionar convidado')) close();
  };

  const remove = () => {
    if (!existing) return;
    confirmAction({
      title: `Excluir o cadastro de ${existing.fullName}?`,
      body: seat
        ? `${existing.fullName} está na mesa ${seat.table}, lugar ${seat.seat}. O cadastro será apagado e esse lugar ficará livre. Para apenas tirar a pessoa da mesa, use “Devolver à lista”.`
        : 'O cadastro será apagado da lista de convidados.',
      confirmLabel: 'Excluir cadastro',
      danger: true,
      onConfirm: () => apply(S.deleteGuests(seating, [existing.id]), 'Excluir cadastro'),
    });
  };

  return (
    <Modal
      title={existing ? 'Editar convidado' : 'Adicionar convidado'}
      subtitle={existing ? (seat ? `Mesa ${seat.table}, lugar ${seat.seat}` : 'Sem lugar definido') : presetSeat ? `Será colocado na mesa ${presetSeat.table}, lugar ${presetSeat.seat}` : undefined}
      onClose={close}
      footer={
        <>
          {existing && (
            <button className="btn perigo" style={{ marginRight: 'auto' }} onClick={remove}><Trash2 /> Excluir cadastro</button>
          )}
          <button className="btn" onClick={close}>Cancelar</button>
          <button className="btn primario" onClick={save} data-testid="salvar-convidado">
            {confirmedDup && similar.length ? 'Salvar mesmo assim' : existing ? 'Salvar alterações' : 'Adicionar convidado'}
          </button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); save(); }} style={{ display: 'contents' }}>
        <label className="campo">
          Nome completo *
          <input value={fullName} onChange={(e) => { setFullName(e.target.value); setError(''); setConfirmedDup(false); }} required data-autofocus aria-invalid={!!error} />
        </label>
        {error && <div className="aviso erro" role="alert">{error}</div>}
        {similar.length > 0 && (
          <div className="aviso" role="status">
            Já existe convidado com nome parecido: <b>{similar.map((g) => g.fullName).join(', ')}</b>.
            {confirmedDup ? ' Se forem pessoas diferentes, clique em “Salvar mesmo assim”.' : ' Confira para não cadastrar a mesma pessoa duas vezes.'}
          </div>
        )}
        <div className="grade-2">
          <label className="campo">
            Nome de exibição (opcional)
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ex.: Tia Ana" />
          </label>
          <label className="campo">
            Família ou grupo
            <input value={group} onChange={(e) => setGroup(e.target.value)} list="lista-grupos" placeholder="Ex.: Família da noiva" />
            <datalist id="lista-grupos">{groups.map((g) => <option key={g} value={g} />)}</datalist>
          </label>
          <label className="campo">
            Acompanhante ou vínculo
            <input value={companion} onChange={(e) => setCompanion(e.target.value)} list="lista-nomes" placeholder="Nome de quem vem junto" />
            <datalist id="lista-nomes">{all.filter((g) => g.id !== guestId).slice(0, 400).map((g) => <option key={g.id} value={g.fullName} />)}</datalist>
          </label>
          <label className="campo">
            Confirmação de presença
            <select value={rsvp} onChange={(e) => setRsvp(e.target.value as Rsvp)}>
              <option value="pendente">Pendente</option>
              <option value="confirmado">Confirmado</option>
              <option value="recusado">Não comparecerá</option>
            </select>
          </label>
        </div>
        <label className="campo">
          Observações
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Restrições alimentares, cadeira de rodas, criança de colo…" />
        </label>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
