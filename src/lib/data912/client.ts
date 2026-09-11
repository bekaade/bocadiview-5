// src/lib/data912/client.ts
import type { Candle } from "@/lib/binance/types";
import type {
  Data912LivePanel,
  Data912LiveItem,
  Data912HistoricalType,
  Data912HistoricalBar,
} from "./types";

/** Trae un panel completo (ej: todos los CEDEARs) desde nuestra propia API route */
export async function fetchLivePanel(
  panel: Data912LivePanel
): Promise<Data912LiveItem[]> {
  const res = await fetch(`/api/data912/live/${panel}`);
  if (!res.ok) throw new Error(`No se pudo obtener el panel ${panel}`);
  return res.json();
}

/** Trae el histórico diario de un ticker y lo devuelve ya en formato de velas */
export async function fetchHistoricalCandles(
  type: Data912HistoricalType,
  ticker: string
): Promise<Candle[]> {
  const res = await fetch(`/api/data912/historical/${type}/${ticker}`);
  if (!res.ok) throw new Error(`No se pudo obtener histórico de ${ticker}`);
  const bars: Data912HistoricalBar[] = await res.json();

  return bars
    .map((bar) => ({
      time: Math.floor(new Date(`${bar.date}T00:00:00Z`).getTime() / 1000),
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
      isFinal: true,
    }))
    .sort((a, b) => a.time - b.time);
}

/** Busca un símbolo puntual dentro de un panel ya cargado (para el watchlist/selector) */
export function findInPanel(
  panel: Data912LiveItem[],
  symbol: string
): Data912LiveItem | undefined {
  return panel.find((item) => item.symbol.toUpperCase() === symbol.toUpperCase());
}
