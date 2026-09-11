// src/lib/data912/useCedearLive.ts
"use client";

import { useEffect, useState } from "react";
import { fetchLivePanel, findInPanel } from "./client";
import type { Data912LiveItem } from "./types";

/**
 * Polling del precio en vivo de un CEDEAR puntual.
 * data912 no ofrece WebSocket, así que simulamos "vivo" con polling.
 * Por defecto cada 30s -- el dato en origen ya viene delayed ~2h y
 * cacheado 60s en nuestra propia API route, así que pollear más
 * seguido que eso no trae info más fresca, solo gasta requests.
 */
export function useCedearLive(symbol: string, intervalMs = 30_000) {
  const [data, setData] = useState<Data912LiveItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      try {
        const panel = await fetchLivePanel("arg_cedears");
        if (cancelled) return;
        setData(findInPanel(panel, symbol) ?? null);
        setError(null);
      } catch {
        if (!cancelled) setError("error consultando data912");
      } finally {
        if (!cancelled) timer = setTimeout(tick, intervalMs);
      }
    }

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [symbol, intervalMs]);

  return { data, error };
}
