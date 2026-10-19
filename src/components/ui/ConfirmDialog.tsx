import { useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Dialog } from "./Overlay";

interface ConfirmDialogProps {
  open: boolean;
  icon: ReactNode;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  /** Conteúdo extra entre a descrição e os botões (ex.: opções). */
  children?: ReactNode;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/**
 * Confirmação de ação destrutiva. O foco começa em "Cancelar" para que um
 * Enter acidental nunca execute a ação; enquanto ela roda, o diálogo trava.
 */
export function ConfirmDialog({
  open,
  icon,
  title,
  description,
  confirmLabel,
  children,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [running, setRunning] = useState(false);
  const close = () => !running && onClose();

  const confirm = async () => {
    setRunning(true);
    try {
      await onConfirm();
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onClose={close}>
      <div className="flex gap-4 p-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-300 ring-1 ring-inset ring-rose-400/20">
          {icon}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="text-[15px] font-semibold text-zinc-50">{title}</h2>
          <div className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">{description}</div>
          {children && <div className="mt-4">{children}</div>}
        </div>
      </div>
      <footer className="flex justify-end gap-2 rounded-b-2xl border-t border-line bg-black/20 px-5 py-3">
        <Button autoFocus disabled={running} onClick={close}>
          Cancelar
        </Button>
        <Button variant="danger" loading={running} onClick={confirm}>
          {confirmLabel}
        </Button>
      </footer>
    </Dialog>
  );
}
