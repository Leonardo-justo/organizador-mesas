import { Download, FileJson, FileSpreadsheet, Upload } from 'lucide-react';
import { useState } from 'react';
import { createBackup, parseBackup } from '../../features/backup/backup';
import {
  EXPORT_TITLES, dateStamp, downloadBlob, exportCsv, exportXlsxBlob, type ExportKind,
} from '../../features/import-export/exportGuests';
import { fileToArrayBuffer } from '../../features/import-export/importGuests';
import { decodeText } from '../../features/import-export/csv';
import { useApp } from '../../state/store';
import { confirmAction, useUi } from '../../state/ui';
import { Modal } from '../common/Modal';

const DESC: Record<ExportKind, string> = {
  'por-mesa': 'Mesa, assento, nome, família, acompanhante, presença e observações — os 280 lugares, inclusive os livres.',
  alfabetica: 'Nome do convidado com mesa e assento, em ordem alfabética. Ideal para a recepção.',
  'sem-lugar': 'Somente quem ainda não foi distribuído.',
};

export function ExportDialog() {
  const close = useUi((s) => s.close);
  const open = useUi((s) => s.open);
  const seating = useApp((s) => s.seating);
  const toast = useApp((s) => s.toast);
  const csv = (k: ExportKind) => {
    downloadBlob(new Blob([exportCsv(seating, k)], { type: 'text/csv;charset=utf-8' }), `${k}_${dateStamp()}.csv`);
    toast('ok', `${EXPORT_TITLES[k]} exportada (CSV).`);
  };
  const xlsx = async () => {
    downloadBlob(await exportXlsxBlob(seating), `convidados-mesas_${dateStamp()}.xlsx`);
    toast('ok', 'Planilha Excel exportada com as três listas.');
  };
  return (
    <Modal title="Exportar lista" subtitle="Arquivos com acentuação preservada, prontos para abrir no Excel ou no Google Planilhas." onClose={close} wide
      footer={<><button className="btn" onClick={() => open({ type: 'print' })}>Imprimir mapa e listas</button><button className="btn" onClick={close}>Fechar</button></>}
    >
      <button className="btn primario" style={{ alignSelf: 'flex-start', minHeight: 42 }} onClick={() => void xlsx()} data-testid="exportar-xlsx">
        <FileSpreadsheet /> Baixar planilha Excel (.xlsx) com as três listas
      </button>
      <div className="opcoes">
        {(Object.keys(EXPORT_TITLES) as ExportKind[]).map((k) => (
          <div key={k} className="opcao" style={{ cursor: 'default', alignItems: 'center' }}>
            <span style={{ flex: 1 }}><b>{EXPORT_TITLES[k]}</b><small>{DESC[k]}</small></span>
            <button className="btn" onClick={() => csv(k)} data-testid={`exportar-csv-${k}`}><Download /> CSV</button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function BackupDialog() {
  const close = useUi((s) => s.close);
  const snapshot = useApp((s) => s.snapshot);
  const prefs = useApp((s) => s.prefs);
  const replaceAll = useApp((s) => s.replaceAll);
  const toast = useApp((s) => s.toast);
  const total = useApp((s) => Object.keys(s.seating.guests).length);
  const [errors, setErrors] = useState<string[]>([]);

  const doBackup = () => {
    const json = JSON.stringify(createBackup(snapshot()), null, 2);
    downloadBlob(new Blob([json], { type: 'application/json' }), `backup-mesas-casamento_${dateStamp()}.json`);
    toast('ok', 'Backup baixado. Guarde o arquivo em local seguro (ex.: Google Drive).');
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setErrors([]);
    const text = decodeText(await fileToArrayBuffer(f));
    const r = parseBackup(text, prefs);
    if (!r.ok) { setErrors(r.errors); return; }
    confirmAction({
      title: 'Restaurar este backup?',
      body: `O backup contém ${r.summary}. Os ${total} convidados e a distribuição atuais serão substituídos (dá para desfazer em seguida).`,
      confirmLabel: 'Restaurar backup',
      danger: true,
      onConfirm: () => { replaceAll(r.snapshot, 'Restaurar backup'); toast('ok', `Backup restaurado: ${r.summary}.`, true); },
    });
  };

  return (
    <Modal title="Backup e restauração" onClose={close} footer={<button className="btn" onClick={close}>Fechar</button>}>
      <div className="aviso">
        Os dados ficam salvos automaticamente <b>somente neste navegador, neste computador</b>. Não há sincronização entre aparelhos.
        Faça backups com frequência — e sempre antes de limpar o navegador ou trocar de computador.
      </div>
      <button className="btn primario" style={{ alignSelf: 'flex-start' }} onClick={doBackup} data-testid="baixar-backup">
        <FileJson /> Baixar backup completo (.json)
      </button>
      <p className="nota" style={{ margin: 0 }}>Inclui convidados, mesas, assentos, distribuição, posições do mapa, preferências e a versão do formato.</p>
      <label className="btn" style={{ alignSelf: 'flex-start' }}>
        <Upload /> Restaurar de um arquivo de backup…
        <input type="file" accept=".json,application/json" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} data-testid="arquivo-backup" />
      </label>
      {errors.length > 0 && (
        <div className="aviso erro" role="alert">
          <b>Backup não restaurado — seus dados atuais não foram alterados.</b>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{errors.slice(0, 6).map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
    </Modal>
  );
}
