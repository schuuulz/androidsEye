import { useState } from "react";
import {
  BatteryCharging,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  Check,
  Copy,
  Link2Off,
  Package,
  ScreenShare,
  ShieldAlert,
  Smartphone,
  SquareTerminal,
  Usb,
  Wifi,
  X,
} from "lucide-react";
import { api, notifyError } from "../lib/api";
import { deviceName, type Battery, type Device } from "../lib/types";
import { StatusBadge } from "./StatusBadge";
import { UnpairDialog } from "./UnpairDialog";
import { Button, IconButton } from "./ui/Button";

interface DeviceCardProps {
  device: Device;
  onOpenTerminal: (device: Device) => void;
  onOpenApks: (device: Device) => void;
}

export function DeviceCard({ device, onOpenTerminal, onOpenApks }: DeviceCardProps) {
  const [starting, setStarting] = useState(false);
  const [unpairing, setUnpairing] = useState(false);
  const online = device.state === "online";
  const name = deviceName(device);

  const toggleMirror = async () => {
    if (device.mirroring) {
      await api.stopMirror(device.serial);
      return;
    }
    setStarting(true);
    try {
      await api.startMirror(device.serial, name);
    } catch (error) {
      notifyError(error, "Não foi possível iniciar o espelhamento");
    } finally {
      // O scrcpy leva um instante para abrir a janela; mantém o feedback até lá.
      setTimeout(() => setStarting(false), 600);
    }
  };

  return (
    <article
      className={`group relative flex animate-pop-in flex-col rounded-2xl border bg-surface/80 p-4 transition-all duration-200 ${
        device.mirroring
          ? "border-emerald-400/30 shadow-[0_0_0_1px_rgb(52_211_153/0.15),0_12px_40px_-12px_rgb(16_185_129/0.35)]"
          : "border-line hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_12px_32px_-16px_rgb(0_0_0/0.8)]"
      } ${device.state === "offline" ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-3">
        <DeviceAvatar device={device} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold text-zinc-50" title={name}>
              {name}
            </h3>
          </div>
          <p className="truncate text-xs text-zinc-500">{device.manufacturer ?? "Android"}</p>
        </div>

        {device.connection === "wifi" && (
          <>
            <IconButton
              label="Desparear"
              className="opacity-0 group-hover:opacity-100 hover:text-rose-300 focus-visible:opacity-100"
              onClick={() => setUnpairing(true)}
            >
              <Link2Off className="size-4" />
            </IconButton>
            <UnpairDialog device={device} open={unpairing} onClose={() => setUnpairing(false)} />
          </>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <StatusBadge state={device.state} />
        {device.mirroring && <MirroringBadge />}
        <div className="flex-1" />
        {device.battery && <BatteryIndicator battery={device.battery} />}
      </div>

      <SerialChip serial={device.serial} connection={device.connection} />

      {device.state === "unauthorized" && <AuthorizationHelp />}

      <div className="mt-4 flex items-center gap-2 border-t border-line/70 pt-3.5">
        <Button
          variant={device.mirroring ? "danger" : "primary"}
          size="sm"
          className="flex-1"
          disabled={!online}
          loading={starting}
          icon={device.mirroring ? <X className="size-4" /> : <ScreenShare className="size-4" />}
          onClick={toggleMirror}
        >
          {device.mirroring ? "Parar espelhamento" : starting ? "Abrindo…" : "Espelhar"}
        </Button>
        <Button
          size="sm"
          disabled={!online}
          icon={<SquareTerminal className="size-4" />}
          onClick={() => onOpenTerminal(device)}
        >
          Shell
        </Button>
        <Button
          size="sm"
          disabled={!online}
          icon={<Package className="size-4" />}
          onClick={() => onOpenApks(device)}
        >
          APK
        </Button>
      </div>
    </article>
  );
}

function DeviceAvatar({ device }: { device: Device }) {
  const tone =
    device.state === "online"
      ? "from-emerald-400/20 to-emerald-400/5 text-emerald-300 ring-emerald-400/20"
      : device.state === "unauthorized"
        ? "from-amber-400/20 to-amber-400/5 text-amber-300 ring-amber-400/20"
        : "from-zinc-400/10 to-transparent text-zinc-500 ring-white/10";

  return (
    <div
      className={`relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b ring-1 ring-inset ${tone}`}
    >
      <Smartphone className="size-5" strokeWidth={1.75} />
      <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-elevated text-zinc-300 ring-2 ring-surface">
        {device.connection === "wifi" ? <Wifi className="size-3" /> : <Usb className="size-3" />}
      </span>
    </div>
  );
}

function MirroringBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-400/10 px-2 py-0.5 text-[11px] font-medium text-sky-300 ring-1 ring-inset ring-sky-400/20">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping-slow rounded-full bg-sky-400 opacity-75" />
        <span className="relative inline-flex size-1.5 rounded-full bg-sky-400" />
      </span>
      Espelhando
    </span>
  );
}

function BatteryIndicator({ battery }: { battery: Battery }) {
  const Icon = battery.charging
    ? BatteryCharging
    : battery.level > 70
      ? BatteryFull
      : battery.level > 25
        ? BatteryMedium
        : BatteryLow;
  const color = battery.charging
    ? "text-emerald-300"
    : battery.level <= 15
      ? "text-rose-400"
      : "text-zinc-400";

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium tabular-nums ${color}`}
      title={battery.charging ? "Carregando" : "Bateria"}
    >
      <Icon className="size-4" strokeWidth={1.75} />
      {battery.level}%
    </span>
  );
}

function SerialChip({ serial, connection }: { serial: string; connection: Device["connection"] }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(serial);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <button
      onClick={copy}
      title="Copiar"
      className="mt-3 flex w-full items-center gap-2 rounded-lg bg-black/25 px-2.5 py-1.5 text-left font-mono text-[11.5px] text-zinc-400 ring-1 ring-inset ring-white/[0.04] transition-colors hover:text-zinc-200"
    >
      <span className="text-[10px] font-sans font-medium tracking-wide text-zinc-600 uppercase">
        {connection === "wifi" ? "IP" : "Serial"}
      </span>
      <span className="min-w-0 flex-1 truncate">{serial}</span>
      {copied ? (
        <Check className="size-3.5 text-emerald-400" />
      ) : (
        <Copy className="size-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
      )}
    </button>
  );
}

function AuthorizationHelp() {
  return (
    <div className="mt-3 flex gap-2.5 rounded-xl bg-amber-400/[0.06] p-3 ring-1 ring-inset ring-amber-400/15">
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-300" />
      <div className="text-xs leading-relaxed text-amber-100/80">
        <p className="font-medium text-amber-200">Aceite a chave RSA no celular</p>
        <ol className="mt-1 list-inside list-decimal space-y-0.5 text-amber-100/60 marker:text-amber-300/50">
          <li>Desbloqueie a tela do aparelho</li>
          <li>Toque em “Permitir depuração USB”</li>
          <li>Marque “Sempre permitir deste computador”</li>
        </ol>
      </div>
    </div>
  );
}
