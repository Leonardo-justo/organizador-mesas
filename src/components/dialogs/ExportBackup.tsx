import { Download, FileJson, FileSpreadsheet, Share2, Upload, Users } from 'lucide-react';
import { useState } from 'react';
import { createBackup, parseBackup } from '../../features/backup/backup';
import {
  EXPORT_TITLES, dateStamp, downloadBlob, exportCsv, exportXlsxBlob, type ExportKind,
} from '../../features/import-export/exportGuests';
import { fileToArrayBuffer } from '../../features/import-export/importGuests';
import { decodeText } from '../../features/import-export/csv';
import { sourceSheetFileName, sourceSheetXlsx } from '../../features/import-export/sourceSheet';
import { ceremonialHtml } from '../../features/import-export/ceremonialPage';
import { useApp } from '../../state/store';
import { confirmAction, useUi } from '../../state/ui';
import { Modal } from '../common/Modal';

const DESC: Record<ExportKind, string> = {
  'por-mesa': 'Mesa, assento, nome, família, acompanhante, presença e observações — todos os lugares, inclusive os livres.',
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
  const sheet = useApp((s) => s.sourceSheet);
  const [withUnseated, setWithUnseated] = useState(false);
  const comoEntrou = async () => {
    if (!sheet) return;
    downloadBlob(await sourceSheetXlsx(sheet, seating), sourceSheetFileName(sheet));
    toast('ok', 'Planilha exportada no mesmo formato da importação, com a mesa de cada convidado.');
  };
  const cerimonial = async (share: boolean) => {
    const html = ceremonialHtml(seating, 'Mesas do casamento', withUnseated);
    const name = `consulta-mesas_${dateStamp()}.html`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    if (share) {
      const file = new File([blob], name, { type: 'text/html' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        try { await nav.share({ files: [file], title: 'Mesas do casamento' }); return; } catch { /* cancelado */ return; }
      }
      toast('info', 'Este navegador não compartilha arquivos direto; o arquivo foi baixado — envie pelo WhatsApp ou e-mail.');
    }
    downloadBlob(blob, name);
    if (!share) toast('ok', 'Página do cerimonialista baixada. Envie o arquivo — ele abre no celular, sem internet.');
  };
  const xlsx = async () => {
    downloadBlob(await exportXlsxBlob(seating), `convidados-mesas_${dateStamp()}.xlsx`);
    toast('ok', 'Planilha Excel exportada com as três listas.');
  };
  return (
    <Modal title="Exportar lista" subtitle="Arquivos com acentuação preservada, prontos para abrir no Excel ou no Google Planilhas." onClose={close} wide
      footer={<><button className="btn" onClick={() => open({ type: 'print' })}>Imprimir mapa e listas</button><button className="btn" onClick={close}>Fechar</button></>}
    >
      <div className="opcao" style={{ cursor: 'default', alignItems: 'center' }}>
        <span style={{ flex: 1 }}>
          <b>Planilha como entrou, com as mesas</b>
          <small>{sheet
            ? <>Mesmas colunas e ordem de “{sheet.fileName}”, com o número da mesa preenchido na coluna de mesa{sheet.mapping.table < 0 ? ' (coluna “Mesa” adicionada no fim)' : ''}. Quem foi incluído depois aparece no final.</>
            : <>Importe uma planilha (Importar) para poder exportar no mesmo formato dela.</>}</small>
        </span>
        <button className="btn primario" disabled={!sheet} onClick={() => void comoEntrou()} data-testid="exportar-como-entrou"><FileSpreadsheet /> Baixar .xlsx</button>
      </div>
      <div className="opcao" style={{ cursor: 'default', alignItems: 'center' }}>
        <span style={{ flex: 1 }}>
          <b>Página do cerimonialista</b>
          <small>Um arquivo simples para o celular: digita o nome e aparece a mesa e o lugar (também lista por mesa). Funciona sem internet e mostra só nome e mesa. Gere de novo sempre que mudar a distribuição.</small>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, fontSize: 13 }}>
            <input type="checkbox" checked={withUnseated} onChange={(e) => setWithUnseated(e.target.checked)} /> Incluir quem ainda está sem mesa
          </label>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button className="btn" onClick={() => void cerimonial(false)} data-testid="exportar-cerimonial"><Users /> Baixar</button>
          <button className="btn" onClick={() => void cerimonial(true)}><Share2 /> Compartilhar</button>
        </span>
      </div>
      <button className="btn" style={{ alignSelf: 'flex-start', minHeight: 42 }} onClick={() => void xlsx()} data-testid="exportar-xlsx">
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
      onConfirm: () => {
        replaceAll(r.snapshot, 'Restaurar backup');
        toast('ok', `Backup restaurado: ${r.summary}.`, true);
      },
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
