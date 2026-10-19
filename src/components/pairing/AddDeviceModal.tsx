import { useCallback, useEffect, useState } from "react";
import { Wifi } from "lucide-react";
import { Modal } from "../ui/Overlay";
import { SegmentedControl } from "../ui/SegmentedControl";
import { CodePairing } from "./CodePairing";
import { ManualConnect } from "./ManualConnect";
import { QrPairing } from "./QrPairing";

type Tab = "qr" | "code" | "manual";

const SUCCESS_CLOSE_DELAY = 1600;

interface AddDeviceModalProps {
  open: boolean;
  onClose: () => void;
}

export function AddDeviceModal({ open, onClose }: AddDeviceModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Wifi className="size-4" />}
      title="Adicionar dispositivo via Wi-Fi"
      subtitle="Na primeira vez, o celular precisa ser pareado com este computador"
    >
      {/* Conteúdo só existe com o modal aberto: fechar interrompe buscas e zera o estado. */}
      <AddDeviceContent onClose={onClose} />
    </Modal>
  );
}

function AddDeviceContent({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("qr");
  const [success, setSuccess] = useState(false);
  const onPaired = useCallback(() => setSuccess(true), []);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(onClose, SUCCESS_CLOSE_DELAY);
    return () => window.clearTimeout(timer);
  }, [success, onClose]);

  if (success) return <PairedState />;

  return (
    <>
      <div className="flex justify-center border-b border-line px-5 py-3">
        <div className="w-[380px]">
          <SegmentedControl
            value={tab}
            onChange={setTab}
            options={[
              { value: "qr", label: "QR Code" },
              { value: "code", label: "Código" },
              { value: "manual", label: "Já pareado" },
            ]}
          />
        </div>
      </div>

      <div key={tab} className="min-h-[340px] animate-fade-in">
        {tab === "qr" && <QrPairing onPaired={onPaired} />}
        {tab === "code" && <CodePairing onPaired={onPaired} />}
        {tab === "manual" && <ManualConnect onConnected={onPaired} />}
      </div>

      <footer className="border-t border-line px-6 py-3 text-[11px] text-zinc-500">
        O celular e o computador precisam estar na mesma rede Wi-Fi · Android 11 ou superior
      </footer>
    </>
  );
}

function PairedState() {
  return (
    <div className="flex min-h-[420px] animate-fade-in flex-col items-center justify-center text-center">
      <div className="relative">
        <span className="absolute inset-0 animate-ping-slow rounded-full bg-emerald-400/20" />
        <div className="relative flex size-16 animate-pop-in items-center justify-center rounded-full bg-emerald-400/15 ring-1 ring-emerald-400/30">
          <svg viewBox="0 0 24 24" className="size-8 text-emerald-300" fill="none" aria-hidden>
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              className="animate-draw"
            />
          </svg>
        </div>
      </div>
      <h3 className="mt-5 text-base font-semibold text-zinc-50">Tudo certo!</h3>
      <p className="mt-1 text-sm text-zinc-500">O dispositivo vai aparecer no hub em instantes.</p>
    </div>
  );
}
