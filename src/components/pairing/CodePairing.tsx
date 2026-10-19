import { useState } from "react";
import { Check, Keyboard, Smartphone, Wifi } from "lucide-react";
import { api, asAdbError } from "../../lib/api";
import type { AdbError, MdnsService } from "../../lib/types";
import { usePairingServices } from "../../hooks/usePairingServices";
import { Button } from "../ui/Button";
import { OtpInput } from "./OtpInput";
import { QR_SERVICE_PREFIX } from "./QrPairing";
import { BusyLine, ErrorNotice, MdnsWarning, PhoneSteps, Strong, friendlyServiceName } from "./shared";

const CODE_LENGTH = 6;

export function CodePairing({ onPaired }: { onPaired: () => void }) {
  const [pairing, setPairing] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<AdbError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [manualAddress, setManualAddress] = useState("");

  const { services, failed } = usePairingServices(!pairing && !manual);
  // Serviços abertos por um QR Code nosso não são telas de "código de pareamento".
  const phones = services.filter((s) => !s.name.startsWith(QR_SERVICE_PREFIX));

  // Com um único celular na rede, ele já vem selecionado.
  const selected = phones.find((s) => s.address === chosen)?.address ?? (phones.length === 1 ? phones[0].address : null);
  const target = manual ? manualAddress.trim() : selected;

  const submit = async (secret = code) => {
    if (!target || secret.length !== CODE_LENGTH || pairing) return;
    setPairing(true);
    setError(null);
    try {
      await api.pairDevice(target, secret);
      onPaired();
    } catch (err) {
      setError(asAdbError(err));
      setCode("");
      setAttempt((n) => n + 1);
      setPairing(false);
    }
  };

  return (
    <div className="grid grid-cols-[240px_1fr] gap-7 p-6">
      <div>
        <h3 className="text-[15px] font-semibold text-zinc-50">No celular</h3>
        <p className="mt-1 mb-5 text-[13px] text-zinc-500">Mantenha a tela do código aberta.</p>
        <PhoneSteps
          steps={[
            <>
              Abra <Strong>Opções do desenvolvedor</Strong>
            </>,
            <>
              Toque em <Strong>Depuração por Wi-Fi</Strong>
            </>,
            <>
              Escolha <Strong>Parear dispositivo com código de pareamento</Strong>
            </>,
            <>Digite aqui o código de 6 dígitos</>,
          ]}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <SectionLabel>Celular</SectionLabel>
            <button
              onClick={() => setManual((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 transition-colors hover:text-zinc-200"
            >
              {manual ? <Wifi className="size-3" /> : <Keyboard className="size-3" />}
              {manual ? "Procurar na rede" : "Digitar IP e porta"}
            </button>
          </div>

          {manual ? (
            <input
              autoFocus
              value={manualAddress}
              onChange={(e) => setManualAddress(e.target.value)}
              placeholder="192.168.0.10:37123"
              spellCheck={false}
              className="h-11 w-full rounded-xl bg-black/30 px-3.5 font-mono text-sm text-zinc-100 ring-1 ring-inset ring-white/[0.08] outline-none placeholder:text-zinc-600 focus:ring-emerald-400/50"
            />
          ) : phones.length === 0 ? (
            failed ? <MdnsWarning /> : <Searching />
          ) : (
            <ul className="space-y-1.5">
              {phones.map((phone) => (
                <PhoneOption
                  key={phone.address}
                  phone={phone}
                  selected={phone.address === selected}
                  onSelect={() => setChosen(phone.address)}
                />
              ))}
            </ul>
          )}
        </section>

        <section className={target ? "" : "pointer-events-none opacity-40 transition-opacity"}>
          <SectionLabel>Código de pareamento</SectionLabel>
          <div className="mt-2" key={attempt}>
            <OtpInput
              value={code}
              length={CODE_LENGTH}
              disabled={pairing || !target}
              invalid={error !== null && code === ""}
              onChange={(value) => {
                setCode(value);
                if (value) setError(null);
              }}
              onComplete={submit}
            />
          </div>
        </section>

        <div className="mt-auto">
          {pairing ? (
            <BusyLine>Pareando e conectando…</BusyLine>
          ) : error ? (
            <ErrorNotice error={error} />
          ) : (
            <Button
              variant="primary"
              disabled={!target || code.length !== CODE_LENGTH}
              onClick={() => submit()}
            >
              Parear
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">{children}</p>;
}

function Searching() {
  return (
    <div className="flex items-center gap-4 rounded-xl bg-white/[0.02] p-4 ring-1 ring-inset ring-white/[0.06]">
      <div className="relative flex size-10 items-center justify-center">
        <span className="absolute inset-0 animate-ping-slow rounded-full bg-emerald-400/20" />
        <span className="absolute inset-1.5 animate-ping-slow rounded-full bg-emerald-400/20 [animation-delay:600ms]" />
        <Wifi className="relative size-4 text-emerald-300" />
      </div>
      <div className="text-[13px]">
        <p className="font-medium text-zinc-200">Procurando celulares na rede…</p>
        <p className="text-xs text-zinc-500">Eles aparecem aqui assim que a tela do código abrir.</p>
      </div>
    </div>
  );
}

function PhoneOption({ phone, selected, onSelect }: { phone: MdnsService; selected: boolean; onSelect: () => void }) {
  return (
    <li className="animate-pop-in">
      <button
        onClick={onSelect}
        aria-pressed={selected}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-1 ring-inset transition-all duration-150 ${
          selected
            ? "bg-emerald-400/[0.07] ring-emerald-400/30"
            : "bg-white/[0.02] ring-white/[0.06] hover:bg-white/[0.04] hover:ring-white/[0.12]"
        }`}
      >
        <Smartphone className={`size-4 ${selected ? "text-emerald-300" : "text-zinc-500"}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-zinc-100">{friendlyServiceName(phone.name)}</p>
          <p className="font-mono text-[11px] text-zinc-500">{phone.address}</p>
        </div>
        <span
          className={`flex size-4 items-center justify-center rounded-full ring-1 transition-colors ${
            selected ? "bg-emerald-400 ring-emerald-400" : "ring-white/20"
          }`}
        >
          {selected && <Check className="size-3 text-emerald-950" strokeWidth={3} />}
        </span>
      </button>
    </li>
  );
}
