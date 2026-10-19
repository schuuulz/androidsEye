import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { downloadDir, join } from "@tauri-apps/api/path";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { AlertCircle, Check, Download, FolderOpen, Package, PackageSearch, Search, X } from "lucide-react";

import { api, asAdbError, formatBytes, notifyError } from "../lib/api";
import { deviceName, type AdbError, type Device, type Package as AppPackage } from "../lib/types";
import { Modal } from "./ui/Overlay";
import { Button, IconButton } from "./ui/Button";
import { SegmentedControl } from "./ui/SegmentedControl";

type Scope = "user" | "all";

type Transfer =
  | { status: "running"; received: number; total: number }
  | { status: "done"; path: string };

interface ApkExtractorModalProps {
  device: Device | null;
  onClose: () => void;
}

export function ApkExtractorModal({ device, onClose }: ApkExtractorModalProps) {
  const [scope, setScope] = useState<Scope>("user");
  const [query, setQuery] = useState("");
  const [packages, setPackages] = useState<AppPackage[] | null>(null);
  const [error, setError] = useState<AdbError | null>(null);
  const [transfers, setTransfers] = useState<Record<string, Transfer>>({});
  const [reload, setReload] = useState(0);
  const serial = device?.serial;

  // Recarrega a lista ao abrir, trocar de dispositivo ou de filtro.
  useEffect(() => {
    if (!serial) return;
    let cancelled = false;
    setPackages(null);
    setError(null);
    api
      .listPackages(serial, scope === "user")
      .then((list) => !cancelled && setPackages(list))
      .catch((err) => !cancelled && setError(asAdbError(err)));
    return () => {
      cancelled = true;
    };
  }, [serial, scope, reload]);

  // Ao fechar: limpa a busca e cancela downloads em andamento.
  useEffect(() => {
    if (serial) return;
    setQuery("");
    setTransfers({});
  }, [serial]);

  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const visible = useMemo(
    () => (packages ?? []).filter((p) => p.name.toLowerCase().includes(deferredQuery)),
    [packages, deferredQuery],
  );

  const setTransfer = (name: string, transfer: Transfer | null) =>
    setTransfers((current) => {
      const next = { ...current };
      if (transfer) next[name] = transfer;
      else delete next[name];
      return next;
    });

  const download = async (pkg: string) => {
    if (!serial) return;
    const destination = await save({
      title: "Salvar APK",
      defaultPath: await join(await downloadDir(), `${pkg}.apk`),
      filters: [{ name: "Pacote Android", extensions: ["apk"] }],
    });
    if (!destination) return;

    setTransfer(pkg, { status: "running", received: 0, total: 0 });
    try {
      const result = await api.pullApk(serial, pkg, destination, ({ received, total }) =>
        setTransfer(pkg, { status: "running", received, total }),
      );
      setTransfer(pkg, { status: "done", path: result.path });
      toast.success("APK salvo", {
        description:
          result.splitCount > 0
            ? `${formatBytes(result.bytes)} · este app usa ${result.splitCount} APK(s) adicionais (split), não incluídos.`
            : `${formatBytes(result.bytes)} · ${result.path}`,
        action: { label: "Mostrar", onClick: () => revealItemInDir(result.path) },
      });
    } catch (err) {
      setTransfer(pkg, null);
      notifyError(err, `Falha ao extrair ${pkg}`);
    }
  };

  const cancel = (pkg: string) => serial && api.cancelPull(serial, pkg);

  const close = () => {
    for (const [pkg, transfer] of Object.entries(transfers)) {
      if (transfer.status === "running") cancel(pkg);
    }
    onClose();
  };

  return (
    <Modal
      open={device !== null}
      onClose={close}
      icon={<Package className="size-4" />}
      title="Extrair APK"
      subtitle={
        device &&
        `${deviceName(device)} · ${packages ? `${visible.length} de ${packages.length} apps` : "carregando apps…"}`
      }
    >
      <div className="flex items-center gap-3 border-b border-line px-5 py-3">
        <label className="group relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within:text-emerald-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar pelo nome do pacote…"
            spellCheck={false}
            className="h-9 w-full rounded-[10px] bg-black/30 pr-9 pl-9 text-sm text-zinc-100 ring-1 ring-inset ring-white/[0.08] transition-shadow outline-none placeholder:text-zinc-600 focus:ring-emerald-400/50"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Limpar busca"
              className="absolute top-1/2 right-2 flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
            >
              <X className="size-3.5" />
            </button>
          )}
        </label>
        <SegmentedControl
          value={scope}
          onChange={setScope}
          options={[
            { value: "user", label: "Do usuário" },
            { value: "all", label: "Todos" },
          ]}
        />
      </div>

      <div className="min-h-[360px] flex-1 overflow-y-auto px-2 py-2">
        {error ? (
          <ErrorState error={error} onRetry={() => setReload((n) => n + 1)} />
        ) : packages === null ? (
          <ListSkeleton />
        ) : visible.length === 0 ? (
          <EmptyState query={query} />
        ) : (
          <ul className="space-y-px">
            {visible.map((pkg) => (
              <PackageRow
                key={pkg.name}
                pkg={pkg}
                query={deferredQuery}
                transfer={transfers[pkg.name]}
                onDownload={() => download(pkg.name)}
                onCancel={() => cancel(pkg.name)}
              />
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

interface PackageRowProps {
  pkg: AppPackage;
  query: string;
  transfer?: Transfer;
  onDownload: () => void;
  onCancel: () => void;
}

function PackageRow({ pkg, query, transfer, onDownload, onCancel }: PackageRowProps) {
  const segments = pkg.name.split(".");
  const shortName = segments[segments.length - 1];
  const running = transfer?.status === "running";
  const percent = running && transfer.total > 0 ? (transfer.received / transfer.total) * 100 : 0;

  return (
    <li className="group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2 transition-colors [content-visibility:auto] [contain-intrinsic-size:auto_52px] hover:bg-white/[0.035]">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b from-white/[0.08] to-white/[0.02] text-[13px] font-semibold text-zinc-300 uppercase ring-1 ring-inset ring-white/[0.06]">
        {shortName.charAt(0)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-zinc-100 capitalize">{shortName}</p>
          {pkg.system && (
            <span className="rounded-md bg-white/[0.05] px-1.5 py-px text-[10px] font-medium text-zinc-500 ring-1 ring-inset ring-white/[0.06]">
              Sistema
            </span>
          )}
        </div>
        <p className="truncate font-mono text-[11.5px] text-zinc-500">
          <Highlight text={pkg.name} query={query} />
        </p>
      </div>

      {running ? (
        <div className="flex items-center gap-2">
          <span className="w-24 text-right text-[11px] text-zinc-400 tabular-nums">
            {transfer.total > 0
              ? `${formatBytes(transfer.received)} / ${formatBytes(transfer.total)}`
              : "Preparando…"}
          </span>
          <IconButton label="Cancelar" onClick={onCancel}>
            <X className="size-4" />
          </IconButton>
        </div>
      ) : transfer?.status === "done" ? (
        <div className="flex items-center gap-1">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300">
            <Check className="size-3.5" /> Salvo
          </span>
          <IconButton label="Mostrar na pasta" onClick={() => revealItemInDir(transfer.path)}>
            <FolderOpen className="size-4" />
          </IconButton>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          icon={<Download className="size-4" />}
          className="opacity-70 group-hover:opacity-100 group-hover:bg-white/[0.06] group-hover:text-zinc-100"
          onClick={onDownload}
        >
          Baixar APK
        </Button>
      )}

      {running && (
        <div className="absolute inset-x-3 bottom-0 h-0.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className={`h-full rounded-full bg-emerald-400 transition-[width] duration-150 ease-out ${
              transfer.total === 0 ? "w-1/3 animate-pulse" : ""
            }`}
            style={transfer.total > 0 ? { width: `${percent}%` } : undefined}
          />
        </div>
      )}
    </li>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const index = query ? text.toLowerCase().indexOf(query) : -1;
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-emerald-400/20 text-emerald-200">{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-1 px-1 py-1">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2" style={{ opacity: 1 - i * 0.1 }}>
          <div className="skeleton size-8 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-3 rounded" style={{ width: `${30 + ((i * 17) % 35)}%` }} />
            <div className="skeleton h-2.5 rounded" style={{ width: `${45 + ((i * 23) % 30)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex h-full min-h-[320px] animate-fade-in flex-col items-center justify-center text-center">
      <PackageSearch className="size-9 text-zinc-700" strokeWidth={1.5} />
      <p className="mt-3 text-sm font-medium text-zinc-300">Nenhum app encontrado</p>
      <p className="mt-1 text-xs text-zinc-500">
        {query ? `Nada corresponde a “${query}”.` : "Este filtro não retornou aplicativos."}
      </p>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: AdbError; onRetry: () => void }) {
  return (
    <div className="flex h-full min-h-[320px] animate-fade-in flex-col items-center justify-center px-8 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-rose-500/10 ring-1 ring-rose-400/20">
        <AlertCircle className="size-5 text-rose-300" />
      </div>
      <p className="mt-3 text-sm font-medium text-zinc-200">{error.message}</p>
      {error.hint && <p className="mt-1 max-w-sm text-xs text-zinc-500">{error.hint}</p>}
      <Button className="mt-4" size="sm" onClick={onRetry}>
        Tentar novamente
      </Button>
    </div>
  );
}
