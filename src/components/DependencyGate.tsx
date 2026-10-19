import type { ReactNode } from "react";
import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import type { DependencyReport, ToolStatus } from "../lib/types";
import { Button } from "./ui/Button";
import { Spinner } from "./ui/Spinner";
import { Logo } from "./Logo";

interface DependencyGateProps {
  report: DependencyReport | null;
  checking: boolean;
  onRecheck: () => void;
  children: ReactNode;
}

const platform = navigator.userAgent.includes("Windows")
  ? "windows"
  : navigator.userAgent.includes("Mac")
    ? "mac"
    : "linux";

const installHints: Record<"adb" | "scrcpy", Record<typeof platform, string>> = {
  adb: {
    windows: "winget install Google.PlatformTools",
    mac: "brew install android-platform-tools",
    linux: "sudo apt install android-tools-adb",
  },
  scrcpy: {
    windows: "winget install Genymobile.scrcpy",
    mac: "brew install scrcpy",
    linux: "sudo apt install scrcpy",
  },
};

/** Só libera o app quando adb e scrcpy estão disponíveis. */
export function DependencyGate({ report, checking, onRecheck, children }: DependencyGateProps) {
  if (report?.adb.found && report.scrcpy.found) return <>{children}</>;

  return (
    <div className="app-backdrop flex h-full items-center justify-center p-8">
      {report === null ? (
        <div className="flex animate-fade-in flex-col items-center gap-4 text-zinc-500">
          <Logo className="size-12" />
          <span className="inline-flex items-center gap-2 text-sm">
            <Spinner className="size-4" /> Verificando ferramentas…
          </span>
        </div>
      ) : (
        <div className="w-full max-w-lg animate-pop-in rounded-2xl border border-line bg-surface/90 p-7 shadow-2xl shadow-black/50">
          <Logo className="size-11" />
          <h1 className="mt-5 text-lg font-semibold text-zinc-50">Quase lá</h1>
          <p className="mt-1 text-sm leading-relaxed text-zinc-400">
            O androidsEye usa o <b className="font-medium text-zinc-200">adb</b> e o{" "}
            <b className="font-medium text-zinc-200">scrcpy</b> instalados no seu sistema. Instale o que estiver
            faltando e verifique novamente.
          </p>

          <div className="mt-6 space-y-2.5">
            <ToolRow name="adb" description="Android Platform Tools" status={report.adb} />
            <ToolRow name="scrcpy" description="Espelhamento de tela" status={report.scrcpy} />
          </div>

          <div className="mt-6 flex items-center justify-between gap-4">
            <p className="text-xs text-zinc-500">
              Instalou em outro local? Defina <code className="text-zinc-400">ADB_PATH</code> ou{" "}
              <code className="text-zinc-400">SCRCPY_PATH</code>.
            </p>
            <Button
              variant="primary"
              loading={checking}
              icon={<RefreshCw className="size-4" />}
              onClick={onRecheck}
            >
              Verificar novamente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolRow({ name, description, status }: { name: "adb" | "scrcpy"; description: string; status: ToolStatus }) {
  return (
    <div
      className={`rounded-xl p-3.5 ring-1 ring-inset ${
        status.found ? "bg-emerald-400/[0.04] ring-emerald-400/15" : "bg-rose-400/[0.04] ring-rose-400/15"
      }`}
    >
      <div className="flex items-center gap-3">
        {status.found ? (
          <CheckCircle2 className="size-5 text-emerald-400" />
        ) : (
          <XCircle className="size-5 text-rose-400" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-100">
            {name} <span className="font-normal text-zinc-500">· {description}</span>
          </p>
          <p className="truncate text-xs text-zinc-500" title={status.path ?? undefined}>
            {status.found ? (status.version ?? status.path) : "Não encontrado no PATH"}
          </p>
        </div>
      </div>
      {!status.found && (
        <code className="mt-3 block rounded-lg bg-black/40 px-3 py-2 font-mono text-xs text-zinc-300 select-text">
          {installHints[name][platform]}
        </code>
      )}
    </div>
  );
}
