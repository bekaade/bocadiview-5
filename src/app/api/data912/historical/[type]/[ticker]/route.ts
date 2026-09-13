// src/app/api/data912/historical/[type]/[ticker]/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { Data912HistoricalBar, Data912HistoricalType } from "@/lib/data912/types";

const VALID_TYPES: Data912HistoricalType[] = ["stocks", "cedears", "bonds"];

export const revalidate = 300; // histórico diario, no hace falta refrescar seguido

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; ticker: string }> }
) {
  const { type, ticker } = await params;
  const interval = req.nextUrl.searchParams.get("interval") ?? "1d";
  const validIntervals = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];
  if (!validIntervals.includes(interval)) {
    return NextResponse.json({ error: "interval inválido" }, { status: 400 });
  }

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
      if (Array.isArray(data) && data.length > 0 && (interval === "1d" || interval === "1w")) {
        const candles = interval === "1d" ? data : aggregateDailyBars(data, interval);
        return NextResponse.json(candles, {
          headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=120" },
        });
      }
    }
  } catch {
    // Try the secondary source below when data912 is unavailable.
  }

  if (type === "cedears") {
    const fallback = await fetchYahooHistory(normalizedTicker, interval);
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

function aggregateDailyBars(bars: Data912HistoricalBar[], interval: string) {
  if (interval === "1d") return bars;
  const grouped = new Map<string, Data912HistoricalBar>();
  for (const bar of bars) {
    const date = new Date(`${bar.date}T00:00:00Z`);
    const key = interval === "1w"
      ? new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10)
      : bar.date.slice(0, 7);
    const current = grouped.get(key);
    grouped.set(key, current ? { ...current, h: Math.max(current.h, bar.h), l: Math.min(current.l, bar.l), c: bar.c, v: current.v + bar.v } : { ...bar, date: key });
  }
  return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchYahooHistory(ticker: string, interval: string) {
  const period2 = Math.floor(Date.now() / 1000);
  const intraday = interval !== "1d" && interval !== "1w";
  const period1 = intraday ? period2 - 60 * 24 * 60 * 60 : period2 - 5 * 365 * 24 * 60 * 60;
  const yahooInterval = interval === "4h" ? "1h" : interval === "1w" ? "1wk" : interval;
  const symbol = `${encodeURIComponent(ticker)}.BA`;

  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=${yahooInterval}&events=history`,
      { next: { revalidate: 300 }, headers: { Accept: "application/json" } }
    );
    if (!response.ok) return [];

    const payload = await response.json();
    const result = payload?.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const quote = result?.indicators?.quote?.[0];

    const candles = timestamps.flatMap((timestamp: number, index: number) => {
      const open = quote?.open?.[index];
      const high = quote?.high?.[index];
      const low = quote?.low?.[index];
      const close = quote?.close?.[index];
      const volume = quote?.volume?.[index] ?? 0;
      if (![open, high, low, close].every((value) => Number.isFinite(value))) return [];
      return [{ date: new Date(timestamp * 1000).toISOString(), o: open, h: high, l: low, c: close, v: Number.isFinite(volume) ? volume : 0 }];
    });
    if (interval !== "4h") return candles;
    const grouped = new Map<number, (typeof candles)[number]>();
    for (const candle of candles) {
      const bucket = Math.floor(new Date(candle.date).getTime() / 1000 / (4 * 3600)) * 4 * 3600;
      const previous = grouped.get(bucket);
      grouped.set(bucket, previous ? { ...previous, h: Math.max(previous.h, candle.h), l: Math.min(previous.l, candle.l), c: candle.c, v: previous.v + candle.v } : { ...candle, date: new Date(bucket * 1000).toISOString() });
    }
    return [...grouped.values()];
  } catch {
    return [];
  }
}
