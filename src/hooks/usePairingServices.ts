import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { MdnsService } from "../lib/types";

const POLL_INTERVAL = 1000;

/**
 * Celulares anunciando a tela de pareamento na rede (mDNS), atualizados a cada
 * segundo enquanto `active` for verdadeiro. Desmontou ou desativou: o polling para.
 */
export function usePairingServices(active: boolean) {
  const [services, setServices] = useState<MdnsService[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const next = await api.listPairingServices();
        if (stopped) return;
        setServices(next);
        setFailed(false);
      } catch {
        if (!stopped) setFailed(true);
      }
      if (!stopped) timer = window.setTimeout(poll, POLL_INTERVAL);
    };
    poll();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [active]);

  return { services, failed };
}
