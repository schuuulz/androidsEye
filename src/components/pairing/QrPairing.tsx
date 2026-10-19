import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { RefreshCw, TimerOff } from "lucide-react";
import { api, asAdbError } from "../../lib/api";
import type { AdbError } from "../../lib/types";
import { usePairingServices } from "../../hooks/usePairingServices";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { BusyLine, ErrorNotice, MdnsWarning, PhoneSteps, Strong, WaitingLine } from "./shared";

const QR_LIFETIME_SECONDS = 120;
export const QR_SERVICE_PREFIX = "androidseye-";

type Phase = "waiting" | "pairing" | "expired" | "error";

function randomString(length: number, alphabet: string) {
  return Array.from(crypto.getRandomValues(new Uint32Array(length)), (n) => alphabet[n % alphabet.length]).join("");
}

/** Mesmo formato que o Android Studio usa: o celular procura este nome via mDNS. */
function createCredentials() {
  const name = QR_SERVICE_PREFIX + randomString(6, "abcdefghijklmnopqrstuvwxyz0123456789");
  const password = randomString(12, "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789");
  return { name, password, payload: `WIFI:T:ADB;S:${name};P:${password};;` };
}

export function QrPairing({ onPaired }: { onPaired: () => void }) {
  const [credentials, setCredentials] = useState(createCredentials);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [error, setError] = useState<AdbError | null>(null);
  const [remaining, setRemaining] = useState(QR_LIFETIME_SECONDS);
  const { services, failed } = usePairingServices(phase === "waiting");
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  const markup = useQrSvg(credentials.payload);

  // Contagem regressiva: QR antigo deixa de ser válido para evitar pareamentos esquecidos.
  useEffect(() => {
    if (phase !== "waiting") return;
    if (remaining <= 0) return setPhase("expired");
    const timer = window.setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [phase, remaining]);

  // O celular leu o QR quando passa a anunciar o serviço com o nosso nome.
  useEffect(() => {
    if (phase !== "waiting") return;
    const scanned = services.find((s) => s.name === credentials.name);
    if (!scanned) return;

    setPhase("pairing");
    api
      .pairDevice(scanned.address, credentials.password)
      .then(() => mounted.current && onPaired())
      .catch((err) => {
        if (!mounted.current) return;
        setError(asAdbError(err));
        setPhase("error");
      });
  }, [services, phase, credentials, onPaired]);

  const regenerate = () => {
    setCredentials(createCredentials());
    setRemaining(QR_LIFETIME_SECONDS);
    setError(null);
    setPhase("waiting");
  };

  return (
    <div className="grid grid-cols-[auto_1fr] gap-7 p-6">
      <div className="flex flex-col items-center">
        <div className="relative size-[212px] overflow-hidden rounded-2xl bg-white p-3.5 shadow-[0_20px_50px_-20px_rgb(16_185_129/0.45)] ring-1 ring-white/20">
          <div
            className={`size-full transition-all duration-300 [&>svg]:size-full ${
              phase === "waiting" ? "" : "scale-95 opacity-30 blur-[3px]"
            }`}
            dangerouslySetInnerHTML={{ __html: markup }}
          />
          {phase === "pairing" && (
            <div className="absolute inset-0 flex animate-fade-in items-center justify-center">
              <Spinner className="size-9 text-emerald-600" />
            </div>
          )}
          {phase === "expired" && (
            <div className="absolute inset-0 flex animate-fade-in flex-col items-center justify-center gap-3 text-zinc-900">
              <TimerOff className="size-7 text-zinc-500" />
              <span className="text-sm font-medium">QR Code expirado</span>
            </div>
          )}
        </div>

        <div className="mt-4 h-1 w-[180px] overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-emerald-400/70 transition-[width] duration-1000 ease-linear"
            style={{ width: `${(Math.max(remaining, 0) / QR_LIFETIME_SECONDS) * 100}%` }}
          />
        </div>
        <span className="mt-2 text-[11px] text-zinc-500 tabular-nums">
          {phase === "waiting" ? `Expira em ${formatTime(remaining)}` : " "}
        </span>
      </div>

      <div className="flex min-w-0 flex-col">
        <h3 className="text-[15px] font-semibold text-zinc-50">Escaneie com o celular</h3>
        <p className="mt-1 mb-5 text-[13px] text-zinc-500">A câmera do próprio menu de depuração lê o código.</p>

        <PhoneSteps
          steps={[
            <>
              Abra <Strong>Opções do desenvolvedor</Strong>
            </>,
            <>
              Ative <Strong>Depuração por Wi-Fi</Strong> e toque nela
            </>,
            <>
              Escolha <Strong>Parear dispositivo com código QR</Strong>
            </>,
            <>Aponte a câmera para este código</>,
          ]}
        />

        <div className="mt-auto space-y-3 pt-6">
          {failed && phase === "waiting" && <MdnsWarning />}
          {phase === "waiting" && <WaitingLine>Aguardando a leitura do QR Code…</WaitingLine>}
          {phase === "pairing" && <BusyLine>Celular encontrado — pareando e conectando…</BusyLine>}
          {phase === "error" && error && (
            <ErrorNotice
              error={error}
              action={
                <Button size="sm" onClick={regenerate}>
                  Tentar de novo
                </Button>
              }
            />
          )}
          {phase === "expired" && (
            <Button variant="primary" icon={<RefreshCw className="size-4" />} onClick={regenerate}>
              Gerar novo QR Code
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function useQrSvg(payload: string) {
  const [markup, setMarkup] = useState("");
  useEffect(() => {
    let current = true;
    QRCode.toString(payload, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#09090b", light: "#ffffff" },
    }).then((svg) => current && setMarkup(svg));
    return () => {
      current = false;
    };
  }, [payload]);
  return markup;
}

function formatTime(seconds: number) {
  const s = Math.max(seconds, 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
