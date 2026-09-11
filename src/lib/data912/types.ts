// src/lib/data912/types.ts

/** Paneles disponibles en /live/:panel */
export type Data912LivePanel =
  | "mep"
  | "ccl"
  | "arg_stocks"
  | "arg_options"
  | "arg_cedears"
  | "arg_notes"
  | "arg_corp"
  | "arg_bonds"
  | "usa_adrs"
  | "usa_stocks";

/** Item de un panel en vivo (/live/*) */
export interface Data912LiveItem {
  symbol: string;
  px_bid: number;
  q_bid: number;
  px_ask: number;
  q_ask: number;
  c: number; // último precio / close-like
  pct_change: number;
  v: number; // volumen
  q_op?: number; // cantidad de operaciones
}

/** Tipo de instrumento para el histórico (/historical/:type/:ticker) */
export type Data912HistoricalType = "stocks" | "cedears" | "bonds";

/** Barra histórica diaria (/historical/*) */
export interface Data912HistoricalBar {
  date: string; // "YYYY-MM-DD"
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  dr?: number; // daily return
  sa?: number; // métrica adicional
}
