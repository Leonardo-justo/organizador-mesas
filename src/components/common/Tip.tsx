import { Lightbulb } from 'lucide-react';
import type { ReactNode } from 'react';
import { useApp } from '../../state/store';

/** Dica contextual exibida até ser dispensada (lembrada entre sessões). */
export function Tip({ id, children }: { id: string; children: ReactNode }) {
  const dismissed = useApp((s) => s.prefs.tipsDismissed.includes(id));
  const dismiss = useApp((s) => s.dismissTip);
  if (dismissed) return null;
  return (
    <div className="dica" role="note">
      <Lightbulb aria-hidden />
      <div>{children}</div>
      <button onClick={() => dismiss(id)}>Entendi</button>
    </div>
  );
}
