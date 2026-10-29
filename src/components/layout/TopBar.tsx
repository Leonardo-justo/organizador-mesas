import { Box, Download, Save, FileUp, HelpCircle, Map as MapIcon, Printer, Redo2, ShieldCheck, Undo2, Users } from 'lucide-react';
import { saveNow } from '../../services/autosave';
import { useApp } from '../../state/store';
import { useUi } from '../../state/ui';
import { SearchBox } from './SearchBox';

const fmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function SaveIndicator() {
  const status = useApp((s) => s.saveStatus);
  const at = useApp((s) => s.lastSavedAt);
  const err = useApp((s) => s.saveError);
  const text =
    status === 'erro' ? 'Erro ao salvar'
    : status === 'pendente' || status === 'salvando' ? 'Salvando alterações…'
    : status === 'carregando' ? 'Carregando…'
    : at ? `Salvo em ${fmt.format(new Date(at))}` : 'Nenhuma alteração ainda';
  return (
    <span className={`salvamento ${status}`} role="status" aria-live="polite" title={err ?? 'Os dados ficam salvos somente neste navegador, neste computador.'} data-testid="salvamento">
      <span className="ponto" aria-hidden />
      {text}
    </span>
  );
}

export function TopBar() {
  const mode = useApp((s) => s.prefs.mode);
  const setPrefs = useApp((s) => s.setPrefs);
  const canUndo = useApp((s) => s.history.past.length > 0);
  const canRedo = useApp((s) => s.history.future.length > 0);
  const undo = useApp((s) => s.undo);
  const redo = useApp((s) => s.redo);
  const setSidebarOpen = useApp((s) => s.setSidebarOpen);
  const calibrating = useApp((s) => s.calibrating);
  const open = useUi((s) => s.open);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = isMac ? '⌘' : 'Ctrl';

  return (
    <header className="topo">
      <button className="btn so-celular" onClick={() => setSidebarOpen(true)}>
        <Users /> Convidados
      </button>
      <div className="marca">
        <strong>Nossas mesas</strong>
        <span>Organizador de convidados</span>
      </div>
      <SearchBox />
      <div className="acoes">
        <SaveIndicator />
        <button
          className="btn"
          aria-label="Salvar alterações"
          title="As alterações já são salvas automaticamente; use para gravar agora."
          onClick={async () => {
            const ok = await saveNow();
            useApp.getState().toast(ok ? 'ok' : 'erro', ok ? 'Alterações salvas neste navegador.' : 'Não foi possível salvar. Faça um backup.');
          }}
        >
          <Save /> <span className="rotulo-longo">Salvar alterações</span>
        </button>
        <button className="btn" aria-label="Desfazer" onClick={undo} disabled={!canUndo} title={`Desfazer (${mod}+Z)`}>
          <Undo2 /> <span className="rotulo-longo">Desfazer</span>
        </button>
        <button className="btn" aria-label="Refazer" onClick={redo} disabled={!canRedo} title={`Refazer (${mod}+Shift+Z)`}>
          <Redo2 /> <span className="rotulo-longo">Refazer</span>
        </button>
        <span className="divisor some-celular" />
        <button
          className="btn"
          onClick={() => setPrefs({ mode: mode === '2d' ? '3d' : '2d' })}
          disabled={calibrating}
          data-testid="alternar-modo"
        >
          {mode === '2d' ? <Box /> : <MapIcon />} {mode === '2d' ? 'Alternar para 3D' : 'Alternar para 2D'}
        </button>
        <button className="btn" aria-label="Importar convidados" onClick={() => open({ type: 'import' })}>
          <FileUp /> <span className="rotulo-longo">Importar convidados</span>
        </button>
        <button className="btn" aria-label="Exportar lista" onClick={() => open({ type: 'export' })}>
          <Download /> <span className="rotulo-longo">Exportar lista</span>
        </button>
        <button className="btn" aria-label="Imprimir mapa" onClick={() => open({ type: 'print' })}>
          <Printer /> <span className="rotulo-longo">Imprimir mapa</span>
        </button>
        <button className="btn" aria-label="Backup" onClick={() => open({ type: 'backup' })}>
          <ShieldCheck /> <span className="rotulo-longo">Backup</span>
        </button>
        <button className="btn icone" onClick={() => open({ type: 'help' })} aria-label="Ajuda" title="Ajuda">
          <HelpCircle />
        </button>
      </div>
    </header>
  );
}
