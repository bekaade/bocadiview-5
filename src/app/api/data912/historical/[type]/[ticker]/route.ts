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

  try {
    const res = await fetch(
      `https://data912.com/historical/${type}/${ticker.toUpperCase()}`,
      { next: { revalidate: 300 }, headers: { Accept: "application/json" } }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `data912 respondió ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=120" },
    });
  } catch {
    return NextResponse.json(
      { error: "no se pudo contactar data912" },
      { status: 502 }
    );
  }
}
