import { RotateCcw, RotateCw } from 'lucide-react';
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
  const rotate = useApp((s) => s.rotateDraftSeats);
  const finish = useApp((s) => s.finishCalibration);
  const reset = useApp((s) => s.resetDraftToOriginal);
  if (!calibrating) return null;
  const t = draft?.find((x) => x.number === selected);
  const step = t?.shape === 'rect' ? 180 : 36;
  return (
    <div className="faixa calibrar" role="region" aria-label="Ajuste do mapa" data-testid="faixa-calibrar">
      <span>
        <b>Mover mesas:</b> arraste cada mesa para onde quiser no salão. As posições valem para o mapa, o 3D e a impressão. A distribuição dos convidados fica bloqueada enquanto isso.
      </span>
      {t && (
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          Mesa {t.number} — numeração das cadeiras:
          <button className="btn pequeno icone" aria-label="Girar numeração no sentido anti-horário" onClick={() => rotate(t.number, -step)}><RotateCcw /></button>
          <button className="btn pequeno icone" aria-label="Girar numeração no sentido horário" onClick={() => rotate(t.number, step)}><RotateCw /></button>
          <span>{t.seatRotation}°</span>
        </span>
      )}
      <div className="fim">
        <button
          className="btn pequeno"
          onClick={() => confirmAction({
            title: 'Restaurar posições originais?',
            body: 'Todas as mesas voltam às posições medidas na planta original. A mudança só é gravada quando você clicar em “Concluir e salvar”.',
            confirmLabel: 'Restaurar posições',
            onConfirm: reset,
          })}
        >
          Restaurar originais
        </button>
        <button className="btn pequeno" onClick={() => finish(false)}>Cancelar</button>
        <button className="btn pequeno primario" onClick={() => finish(true)} data-testid="concluir-calibracao">Concluir e salvar</button>
      </div>
    </div>
  );
}
