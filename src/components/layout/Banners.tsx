import { Minus, Plus, RotateCcw, RotateCw, Trash2 } from 'lucide-react';
import { label } from '../../domain/guests';
import { seatOf } from '../../domain/seating';
import { useApp } from '../../state/store';
import { confirmAction } from '../../state/ui';

export function PickBanner() {
  const picked = useApp((s) => s.pickedGuestId);
  const guest = useApp((s) => (s.pickedGuestId ? s.seating.guests[s.pickedGuestId] : undefined));
  const seating = useApp((s) => s.seating);
  const pick = useApp((s) => s.pickGuest);
  const unassign = useApp((s) => s.unassignGuest);
  if (!picked || !guest) return null;
  const seat = seatOf(seating, picked);
  return (
    <div className="faixa mover" role="status" data-testid="faixa-mover">
      <span>
        Movendo <b>{label(guest)}</b>{seat ? ` (mesa ${seat.table}, lugar ${seat.seat})` : ' (sem lugar)'}: escolha uma mesa no mapa e toque no lugar de destino. Se o lugar estiver ocupado, as pessoas trocam de lugar.
      </span>
      <div className="fim">
        {seat && <button className="btn pequeno" onClick={() => { unassign(picked); pick(null); }}>Devolver à lista</button>}
        <button className="btn pequeno" onClick={() => pick(null)}>Cancelar</button>
      </div>
    </div>
  );
}

export function CalibrationBanner() {
  const calibrating = useApp((s) => s.calibrating);
  const selected = useApp((s) => s.selectedTable);
  const draft = useApp((s) => s.calibrationDraft);
  const assignments = useApp((s) => s.seating.assignments);
  const rotate = useApp((s) => s.rotateDraftSeats);
  const finish = useApp((s) => s.finishCalibration);
  const reset = useApp((s) => s.resetDraftToOriginal);
  const addTable = useApp((s) => s.addDraftTable);
  const removeTable = useApp((s) => s.removeDraftTable);
  const setSeats = useApp((s) => s.setDraftSeats);
  if (!calibrating || !draft) return null;
  const t = draft.find((x) => x.number === selected);
  const step = t?.shape === 'rect' ? 180 : t ? Math.round(360 / t.seats) : 45;
  // quantos convidados perderiam o lugar com o rascunho atual
  const numbers = new Map(draft.map((d) => [d.number, d.seats]));
  const lost = Object.keys(assignments).filter((k) => {
    const [tb, sb] = k.split('-').map(Number);
    const cap = numbers.get(tb);
    return cap === undefined || sb > cap;
  }).length;
  const occ = (n: number) => Object.keys(assignments).filter((k) => k.startsWith(`${n}-`)).length;
  const rounds = draft.filter((d) => d.shape === 'round').length;
  const rects = draft.length - rounds;
  const seatsTotal = draft.reduce((a, d) => a + d.seats, 0);
  return (
    <div className="faixa calibrar" role="region" aria-label="Mover mesas" data-testid="faixa-calibrar">
      <span>
        <b>Mover mesas:</b> arraste as mesas para onde quiser. {draft.length} mesas ({rounds} redondas, {rects} retangulares), {seatsTotal} lugares.
      </span>
      <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn pequeno" onClick={() => addTable('round')} data-testid="add-mesa-redonda"><Plus /> Mesa redonda</button>
        <button className="btn pequeno" onClick={() => addTable('rect')} data-testid="add-mesa-ret"><Plus /> Mesa retangular</button>
      </span>
      {t ? (
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }} data-testid="mesa-selecionada">
          <b>Mesa {t.number}</b>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            lugares:
            <button className="btn pequeno icone" aria-label="Menos um lugar" onClick={() => setSeats(t.number, t.seats - 1)} disabled={t.seats <= 1}><Minus /></button>
            <b data-testid="lugares-mesa">{t.seats}</b>
            <button className="btn pequeno icone" aria-label="Mais um lugar" onClick={() => setSeats(t.number, t.seats + 1)} disabled={t.seats >= 16}><Plus /></button>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            numeração:
            <button className="btn pequeno icone" aria-label="Girar numeração no sentido anti-horário" onClick={() => rotate(t.number, -step)}><RotateCcw /></button>
            <button className="btn pequeno icone" aria-label="Girar numeração no sentido horário" onClick={() => rotate(t.number, step)}><RotateCw /></button>
          </span>
          <button
            className="btn pequeno perigo"
            data-testid="remover-mesa"
            onClick={() => {
              const n = occ(t.number);
              if (!n) { removeTable(t.number); return; }
              confirmAction({
                title: `Remover a mesa ${t.number}?`,
                body: `${n} convidado(s) sentados nela voltam para a lista quando você clicar em “Concluir e salvar”. Nenhum cadastro é excluído.`,
                confirmLabel: 'Remover mesa',
                danger: true,
                onConfirm: () => removeTable(t.number),
              });
            }}
          >
            <Trash2 /> Remover mesa
          </button>
        </span>
      ) : (
        <span>Clique em uma mesa para mudar lugares, girar a numeração ou remover.</span>
      )}
      {lost > 0 && <span className="aviso erro" style={{ padding: '3px 8px' }}>Ao salvar, {lost} convidado(s) de lugares removidos voltam para a lista.</span>}
      <div className="fim">
        <button
          className="btn pequeno"
          onClick={() => confirmAction({
            title: 'Restaurar o salão padrão?',
            body: 'Volta ao layout padrão: 35 mesas de 8 lugares (32 redondas e 3 retangulares) nas posições iniciais. A mudança só é gravada quando você clicar em “Concluir e salvar”.',
            confirmLabel: 'Restaurar padrão',
            onConfirm: reset,
          })}
        >
          Restaurar padrão
        </button>
        <button className="btn pequeno" onClick={() => finish(false)}>Cancelar</button>
        <button className="btn pequeno primario" onClick={() => finish(true)} data-testid="concluir-calibracao">Concluir e salvar</button>
      </div>
    </div>
  );
}
