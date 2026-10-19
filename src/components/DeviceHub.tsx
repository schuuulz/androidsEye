import { useState } from "react";
import { Cable, Plus, QrCode, Smartphone } from "lucide-react";
import { useDevices } from "../hooks/useDevices";
import type { Device } from "../lib/types";
import { AdbTerminalDrawer } from "./AdbTerminal";
import { ApkExtractorModal } from "./ApkExtractorModal";
import { DeviceCard } from "./DeviceCard";
import { Logo } from "./Logo";
import { AddDeviceModal } from "./pairing/AddDeviceModal";
import { Button } from "./ui/Button";

export function DeviceHub() {
  const { devices, loading } = useDevices();
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [apkId, setApkId] = useState<string | null>(null);
  const [addingDevice, setAddingDevice] = useState(false);

  // Overlays seguem o dispositivo ao vivo: se ele desconectar, o overlay fecha.
  const find = (id: string | null) =>
    devices.find((d) => d.id === id && d.state === "online") ?? null;
  const terminalDevice = find(terminalId);
  const apkDevice = find(apkId);

  const online = devices.filter((d) => d.state === "online").length;

  return (
    <div className="app-backdrop flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line/70 bg-canvas/40 px-6 py-4 backdrop-blur-xl">
        <Logo className="size-8" />
        <div className="flex-1">
          <h1 className="text-[15px] font-semibold tracking-tight text-zinc-50">androidsEye</h1>
          <p className="text-xs text-zinc-500">
            {loading
              ? "Procurando dispositivos…"
              : devices.length === 0
                ? "Nenhum dispositivo conectado"
                : `${online} de ${devices.length} ${devices.length === 1 ? "dispositivo" : "dispositivos"} online`}
          </p>
        </div>
        <Button icon={<Plus className="size-4" />} onClick={() => setAddingDevice(true)}>
          Adicionar dispositivo
        </Button>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <Grid>
            {[0, 1, 2].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </Grid>
        ) : devices.length === 0 ? (
          <EmptyHub onPair={() => setAddingDevice(true)} />
        ) : (
          <Grid>
            {devices.map((device) => (
              <DeviceCard
                key={device.id}
                device={device}
                onOpenTerminal={(d: Device) => setTerminalId(d.id)}
                onOpenApks={(d: Device) => setApkId(d.id)}
              />
            ))}
          </Grid>
        )}
      </main>

      <AdbTerminalDrawer device={terminalDevice} onClose={() => setTerminalId(null)} />
      <ApkExtractorModal device={apkDevice} onClose={() => setApkId(null)} />
      <AddDeviceModal open={addingDevice} onClose={() => setAddingDevice(false)} />
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">{children}</div>;
}

function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-surface/60 p-4">
      <div className="flex items-center gap-3">
        <div className="skeleton size-11 rounded-xl" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3.5 w-1/2 rounded" />
          <div className="skeleton h-2.5 w-1/4 rounded" />
        </div>
      </div>
      <div className="skeleton mt-4 h-5 w-24 rounded-full" />
      <div className="skeleton mt-3 h-7 rounded-lg" />
      <div className="mt-4 flex gap-2 border-t border-line/70 pt-3.5">
        <div className="skeleton h-8 flex-1 rounded-lg" />
        <div className="skeleton h-8 w-20 rounded-lg" />
        <div className="skeleton h-8 w-16 rounded-lg" />
      </div>
    </div>
  );
}

function EmptyHub({ onPair }: { onPair: () => void }) {
  return (
    <div className="flex h-full min-h-[420px] animate-fade-in flex-col items-center justify-center text-center">
      <div className="relative">
        <div className="absolute inset-0 animate-ping-slow rounded-3xl bg-emerald-400/10" />
        <div className="relative flex size-20 items-center justify-center rounded-3xl bg-gradient-to-b from-white/[0.07] to-white/[0.02] ring-1 ring-inset ring-white/[0.08]">
          <Smartphone className="size-9 text-zinc-400" strokeWidth={1.5} />
        </div>
      </div>
      <h2 className="mt-6 text-base font-semibold text-zinc-100">Conecte um dispositivo Android</h2>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-zinc-500">
        Plugue o cabo USB com a <span className="text-zinc-300">Depuração USB</span> ativada e ele aparecerá aqui
        automaticamente.
      </p>

      <div className="mt-6 flex w-full max-w-md items-center gap-4 rounded-2xl bg-white/[0.025] p-4 text-left ring-1 ring-inset ring-white/[0.07]">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300 ring-1 ring-inset ring-emerald-400/20">
          <QrCode className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-zinc-200">Ativou a depuração por Wi-Fi?</p>
          <p className="text-xs leading-relaxed text-zinc-500">
            Na primeira vez, o celular só aparece aqui depois de ser pareado com este computador.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={onPair}>
          Parear
        </Button>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-zinc-600">
        <Cable className="size-3.5" />
        Sem as opções de desenvolvedor? Configurações › Sobre o telefone › toque 7× em “Número da versão”
      </div>
    </div>
  );
}
