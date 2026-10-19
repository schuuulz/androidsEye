export type DeviceState = "online" | "unauthorized" | "offline";
export type Connection = "usb" | "wifi";

export interface Battery {
  level: number;
  charging: boolean;
}

export interface Device {
  /** Aparelho físico (estável); `serial` é o transporte adb usado nas ações. */
  id: string;
  serial: string;
  state: DeviceState;
  connection: Connection;
  model: string | null;
  manufacturer: string | null;
  battery: Battery | null;
  mirroring: boolean;
}

export interface ToolStatus {
  found: boolean;
  path: string | null;
  version: string | null;
}

export interface DependencyReport {
  adb: ToolStatus;
  scrcpy: ToolStatus;
}

export interface Package {
  name: string;
  system: boolean;
}

export interface MdnsService {
  name: string;
  kind: "pairing" | "connect";
  address: string;
}

export interface PullProgress {
  received: number;
  total: number;
}

export interface PullResult {
  path: string;
  bytes: number;
  splitCount: number;
}

export type ShellEvent =
  | { type: "data"; data: string }
  | { type: "exit"; code: number | null };

export type AdbErrorKind =
  | "binaryNotFound"
  | "deviceNotFound"
  | "unauthorized"
  | "offline"
  | "alreadyMirroring"
  | "sessionNotFound"
  | "timeout"
  | "pairingFailed"
  | "cancelled"
  | "commandFailed"
  | "io";

export interface AdbError {
  kind: AdbErrorKind;
  message: string;
  hint: string | null;
}

export function deviceName(device: Device): string {
  return device.model ?? device.serial;
}
