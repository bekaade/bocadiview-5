// src/app/api/data912/historical/[type]/[ticker]/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { Data912HistoricalType } from "@/lib/data912/types";

const VALID_TYPES: Data912HistoricalType[] = ["stocks", "cedears", "bonds"];

export const revalidate = 300; // histórico diario, no hace falta refrescar seguido

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string; ticker: string }> }
) {
  const { type, ticker } = await params;

  if (!VALID_TYPES.includes(type as Data912HistoricalType)) {
    return NextResponse.json({ error: "type inválido" }, { status: 400 });
  }
  if (!ticker || !/^[A-Za-z0-9.]+$/.test(ticker)) {
    return NextResponse.json({ error: "ticker inválido" }, { status: 400 });
  }

  const normalizedTicker = ticker.toUpperCase();

  try {
    const res = await fetch(
      `https://data912.com/historical/${type}/${normalizedTicker}`,
      { next: { revalidate: 300 }, headers: { Accept: "application/json" } }
    );

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return NextResponse.json(data, {
          headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=120" },
        });
      }
    }
  } catch {
    // Try the secondary source below when data912 is unavailable.
  }

  if (type === "cedears") {
    const fallback = await fetchYahooHistory(normalizedTicker);
    if (fallback.length > 0) {
      return NextResponse.json(fallback, {
        headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=120" },
      });
    }
  }

  return NextResponse.json(
    { error: `no hay histórico disponible para ${normalizedTicker}` },
    { status: 502 }
  );
}

async function fetchYahooHistory(ticker: string) {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - 5 * 365 * 24 * 60 * 60;
  const symbol = `${encodeURIComponent(ticker)}.BA`;

  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d&events=history`,
      { next: { revalidate: 300 }, headers: { Accept: "application/json" } }
    );
    if (!response.ok) return [];

    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const quote = result?.indicators?.quote?.[0];

    return timestamps.flatMap((timestamp: number, index: number) => {
      const open = quote?.open?.[index];
      const high = quote?.high?.[index];
      const low = quote?.low?.[index];
      const close = quote?.close?.[index];
      const volume = quote?.volume?.[index] ?? 0;
      if (![open, high, low, close].every((value) => Number.isFinite(value))) return [];
      return [{
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        o: open,
        h: high,
        l: low,
        c: close,
        v: Number.isFinite(volume) ? volume : 0,
      }];
    });
  } catch {
    return [];
  }
}
