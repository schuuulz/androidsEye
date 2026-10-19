import { useEffect, useRef, useState } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Eraser, RotateCcw, SquareTerminal } from "lucide-react";
import "@xterm/xterm/css/xterm.css";

import { api, asAdbError } from "../lib/api";
import { deviceName, type Device } from "../lib/types";
import { Drawer } from "./ui/Overlay";
import { IconButton } from "./ui/Button";
import { Spinner } from "./ui/Spinner";

type SessionStatus = "connecting" | "ready" | "closed";

const theme: ITheme = {
  background: "#0b0b0d",
  foreground: "#e4e4e7",
  cursor: "#34d399",
  cursorAccent: "#0b0b0d",
  selectionBackground: "#10b98155",
  black: "#18181b",
  red: "#f87171",
  green: "#34d399",
  yellow: "#fbbf24",
  blue: "#60a5fa",
  magenta: "#c084fc",
  cyan: "#22d3ee",
  white: "#d4d4d8",
  brightBlack: "#52525b",
  brightRed: "#fca5a5",
  brightGreen: "#6ee7b7",
  brightYellow: "#fde68a",
  brightBlue: "#93c5fd",
  brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9",
  brightWhite: "#fafafa",
};

interface AdbTerminalDrawerProps {
  device: Device | null;
  onClose: () => void;
}

export function AdbTerminalDrawer({ device, onClose }: AdbTerminalDrawerProps) {
  const [status, setStatus] = useState<SessionStatus>("connecting");
  const [session, setSession] = useState(0);
  const terminalRef = useRef<Terminal | null>(null);

  return (
    <Drawer
      open={device !== null}
      onClose={onClose}
      icon={<SquareTerminal className="size-4" />}
      title={device ? `Shell — ${deviceName(device)}` : "Shell"}
      subtitle={device?.serial}
      actions={
        <div className="flex items-center gap-1">
          <StatusPill status={status} />
          <IconButton label="Limpar tela" onClick={() => terminalRef.current?.clear()}>
            <Eraser className="size-4" />
          </IconButton>
          <IconButton label="Reiniciar sessão" onClick={() => setSession((n) => n + 1)}>
            <RotateCcw className="size-4" />
          </IconButton>
          <div className="mx-1 h-5 w-px bg-line" />
        </div>
      }
    >
      {device && (
        <AdbTerminal
          key={`${device.serial}:${session}`}
          serial={device.serial}
          onStatus={setStatus}
          terminalRef={terminalRef}
        />
      )}
      <footer className="flex items-center gap-4 border-t border-line px-5 py-2.5 text-[11px] text-zinc-500">
        <Shortcut keys={["Ctrl", "Shift", "C"]} label="copiar" />
        <Shortcut keys={["Ctrl", "Shift", "V"]} label="colar" />
        <Shortcut keys={["Clique direito"]} label="copiar / colar" />
        <span className="flex-1" />
        <Shortcut keys={["Esc"]} label="fechar" />
      </footer>
    </Drawer>
  );
}

interface AdbTerminalProps {
  serial: string;
  onStatus: (status: SessionStatus) => void;
  terminalRef: React.RefObject<Terminal | null>;
}

/**
 * Terminal xterm.js ligado a um `adb shell`. A sessão vive exatamente enquanto
 * o componente está montado: desmontar envia `exit` e encerra o processo.
 */
function AdbTerminal({ serial, onStatus, terminalRef }: AdbTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current!;
    const term = new Terminal({
      theme,
      fontFamily: '"JetBrains Mono", "Cascadia Code", "SF Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      cursorBlink: true,
      cursorStyle: "bar",
      scrollback: 5000,
      allowTransparency: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon((_, uri) => openUrl(uri)));
    term.open(container);
    fit.fit();
    term.focus();
    terminalRef.current = term;

    let sessionId: number | null = null;
    let disposed = false;
    let resizeTimer: number | undefined;

    onStatus("connecting");
    api
      .shellOpen(serial, term.cols, term.rows, (event) => {
        if (event.type === "data") {
          term.write(event.data);
        } else {
          sessionId = null;
          onStatus("closed");
          term.write("\r\n\x1b[2m— sessão encerrada · use ↻ para reconectar —\x1b[0m\r\n");
        }
      })
      .then((id) => {
        if (disposed) return void api.shellClose(id);
        sessionId = id;
        onStatus("ready");
      })
      .catch((error) => {
        const err = asAdbError(error);
        onStatus("closed");
        term.write(`\x1b[31m✖ ${err.message}\x1b[0m\r\n`);
        if (err.hint) term.write(`\x1b[2m  ${err.hint}\x1b[0m\r\n`);
      });

    const send = (data: string) => {
      if (sessionId !== null) api.shellWrite(sessionId, data).catch(() => {});
    };

    const copySelection = () => {
      const selection = term.getSelection();
      if (selection) navigator.clipboard.writeText(selection);
      term.clearSelection();
      return Boolean(selection);
    };
    const paste = async () => term.paste(await navigator.clipboard.readText());

    term.onData(send);
    term.onResize(({ cols, rows }) => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (sessionId !== null) api.shellResize(sessionId, cols, rows).catch(() => {});
      }, 120);
    });

    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown" || !event.ctrlKey) return true;
      const key = event.key.toLowerCase();
      // Ctrl+Shift+C/V como em terminais nativos; Ctrl+C sem seleção continua sendo SIGINT.
      if (key === "c" && (event.shiftKey || term.hasSelection())) {
        copySelection();
        return false;
      }
      if (key === "v") {
        event.preventDefault();
        paste();
        return false;
      }
      return true;
    });

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      if (!copySelection()) paste();
    };
    container.addEventListener("contextmenu", onContextMenu);

    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(container);

    return () => {
      disposed = true;
      observer.disconnect();
      container.removeEventListener("contextmenu", onContextMenu);
      window.clearTimeout(resizeTimer);
      if (sessionId !== null) api.shellClose(sessionId);
      terminalRef.current = null;
      term.dispose();
    };
  }, [serial, onStatus, terminalRef]);

  return (
    <div className="min-h-0 flex-1 bg-[#0b0b0d] p-3 pr-1">
      <div ref={containerRef} className="size-full" />
    </div>
  );
}

function StatusPill({ status }: { status: SessionStatus }) {
  const config = {
    connecting: { label: "Conectando", className: "text-zinc-400" },
    ready: { label: "Conectado", className: "text-emerald-300" },
    closed: { label: "Encerrado", className: "text-zinc-500" },
  }[status];

  return (
    <span className={`mr-1 inline-flex items-center gap-1.5 text-xs font-medium ${config.className}`}>
      {status === "connecting" ? (
        <Spinner className="size-3" />
      ) : (
        <span className={`size-1.5 rounded-full ${status === "ready" ? "bg-emerald-400" : "bg-zinc-600"}`} />
      )}
      {config.label}
    </span>
  );
}

function Shortcut({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex gap-0.5">
        {keys.map((key) => (
          <kbd
            key={key}
            className="rounded border border-line bg-elevated px-1.5 py-px font-sans text-[10px] text-zinc-400"
          >
            {key}
          </kbd>
        ))}
      </span>
      {label}
    </span>
  );
}
