import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { useApp } from '../../state/store';

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const undo = useApp((s) => s.undo);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="avisos" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'erro' ? 'alert' : 'status'}>
          {t.kind === 'erro' ? <AlertCircle aria-hidden /> : t.kind === 'ok' ? <CheckCircle2 aria-hidden /> : <Info aria-hidden />}
          <span>{t.text}</span>
          {t.undoable && (
            <button onClick={() => { dismiss(t.id); undo(); }}>Desfazer</button>
          )}
        </div>
      ))}
    </div>
  );
}
