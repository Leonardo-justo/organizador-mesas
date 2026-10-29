import { useUi } from '../../state/ui';
import { PrintDialog } from '../print/PrintDialog';
import { BackupDialog, ExportDialog } from './ExportBackup';
import { GuestForm } from './GuestForm';
import { ImportDialog } from './ImportDialog';
import { ConfirmDialog, FullTableDialog, SwapTableDialog, GuestDetails, GuestPicker, HelpDialog, PlanDialog, ReplaceDialog } from './SimpleDialogs';

export function DialogHost() {
  const d = useUi((s) => s.dialog);
  return (
    <>
      <ReplaceDialog />
      <FullTableDialog />
      {d?.type === 'guest-form' && <GuestForm key={d.guestId ?? 'novo'} guestId={d.guestId} presetSeat={d.presetSeat} />}
      {d?.type === 'confirm' && <ConfirmDialog d={d} />}
      {d?.type === 'import' && <ImportDialog />}
      {d?.type === 'export' && <ExportDialog />}
      {d?.type === 'backup' && <BackupDialog />}
      {d?.type === 'help' && <HelpDialog />}
      {d?.type === 'plan' && <PlanDialog />}
      {d?.type === 'picker' && <GuestPicker table={d.table} seat={d.seat} />}
      {d?.type === 'guest-details' && <GuestDetails guestId={d.guestId} />}
      {d?.type === 'swap-table' && <SwapTableDialog table={d.table} />}
      {d?.type === 'print' && <PrintDialog onlyTable={d.onlyTable} />}
    </>
  );
}
