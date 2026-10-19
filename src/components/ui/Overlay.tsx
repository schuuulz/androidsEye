import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "./Button";

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

/** Fecha com Esc e devolve o foco ao elemento que abriu o overlay. */
function useOverlayBehavior(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [open]);
}

function Header({ icon, title, subtitle, actions, onClose }: Omit<OverlayProps, "open" | "children">) {
  return (
    <header className="flex items-center gap-3 border-b border-line px-5 py-4">
      {icon && (
        <div className="flex size-9 items-center justify-center rounded-[10px] bg-white/[0.05] text-zinc-300 ring-1 ring-inset ring-white/[0.08]">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[15px] font-semibold text-zinc-100">{title}</h2>
        {subtitle && <p className="truncate text-xs text-zinc-500">{subtitle}</p>}
      </div>
      {actions}
      <IconButton label="Fechar (Esc)" onClick={onClose}>
        <X className="size-4" />
      </IconButton>
    </header>
  );
}

export function Modal({ open, onClose, children, ...header }: OverlayProps) {
  useOverlayBehavior(open, onClose);
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-center justify-center p-6">
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal
        className="relative flex max-h-[min(720px,100%)] w-full max-w-2xl animate-pop-in flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl shadow-black/60"
      >
        <Header {...header} onClose={onClose} />
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Painel compacto, sem cabeçalho — base para confirmações. */
export function Dialog({ open, onClose, children }: Pick<OverlayProps, "open" | "onClose" | "children">) {
  useOverlayBehavior(open, onClose);
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        role="alertdialog"
        aria-modal
        className="relative w-full max-w-md animate-pop-in rounded-2xl border border-line bg-surface shadow-2xl shadow-black/60"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ open, onClose, children, ...header }: OverlayProps) {
  useOverlayBehavior(open, onClose);
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal
        className="relative flex h-full w-[min(920px,88vw)] animate-slide-in-right flex-col border-l border-line bg-surface shadow-2xl shadow-black/70"
      >
        <Header {...header} onClose={onClose} />
        {children}
      </aside>
    </div>,
    document.body,
  );
}
