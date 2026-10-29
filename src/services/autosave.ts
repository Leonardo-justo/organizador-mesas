import { useApp } from '../state/store';
import { parseBackup } from '../features/backup/backup';
import { confirmAction } from '../state/ui';
import { loadData, saveData } from './db';

/**
 * Lista pré-carregada: um backup embutido no HTML (window.__SEED_BACKUP__).
 * Na abertura, pergunta uma vez se deve carregar; nunca substitui sem confirmação.
 */
function offerSeed() {
  const seed = (window as unknown as { __SEED_BACKUP__?: { exportadoEm?: string; convidados?: unknown[]; distribuicao?: unknown[] } }).__SEED_BACKUP__;
  if (!seed) return;
  const key = `lista-carregada:${seed.exportadoEm ?? ''}`;
  try { if (localStorage.getItem(key)) return; } catch { /* sem armazenamento: pergunta sempre */ }
  const st = useApp.getState();
  const parsed = parseBackup(JSON.stringify(seed), st.prefs);
  if (!parsed.ok) return;
  const current = Object.keys(st.seating.guests).length;
  confirmAction({
    title: 'Carregar a lista do casamento?',
    body: `Esta versão do organizador traz ${parsed.summary}.` +
      (current ? ` Os ${current} convidados que estão aqui agora serão substituídos (dá para desfazer logo em seguida).` : ''),
    confirmLabel: 'Carregar lista',
    onConfirm: () => {
      const s2 = useApp.getState();
      s2.replaceAll({ ...parsed.snapshot, prefs: { ...parsed.snapshot.prefs, tipsDismissed: Array.from(new Set([...s2.prefs.tipsDismissed, 'boas-vindas'])) } }, 'Carregar lista do casamento');
      s2.toast('ok', `Lista carregada: ${parsed.summary}.`, true);
      try { localStorage.setItem(key, new Date().toISOString()); } catch { /* ignora */ }
    },
  });
}

/**
 * Salvamento automático: qualquer mudança em convidados, distribuição, coordenadas
 * ou preferências agenda uma gravação (300 ms). O indicador só mostra "Salvo"
 * depois que o IndexedDB confirma a transação.
 */
let flushHook: (() => Promise<void>) | null = null;

/** Grava imediatamente (botão “Salvar alterações”). */
export async function saveNow(): Promise<boolean> {
  if (!flushHook) return false;
  await flushHook();
  return useApp.getState().saveStatus === 'salvo';
}

export async function initPersistence(): Promise<void> {
  const st = useApp.getState();
  try {
    const data = await loadData();
    st.hydrate(data, data?.savedAt ?? null);
    offerSeed();
  } catch (e) {
    st.hydrate(null, null);
    st.setSaveState('erro', null, `Não foi possível abrir os dados salvos: ${(e as Error).message}`);
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  let saving = false;
  let again = false;

  const flush = async () => {
    timer = null;
    if (saving) { again = true; return; }
    saving = true;
    useApp.getState().setSaveState('salvando');
    try {
      const at = await saveData(useApp.getState().snapshot());
      useApp.getState().setSaveState(again ? 'pendente' : 'salvo', at, null);
    } catch (e) {
      useApp.getState().setSaveState('erro', undefined, `Falha ao salvar: ${(e as Error).message}. Faça um backup para não perder as alterações.`);
    } finally {
      saving = false;
      if (again) { again = false; void flush(); }
    }
  };

  flushHook = async () => { if (timer) clearTimeout(timer); timer = null; await flush(); };

  const schedule = () => {
    useApp.getState().setSaveState('pendente');
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), 300);
  };

  useApp.subscribe((s, prev) => {
    if (!s.loaded) return;
    if (s.seating !== prev.seating || s.layout !== prev.layout || s.prefs !== prev.prefs) schedule();
  });

  const flushNow = () => { if (timer) { clearTimeout(timer); void flush(); } };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNow(); });
  window.addEventListener('pagehide', flushNow);
  window.addEventListener('beforeunload', (e) => {
    const s = useApp.getState().saveStatus;
    if (s === 'pendente' || s === 'salvando') { flushNow(); e.preventDefault(); }
  });
}
