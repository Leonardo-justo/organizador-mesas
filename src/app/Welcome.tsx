import { FileUp, Plus } from 'lucide-react';
import { useApp } from '../state/store';
import { useUi } from '../state/ui';
import { Modal } from '../components/common/Modal';

/** Boas-vindas na primeira abertura (lembrado entre sessões). */
export function Welcome() {
  const seen = useApp((s) => s.prefs.tipsDismissed.includes('boas-vindas'));
  const dismiss = useApp((s) => s.dismissTip);
  const dialog = useUi((s) => s.dialog);
  const open = useUi((s) => s.open);
  if (seen || dialog) return null;
  const go = (d?: 'import' | 'guest-form') => { dismiss('boas-vindas'); if (d) open({ type: d }); };
  return (
    <Modal
      title="Bem-vindos ao organizador de mesas"
      subtitle="A planta do salão já está carregada com as 28 mesas de 10 lugares."
      onClose={() => go()}
      footer={
        <>
          <button className="btn" onClick={() => go()}>Explorar primeiro</button>
          <button className="btn" onClick={() => go('guest-form')}><Plus /> Adicionar convidado</button>
          <button className="btn primario" onClick={() => go('import')} data-autofocus><FileUp /> Importar convidados</button>
        </>
      }
    >
      <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
        <li>Importe a planilha de convidados (Excel, CSV ou Google Planilhas).</li>
        <li>Arraste cada nome até uma mesa do mapa, ou abra a mesa e solte no lugar exato.</li>
        <li>Para trocar duas pessoas, solte uma sobre a outra.</li>
      </ol>
      <div className="aviso">Tudo fica salvo automaticamente neste navegador. Use “Backup” de vez em quando para guardar uma cópia.</div>
    </Modal>
  );
}
