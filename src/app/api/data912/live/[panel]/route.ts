// src/app/api/data912/live/[panel]/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { Data912LivePanel } from "@/lib/data912/types";

const VALID_PANELS: Data912LivePanel[] = [
  "mep",
  "ccl",
  "arg_stocks",
  "arg_options",
  "arg_cedears",
  "arg_notes",
  "arg_corp",
  "arg_bonds",
  "usa_adrs",
  "usa_stocks",
];

export const revalidate = 60; // cache en el edge/servidor por 60s (dato ya viene delayed ~2h)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ panel: string }> }
) {
  const { panel } = await params;

  if (!VALID_PANELS.includes(panel as Data912LivePanel)) {
    return NextResponse.json({ error: "panel inválido" }, { status: 400 });
  }

  try {
    const res = await fetch(`https://data912.com/live/${panel}`, {
      // Next cachea esto en el servidor; el cliente jamás pega directo a data912
      next: { revalidate: 60 },
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `data912 respondió ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=30" },
    });
  } catch {
    return NextResponse.json(
      { error: "no se pudo contactar data912" },
      { status: 502 }
    );
  }
}
