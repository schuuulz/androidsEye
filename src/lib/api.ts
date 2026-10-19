import { Channel, invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type {
  AdbError,
  DependencyReport,
  Device,
  MdnsService,
  Package,
  PullProgress,
  PullResult,
  ShellEvent,
} from "./types";

/** Wrappers tipados de todos os comandos expostos pelo backend. */
export const api = {
  checkDependencies: () => invoke<DependencyReport>("check_dependencies"),
  listDevices: () => invoke<Device[]>("list_devices"),
  connectWifi: (address: string) => invoke<string>("connect_wifi", { address }),
  unpairDevice: (serial: string, disableWirelessDebugging: boolean) =>
    invoke<void>("unpair_device", { serial, disableWirelessDebugging }),
  listPairingServices: () => invoke<MdnsService[]>("list_pairing_services"),
  pairDevice: (address: string, secret: string) => invoke<void>("pair_device", { address, secret }),

  startMirror: (serial: string, title: string) => invoke<void>("start_mirror", { serial, title }),
  stopMirror: (serial: string) => invoke<void>("stop_mirror", { serial }),

  shellOpen: (serial: string, cols: number, rows: number, onEvent: (event: ShellEvent) => void) => {
    const channel = new Channel<ShellEvent>();
    channel.onmessage = onEvent;
    return invoke<number>("shell_open", { serial, cols, rows, onEvent: channel });
  },
  shellWrite: (id: number, data: string) => invoke<void>("shell_write", { id, data }),
  shellResize: (id: number, cols: number, rows: number) =>
    invoke<void>("shell_resize", { id, cols, rows }),
  shellClose: (id: number) => invoke<void>("shell_close", { id }),

  listPackages: (serial: string, userOnly: boolean) =>
    invoke<Package[]>("list_packages", { serial, userOnly }),
  pullApk: (
    serial: string,
    pkg: string,
    destination: string,
    onProgress: (progress: PullProgress) => void,
  ) => {
    const channel = new Channel<PullProgress>();
    channel.onmessage = onProgress;
    return invoke<PullResult>("pull_apk", { serial, package: pkg, destination, onProgress: channel });
  },
  cancelPull: (serial: string, pkg: string) => invoke<void>("cancel_pull", { serial, package: pkg }),
};

/** Normaliza qualquer rejeição em um `AdbError`. */
export function asAdbError(error: unknown): AdbError {
  if (error && typeof error === "object" && "kind" in error && "message" in error) {
    return error as AdbError;
  }
  return { kind: "commandFailed", message: String(error), hint: null };
}

export function notifyError(error: unknown, title?: string) {
  const err = asAdbError(error);
  if (err.kind === "cancelled") return;
  toast.error(title ?? err.message, {
    description: title ? [err.message, err.hint].filter(Boolean).join(" — ") : err.hint ?? undefined,
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
