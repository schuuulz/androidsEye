import { useState, type FormEvent } from "react";
import { Link2 } from "lucide-react";
import { api, asAdbError } from "../../lib/api";
import type { AdbError } from "../../lib/types";
import { Button } from "../ui/Button";
import { ErrorNotice, PhoneSteps, Strong } from "./shared";

/** `adb connect ip:porta` para aparelhos que já foram pareados antes. */
export function ManualConnect({ onConnected }: { onConnected: () => void }) {
  const [address, setAddress] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<AdbError | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const target = address.includes(":") ? address.trim() : `${address.trim()}:5555`;
    setConnecting(true);
    setError(null);
    try {
      await api.connectWifi(target);
      onConnected();
    } catch (err) {
      setError(asAdbError(err));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="grid grid-cols-[240px_1fr] gap-7 p-6">
      <div>
        <h3 className="text-[15px] font-semibold text-zinc-50">Já pareado antes?</h3>
        <p className="mt-1 mb-5 text-[13px] text-zinc-500">Conecte direto pelo endereço.</p>
        <PhoneSteps
          steps={[
            <>
              Em <Strong>Depuração por Wi-Fi</Strong>, veja o <Strong>Endereço IP e porta</Strong>
            </>,
            <>
              Ou, com o cabo, rode <code className="text-zinc-300">adb tcpip 5555</code>
            </>,
          ]}
        />
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase" htmlFor="manual-address">
          Endereço
        </label>
        <div className="flex gap-2">
          <input
            id="manual-address"
            autoFocus
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="192.168.0.10:5555"
            spellCheck={false}
            className="h-10 min-w-0 flex-1 rounded-xl bg-black/30 px-3.5 font-mono text-sm text-zinc-100 ring-1 ring-inset ring-white/[0.08] outline-none placeholder:text-zinc-600 focus:ring-emerald-400/50"
          />
          <Button
            type="submit"
            variant="primary"
            className="h-10"
            loading={connecting}
            disabled={!address.trim()}
            icon={<Link2 className="size-4" />}
          >
            Conectar
          </Button>
        </div>
        <p className="text-xs text-zinc-500">Sem porta, usamos a 5555.</p>
        {error && <ErrorNotice error={error} />}
      </form>
    </div>
  );
}
