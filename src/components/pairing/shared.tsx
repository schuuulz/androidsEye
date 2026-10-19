import type { ReactNode } from "react";
import { AlertCircle, TriangleAlert } from "lucide-react";
import type { AdbError } from "../../lib/types";
import { Spinner } from "../ui/Spinner";

/** Passo a passo numerado do que fazer no celular. */
export function PhoneSteps({ steps }: { steps: ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => (
        <li key={index} className="flex gap-3 text-[13px] leading-relaxed text-zinc-400">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-semibold text-zinc-300 ring-1 ring-inset ring-white/[0.08]">
            {index + 1}
          </span>
          <span className="pt-px">{step}</span>
        </li>
      ))}
    </ol>
  );
}

export function Strong({ children }: { children: ReactNode }) {
  return <b className="font-medium text-zinc-100">{children}</b>;
}

export function WaitingLine({ children }: { children: ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2.5 text-[13px] text-zinc-400">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping-slow rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
      </span>
      {children}
    </p>
  );
}

export function BusyLine({ children }: { children: ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2.5 text-[13px] text-zinc-300">
      <Spinner className="size-4 text-emerald-400" />
      {children}
    </p>
  );
}

export function ErrorNotice({ error, action }: { error: AdbError; action?: ReactNode }) {
  return (
    <div className="flex animate-pop-in items-start gap-2.5 rounded-xl bg-rose-500/[0.07] p-3 ring-1 ring-inset ring-rose-400/20">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-300" />
      <div className="min-w-0 flex-1 text-xs leading-relaxed">
        <p className="font-medium text-rose-200">{error.message}</p>
        {error.hint && <p className="text-rose-100/60">{error.hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function MdnsWarning() {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-amber-400/[0.06] p-3 text-xs leading-relaxed text-amber-100/70 ring-1 ring-inset ring-amber-400/15">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" />
      Não foi possível procurar celulares na rede. Confira se o firewall permite o adb e se ambos estão no mesmo
      Wi-Fi.
    </div>
  );
}

/** Nomes como `adb-RXCT20176QK-GMEZOq` viram `RXCT20176QK`. */
export function friendlyServiceName(name: string) {
  return /^adb-(.+)-[^-]+$/.exec(name)?.[1] ?? name;
}
