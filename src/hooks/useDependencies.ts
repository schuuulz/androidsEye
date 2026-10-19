import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { DependencyReport } from "../lib/types";

export function useDependencies() {
  const [report, setReport] = useState<DependencyReport | null>(null);
  const [checking, setChecking] = useState(true);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      // Um mínimo de duração evita que o spinner "pisque" em verificações instantâneas.
      const [result] = await Promise.all([
        api.checkDependencies(),
        new Promise((resolve) => setTimeout(resolve, 450)),
      ]);
      setReport(result);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  return { report, checking, recheck: check };
}
