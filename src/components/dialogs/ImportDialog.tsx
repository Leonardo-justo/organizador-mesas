import { FileSpreadsheet } from 'lucide-react';
import { useMemo, useState } from 'react';
import * as S from '../../domain/seating';
import { RSVP_LABEL } from '../../domain/types';
import {
  FIELD_LABELS, buildPreview, detectHeader, detectMapping, readSpreadsheet,
  type ColumnMapping, type FieldKey,
} from '../../features/import-export/importGuests';
import { useApp } from '../../state/store';
import { useUi } from '../../state/ui';
import { Modal } from '../common/Modal';

type Step = 'arquivo' | 'colunas' | 'resultado';

export function ImportDialog() {
  const close = useUi((s) => s.close);
  const seating = useApp((s) => s.seating);
  const apply = useApp((s) => s.apply);
  const [step, setStep] = useState<Step>('arquivo');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [mode, setMode] = useState<'adicionar' | 'substituir'>('adicionar');
  const [seatMode, setSeatMode] = useState<'lista' | 'sequencia'>('lista');
  const [replaceOk, setReplaceOk] = useState(false);
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  const existing = useMemo(() => Object.values(seating.guests), [seating.guests]);
  const preview = useMemo(
    () => (mapping ? buildPreview(rows, mapping, hasHeader, mode === 'substituir' ? [] : existing) : null),
    [rows, mapping, hasHeader, mode, existing],
  );
  const included = preview?.rows.filter((r) => overrides[r.line] ?? r.include) ?? [];
  const width = Math.max(0, ...rows.map((r) => r.length));
  const colName = (i: number) => (hasHeader && rows[0]?.[i] ? rows[0][i] : `Coluna ${String.fromCharCode(65 + (i % 26))}`);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(''); setBusy(true);
    try {
      const data = await readSpreadsheet(f);
      if (!data.length) throw new Error('O arquivo está vazio.');
      const header = detectHeader(data);
      setRows(data); setHasHeader(header); setMapping(detectMapping(data, header)); setFileName(f.name); setOverrides({});
      setStep('colunas');
    } catch (e) {
      setError(`Não foi possível ler “${f.name}”: ${(e as Error).message}. Use .xlsx, .xls ou .csv.`);
    } finally { setBusy(false); }
  };

  const doImport = () => {
    if (!preview) return;
    const guests = included.map((r) => r.guest);
    if (!guests.length) { setError('Nenhuma linha selecionada para importar.'); return; }
    const base = mode === 'substituir' ? { guests: {}, assignments: {} } : seating;
    let r = S.addGuests(base, guests);
    let seatedMsg = ' Todos ficaram na lista, sem mesa.';
    if (r.ok && seatMode === 'sequencia') {
      const confirmed = guests.filter((g) => g.rsvp === 'confirmado').map((g) => g.id);
      const seq = confirmed.length ? S.placeSequential(r.state, confirmed, 1) : null;
      if (seq?.ok) {
        r = seq;
        seatedMsg = ` ${seq.placed} confirmado(s) colocados nas mesas, na ordem da planilha${seq.left ? `; ${seq.left} ficaram sem lugar (salão cheio)` : ''}.`;
      } else {
        seatedMsg = ' Nenhum confirmado para colocar nas mesas; todos ficaram na lista.';
      }
    }
    if (apply(r, mode === 'substituir' ? 'Substituir convidados (importação)' : 'Importar convidados')) {
      const skipped = preview.rows.length - included.length;
      setResult(
        `${guests.length} convidado(s) importado(s).${seatedMsg}` +
          (mode === 'substituir' ? ' — cadastros anteriores e a distribuição foram substituídos' : '') +
          `. ${skipped ? `${skipped} possível(is) duplicata(s) não importada(s). ` : ''}` +
          `${preview.emptyLines.length} linha(s) vazia(s) e ${preview.errorLines.length} linha(s) com erro ignoradas.`,
      );
      setStep('resultado');
    }
  };

  const footer =
    step === 'colunas' ? (
      <>
        <button className="btn" onClick={() => setStep('arquivo')}>Escolher outro arquivo</button>
        <button
          className="btn primario"
          disabled={!included.length || (mode === 'substituir' && !replaceOk) || !mapping || mapping.fullName < 0}
          onClick={doImport}
          data-testid="confirmar-importacao"
        >
          Importar {included.length} convidado(s)
        </button>
      </>
    ) : step === 'resultado' ? (
      <button className="btn primario" onClick={close}>Concluir</button>
    ) : (
      <button className="btn" onClick={close}>Cancelar</button>
    );

  return (
    <Modal title="Importar convidados" onClose={close} wide footer={footer}
      subtitle={<span className="passos"><span aria-current={step === 'arquivo' ? 'step' : undefined}>1. Arquivo</span> › <span aria-current={step === 'colunas' ? 'step' : undefined}>2. Colunas e prévia</span> › <span aria-current={step === 'resultado' ? 'step' : undefined}>3. Resultado</span></span>}
    >
      {error && <div className="aviso erro" role="alert">{error}</div>}
      {step === 'arquivo' && (
        <>
          <p style={{ margin: 0 }}>Escolha a planilha com os nomes dos convidados. A primeira aba é usada.</p>
          <label className="btn primario" style={{ alignSelf: 'flex-start', minHeight: 44, padding: '0 18px' }}>
            <FileSpreadsheet /> {busy ? 'Lendo arquivo…' : 'Selecionar arquivo (.xlsx, .xls ou .csv)'}
            <input type="file" accept=".xlsx,.xls,.csv,.txt,.ods" hidden onChange={(e) => void onFile(e.target.files?.[0])} data-testid="arquivo-importacao" />
          </label>
          <div className="aviso">
            <b>Google Planilhas:</b> abra a planilha, vá em Arquivo → Fazer download → Microsoft Excel (.xlsx) ou Valores separados por vírgula (.csv), e selecione o arquivo baixado aqui.
          </div>
          <p className="nota" style={{ margin: 0 }}>Colunas reconhecidas automaticamente: nome, família/grupo, acompanhante, presença/confirmação e observações. Você pode corrigir no próximo passo.</p>
        </>
      )}

      {step === 'colunas' && mapping && preview && (
        <>
          <div style={{ fontSize: 14 }}>
            Arquivo <b>{fileName}</b>: {rows.length} linha(s).{' '}
            <label style={{ marginLeft: 8 }}>
              <input type="checkbox" checked={hasHeader} onChange={(e) => { setHasHeader(e.target.checked); setMapping(detectMapping(rows, e.target.checked)); }} /> A primeira linha é o cabeçalho
            </label>
          </div>
          <div className="grade-2" role="group" aria-label="Correspondência das colunas">
            {(Object.keys(FIELD_LABELS) as FieldKey[]).map((k) => (
              <label key={k} className="campo">
                {FIELD_LABELS[k]}
                <select value={mapping[k]} onChange={(e) => setMapping({ ...mapping, [k]: Number(e.target.value) })} data-testid={`mapa-${k}`}>
                  <option value={-1}>{k === 'fullName' ? 'Escolha a coluna…' : 'Não importar'}</option>
                  {Array.from({ length: width }, (_, i) => <option key={i} value={i}>{colName(i)}</option>)}
                </select>
              </label>
            ))}
          </div>

          <div className="aviso ok" data-testid="resumo-importacao">
            <b>{included.length}</b> convidado(s) serão adicionados.
            {preview.emptyLines.length > 0 && ` ${preview.emptyLines.length} linha(s) vazia(s) serão ignoradas.`}
            {preview.rows.some((r) => r.duplicateOf) && ` ${preview.rows.filter((r) => r.duplicateOf).length} possível(is) duplicata(s) estão desmarcadas — marque se forem pessoas diferentes.`}
          </div>
          {preview.errorLines.length > 0 && (
            <div className="aviso erro">
              <b>Linhas com problema (serão ignoradas):</b>{' '}
              {preview.errorLines.slice(0, 8).map((e) => `linha ${e.line}: ${e.reason}`).join('; ')}
              {preview.errorLines.length > 8 && ` e mais ${preview.errorLines.length - 8}.`}
            </div>
          )}

          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr><th>Importar</th><th>Linha</th><th>Nome</th><th>Família/grupo</th><th>Acompanhante</th><th>Presença</th><th>Observação</th><th>Aviso</th></tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 400).map((r) => {
                  const inc = overrides[r.line] ?? r.include;
                  return (
                    <tr key={r.line} className={`${r.issues.length ? 'problema' : ''}${inc ? '' : ' excluida'}`}>
                      <td><input type="checkbox" checked={inc} aria-label={`Importar ${r.guest.fullName}`} onChange={(e) => setOverrides({ ...overrides, [r.line]: e.target.checked })} /></td>
                      <td>{r.line}</td>
                      <td>{r.guest.fullName}</td>
                      <td>{r.guest.group ?? ''}</td>
                      <td>{r.guest.companion ?? ''}</td>
                      <td>{RSVP_LABEL[r.guest.rsvp]}</td>
                      <td>{r.guest.notes ?? ''}</td>
                      <td>{r.issues.join('; ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {preview.rows.length > 400 && <p className="nota" style={{ margin: 0 }}>Mostrando as primeiras 400 linhas; todas as válidas serão importadas.</p>}

          <div className="opcoes" role="radiogroup" aria-label="Como importar">
            <label className="opcao">
              <input type="radio" name="modo" checked={mode === 'adicionar'} onChange={() => setMode('adicionar')} />
              <span><b>Adicionar aos convidados existentes</b><small>Os {existing.length} cadastros atuais e a distribuição continuam como estão.</small></span>
            </label>
            <label className="opcao">
              <input type="radio" name="modo" checked={mode === 'substituir'} onChange={() => { setMode('substituir'); setReplaceOk(false); }} />
              <span><b>Substituir todos os cadastros</b><small>Apaga os {existing.length} cadastros atuais e toda a distribuição das mesas.</small></span>
            </label>
          </div>
          <div className="opcoes" role="radiogroup" aria-label="Mesas depois de importar">
            <label className="opcao">
              <input type="radio" name="mesas" checked={seatMode === 'lista'} onChange={() => setSeatMode('lista')} data-testid="importar-sem-mesa" />
              <span><b>Só adicionar à lista, sem colocar nas mesas</b><small>Você distribui depois, arrastando ou pela tela “Mesas em lista”.</small></span>
            </label>
            <label className="opcao">
              <input type="radio" name="mesas" checked={seatMode === 'sequencia'} onChange={() => setSeatMode('sequencia')} data-testid="importar-em-sequencia" />
              <span><b>Já colocar os confirmados nas mesas, na ordem da planilha</b><small>Preenche os lugares livres a partir da mesa 1. Pendentes e “não vai” ficam na lista.</small></span>
            </label>
          </div>
          {mode === 'substituir' && (
            <label className="aviso erro" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={replaceOk} onChange={(e) => setReplaceOk(e.target.checked)} data-testid="confirmar-substituicao" />
              Entendo que os {existing.length} convidados atuais e a distribuição das mesas serão substituídos. (Dá para desfazer logo depois, e um backup é recomendado.)
            </label>
          )}
        </>
      )}

      {step === 'resultado' && <div className="aviso ok" role="status" data-testid="resultado-importacao">{result}</div>}
    </Modal>
  );
}
