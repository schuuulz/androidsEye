import type { DeviceState } from "../lib/types";

const styles: Record<DeviceState, { label: string; dot: string; badge: string }> = {
  online: {
    label: "Online",
    dot: "bg-emerald-400 shadow-[0_0_8px_rgb(52_211_153/0.8)]",
    badge: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20",
  },
  unauthorized: {
    label: "Não autorizado",
    dot: "bg-amber-400 shadow-[0_0_8px_rgb(251_191_36/0.7)]",
    badge: "bg-amber-400/10 text-amber-300 ring-amber-400/20",
  },
  noPermission: {
    label: "Sem permissão USB",
    dot: "bg-amber-400 shadow-[0_0_8px_rgb(251_191_36/0.7)]",
    badge: "bg-amber-400/10 text-amber-300 ring-amber-400/20",
  },
  offline: {
    label: "Offline",
    dot: "bg-zinc-500",
    badge: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/20",
  },
};

export function StatusBadge({ state }: { state: DeviceState }) {
  const style = styles[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${style.badge}`}
    >
      <span className={`size-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}
