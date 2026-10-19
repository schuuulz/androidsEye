import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { api } from "../lib/api";
import { deviceName, type Device } from "../lib/types";

interface MirrorFailure {
  serial: string;
  message: string;
}

/**
 * Lista de dispositivos sempre atualizada: um snapshot inicial e, depois,
 * eventos empurrados pelo backend a cada mudança — sem botão de atualizar.
 */
export function useDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const previous = useRef<Map<string, Device> | null>(null);

  useEffect(() => {
    let disposed = false;

    const apply = (next: Device[]) => {
      if (disposed) return;
      announceChanges(previous.current, next);
      previous.current = new Map(next.map((d) => [d.id, d]));
      setDevices(next);
      setLoading(false);
    };

    const unlisten = Promise.all([
      listen<Device[]>("devices:changed", (event) => apply(event.payload)),
      listen<MirrorFailure>("mirror:failed", ({ payload }) =>
        toast.error("O espelhamento foi interrompido", { description: payload.message }),
      ),
    ]);

    api.listDevices().then((initial) => {
      // O primeiro snapshot pode chegar vazio enquanto o adb inicia o servidor;
      // mantemos o skeleton por um instante para não piscar o estado vazio.
      if (initial.length > 0) apply(initial);
      else setTimeout(() => !disposed && previous.current === null && apply([]), 1200);
    });

    return () => {
      disposed = true;
      unlisten.then((fns) => fns.forEach((fn) => fn()));
    };
  }, []);

  return { devices, loading };
}

/** Saídas provocadas pelo próprio usuário (ex.: desparear) já têm seu toast. */
const expectedDepartures = new Set<string>();

export function expectDeparture(id: string) {
  expectedDepartures.add(id);
}

function announceChanges(before: Map<string, Device> | null, after: Device[]) {
  if (before === null) return; // primeira carga: nada de toasts

  for (const device of after) {
    const old = before.get(device.id);
    if (device.state === "online" && old?.state !== "online") {
      toast.success(`${deviceName(device)} conectado`, {
        description: device.connection === "wifi" ? "Via Wi-Fi" : "Via USB",
      });
    } else if (device.state === "unauthorized" && old?.state !== "unauthorized") {
      toast.warning("Autorização pendente", {
        description: "Aceite o diálogo de depuração USB na tela do aparelho.",
      });
    }
  }

  const present = new Set(after.map((d) => d.id));
  for (const [id, device] of before) {
    if (present.has(id)) continue;
    if (expectedDepartures.delete(id)) continue;
    if (device.state === "online") toast(`${deviceName(device)} desconectado`);
  }
}
