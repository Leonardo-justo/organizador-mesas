import { FileSpreadsheet, Link2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { RSVP_LABEL } from '../../domain/types';
import { applyImport, matchRows, type ImportMode, type SeatMode } from '../../features/import-export/applyImport';
import {
  FIELD_LABELS, buildPreview, detectHeader, detectMapping, parseSheetText, readSpreadsheetFull,
  type ColumnMapping, type FieldKey, type SheetData,
} from '../../features/import-export/importGuests';
import { fetchGoogleSheetCsv, type SourceSheet } from '../../features/import-export/sourceSheet';
import { useApp } from '../../state/store';
import { useUi } from '../../state/ui';
import { Modal } from '../common/Modal';

type Step = 'arquivo' | 'colunas' | 'resultado';

export function ImportDialog() {
  const close = useUi((s) => s.close);
  const seating = useApp((s) => s.seating);
  const apply = useApp((s) => s.apply);
  const lastSheet = useApp((s) => s.sourceSheet);
  const setSourceSheet = useApp((s) => s.setSourceSheet);
  const [googleUrl, setGoogleUrl] = useState(lastSheet?.googleUrl ?? '');
  const [fromGoogle, setFromGoogle] = useState('');
  const [preamble, setPreamble] = useState<string[][]>([]);
  const [step, setStep] = useState<Step>('arquivo');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [mode, setMode] = useState<ImportMode>(Object.keys(seating.guests).length ? 'atualizar' : 'adicionar');
  const [seatMode, setSeatMode] = useState<SeatMode>('lista');
  const [replaceOk, setReplaceOk] = useState(false);
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  const existing = useMemo(() => Object.values(seating.guests), [seating.guests]);
  const preview = useMemo(
    () => (mapping ? buildPreview(rows, mapping, hasHeader, mode === 'adicionar' ? existing : []) : null),
    [rows, mapping, hasHeader, mode, existing],
  );
  const included = preview?.rows.filter((r) => overrides[r.line] ?? r.include) ?? [];
  const matches = useMemo(
    () => (mode === 'atualizar' && preview ? matchRows(preview.rows, existing) : new Map<number, string>()),
    [mode, preview, existing],
  );
  const matchedCount = included.filter((r) => matches.has(r.line)).length;
  const width = Math.max(0, ...rows.map((r) => r.length));
  const colName = (i: number) => (hasHeader && rows[0]?.[i] ? rows[0][i] : `Coluna ${String.fromCharCode(65 + (i % 26))}`);

  const loadSheet = (data: SheetData, name: string, url = '') => {
    if (!data.rows.length) throw new Error('A planilha está vazia.');
    const header = detectHeader(data.rows);
    const m = detectMapping(data.rows, header);
    setRows(data.rows); setPreamble(data.preamble); setHasHeader(header); setMapping(m); setFileName(name); setOverrides({});
    setFromGoogle(url);
    setSeatMode(m.table >= 0 ? 'planilha' : 'lista');
    setStep('colunas');
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(''); setBusy(true);
    try {
      loadSheet(await readSpreadsheetFull(f), f.name);
    } catch (e) {
      setError(`Não foi possível ler “${f.name}”: ${(e as Error).message}. Use .xlsx, .xls ou .csv.`);
    } finally { setBusy(false); }
  };

  const onGoogle = async () => {
    setError(''); setBusy(true);
    try {
      const text = await fetchGoogleSheetCsv(googleUrl);
      loadSheet(parseSheetText(text), 'Google Planilhas', googleUrl.trim());
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  const doImport = () => {
    if (!preview || !mapping) return;
    if (!included.length) { setError('Nenhuma linha selecionada para importar.'); return; }
    const mapped = new Set((Object.keys(mapping) as FieldKey[]).filter((k) => mapping[k] >= 0));
    const res = applyImport(seating, included, mode, seatMode, mapped);
    if (!res.ok) { setError(res.reason); return; }
    const o = res.outcome;
    const label = mode === 'substituir' ? 'Substituir convidados (importação)' : mode === 'atualizar' ? 'Atualizar lista (importação)' : 'Importar convidados';
    if (!apply({ ok: true, state: o.state }, label)) return;
    // guarda a planilha como entrou, para exportar com a coluna de mesa preenchida
    const rowGuest: Record<number, string> = {};
    o.rowGuest.forEach((id, line) => { rowGuest[line - 1] = id; });
    const sheet: SourceSheet = {
      fileName: fromGoogle ? 'lista-convidados.xlsx' : fileName, importedAt: new Date().toISOString(),
      preamble, rows, hasHeader, mapping, rowGuest, googleUrl: fromGoogle || undefined,
    };
    if (mode !== 'adicionar' || !lastSheet) setSourceSheet(sheet);
    const declinedWithTable = included.filter((r) => (r.table ?? 0) > 0 && r.guest.rsvp === 'recusado').length;
    const parts = [
      mode === 'atualizar'
        ? `${o.updated} convidado(s) atualizados (cada um continua no lugar onde estava) e ${o.added} novo(s) adicionados.`
        : `${o.added} convidado(s) importado(s)${mode === 'substituir' ? ' — cadastros anteriores e a distribuição foram substituídos' : ''}.`,
      seatMode === 'lista' ? 'Novos convidados ficaram na lista, sem mesa.'
        : seatMode === 'sequencia' ? `${o.placed} confirmado(s) colocados nas mesas, em sequência.`
          : `${o.placed} convidado(s) colocados nas mesas indicadas na planilha.`,
      seatMode === 'planilha' && declinedWithTable ? `${declinedWithTable} marcado(s) como "não vai" não foram colocados.` : '',
      o.issues.length ? `Ficaram sem lugar (mesa lotada ou inexistente): ${o.issues.join(', ')}.` : '',
      o.notInSheet ? `${o.notInSheet} convidado(s) que estavam aqui não aparecem na nova planilha e foram mantidos.` : '',
      o.declinedSeated.length ? `Atenção: estão sentados mas agora marcados como “não vai”: ${o.declinedSeated.join(', ')}.` : '',
      `${preview.emptyLines.length} linha(s) vazia(s) e ${preview.errorLines.length} linha(s) com erro ignoradas.`,
    ];
    setResult(parts.filter(Boolean).join(' '));
    setStep('resultado');
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
          {mode === 'atualizar' ? `Atualizar lista (${included.length} linhas)` : `Importar ${included.length} convidado(s)`}
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
          <div className="campo" style={{ marginTop: 4 }}>
            <span><b>Ou cole o link do Google Planilhas</b></span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                className="entrada" style={{ flex: 1, minWidth: 260 }} placeholder="https://docs.google.com/spreadsheets/d/…"
                value={googleUrl} onChange={(e) => setGoogleUrl(e.target.value)} data-testid="link-google"
                onKeyDown={(e) => { if (e.key === 'Enter' && googleUrl.trim()) void onGoogle(); }}
              />
              <button className="btn" disabled={!googleUrl.trim() || busy} onClick={() => void onGoogle()} data-testid="importar-google"><Link2 /> Ler planilha</button>
            </div>
            <small style={{ color: 'var(--suave)' }}>
              No Google Planilhas: Compartilhar → Acesso geral → “Qualquer pessoa com o link” (Leitor). O organizador só lê a planilha; para devolver as mesas, use Exportar lista → planilha como entrou.
            </small>
          </div>
          <p className="nota" style={{ margin: 0 }}>Colunas reconhecidas automaticamente: nome, família/grupo, acompanhante, presença/confirmação e observações. Você pode corrigir no próximo passo.</p>
        </>
      )}

      {step === 'colunas' && mapping && preview && (
        <>
          <div style={{ fontSize: 14 }}>
            {fromGoogle ? <>Google Planilhas</> : <>Arquivo <b>{fileName}</b></>}: {rows.length} linha(s).{' '}
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
            {mode === 'atualizar'
              ? <><b>{matchedCount}</b> convidado(s) já cadastrados serão atualizados (sem mudar de lugar) e <b>{included.length - matchedCount}</b> novo(s) serão adicionados.</>
              : <><b>{included.length}</b> convidado(s) serão adicionados.</>}
            {preview.emptyLines.length > 0 && ` ${preview.emptyLines.length} linha(s) vazia(s) serão ignoradas.`}
            {preview.rows.some((r) => r.duplicateOf) && ` ${preview.rows.filter((r) => r.duplicateOf).length} nome(s) parecido(s) ou repetido(s) — confira na tabela (só ficam desmarcados os que já existem com o mesmo nome).`}
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
                <tr><th>Importar</th><th>Linha</th><th>Nome</th><th>Família/grupo</th><th>Acompanhante</th><th>Presença</th><th>Mesa</th><th>Observação</th><th>Aviso</th></tr>
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
                      <td>{r.table ?? ''}</td>
                      <td>{r.guest.notes ?? ''}</td>
                      <td>{mode === 'atualizar' ? (matches.has(r.line) ? 'Atualiza cadastro' : 'Novo') : r.issues.join('; ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {preview.rows.length > 400 && <p className="nota" style={{ margin: 0 }}>Mostrando as primeiras 400 linhas; todas as válidas serão importadas.</p>}

          <div className="opcoes" role="radiogroup" aria-label="Como importar">
            {existing.length > 0 && (
              <label className="opcao">
                <input type="radio" name="modo" checked={mode === 'atualizar'} onChange={() => setMode('atualizar')} data-testid="modo-atualizar" />
                <span><b>Atualizar a lista sem perder a distribuição (recomendado)</b><small>Quem já está cadastrado (mesmo nome) tem os dados atualizados e continua no mesmo lugar; nomes novos entram; ninguém é apagado.</small></span>
              </label>
            )}
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
            {mapping.table >= 0 && (
              <label className="opcao">
                <input type="radio" name="mesas" checked={seatMode === 'planilha'} onChange={() => setSeatMode('planilha')} data-testid="importar-pela-mesa" />
                <span><b>Colocar na mesa indicada na planilha</b><small>Usa a coluna “{colName(mapping.table)}”, só para quem ainda não tem lugar. Quem não tem mesa (ou “não vai”) fica na lista; se a mesa lotar, o excedente também fica na lista.</small></span>
              </label>
            )}
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
