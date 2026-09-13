/**
 * Hook de React para enganchar el indicador VWAP Volume Profile a un chart de
 * lightweight-charts ya existente (por ejemplo, el que arma tu PriceChart.tsx).
 *
 * No crea el chart ni la serie de velas — asume que ya los tenés en refs, y
 * solo se encarga de:
 *   1. Crear el primitive una sola vez y adjuntarlo a la serie de velas.
 *   2. Recalcular el perfil cada vez que cambian las barras (`bars`).
 *   3. Sacar el primitive cuando el componente se desmonta.
 */

import { useEffect, useRef } from "react";
import type { ISeriesApi, SeriesType, Time } from "lightweight-charts";
import {
  VwapVolumeProfilePrimitive,
  type VwapVolumeProfileColors,
} from "./vwapVolumeProfilePrimitive";
import type { Bar, VwapVolumeProfileInputs, VwapVolumeProfileResult } from "./vwapVolumeProfile";

export interface UseVwapVolumeProfileOptions {
  /** Serie de velas (o cualquier serie) a la que se le va a "colgar" el indicador */
  series: ISeriesApi<SeriesType, Time> | null;
  /** Barras OHLCV ya cerradas, en orden ascendente por tiempo */
  bars: Bar[];
  /** Parámetros del indicador: period / offset / bins / pocType */
  inputs?: VwapVolumeProfileInputs;
  /** Colores opcionales */
  colors?: Partial<VwapVolumeProfileColors>;
  /** Desactiva el indicador sin desmontar el componente (ej. checkbox "mostrar perfil") */
  enabled?: boolean;
}

export interface UseVwapVolumeProfileReturn {
  /** Último resultado calculado (por si lo querés mostrar en un panel aparte, tooltip, etc.) */
  getResult: () => VwapVolumeProfileResult | null;
}

export function useVwapVolumeProfile({
  series,
  bars,
  inputs,
  colors,
  enabled = true,
}: UseVwapVolumeProfileOptions): UseVwapVolumeProfileReturn {
  const primitiveRef = useRef<VwapVolumeProfilePrimitive | null>(null);

  // Crear / recrear el primitive cuando cambia la serie o se activa/desactiva
  useEffect(() => {
    if (!series || !enabled) return;

    const primitive = new VwapVolumeProfilePrimitive(inputs, colors);
    primitiveRef.current = primitive;
    series.attachPrimitive(primitive);

    return () => {
      series.detachPrimitive(primitive);
      primitiveRef.current = null;
    };
    // Nota: si `inputs`/`colors` son objetos literales nuevos en cada render,
    // convení memorizarlos (useMemo) en el componente que llama a este hook,
    // para no recrear el primitive en cada render sin necesidad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, enabled, inputs, colors]);

  // Recalcular cada vez que cambian las barras
  useEffect(() => {
    if (!primitiveRef.current || bars.length === 0) return;
    primitiveRef.current.setData(bars);
  }, [bars]);

  return {
    getResult: () => primitiveRef.current?.result ?? null,
  };
}
