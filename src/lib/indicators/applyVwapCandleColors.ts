/**
 * Replica `plotcandle(...)` + `barcolor(vwap_col)` del script original: recolorea
 * las velas según si el VWAP está por encima o por debajo de su valor 5 barras
 * atrás, pero solo dentro de la ventana `period` (fuera de esa ventana Pine
 * usaba `na`, o sea el color por defecto de la serie).
 *
 * Se usa para armar el array que le pasás a `candleSeries.setData(...)`.
 */

import type { CandlestickData, Time, UTCTimestamp } from "lightweight-charts";
import { computeVwapVolumeProfile, type Bar, type VwapVolumeProfileInputs } from "./vwapVolumeProfile";

export interface VwapCandleColorPalette {
  up: string;
  down: string;
}

const DEFAULT_PALETTE: VwapCandleColorPalette = {
  up: "#42bda8",
  down: "#ffb950",
};

export function applyVwapCandleColors(
  bars: Bar[],
  inputs: VwapVolumeProfileInputs = {},
  palette: Partial<VwapCandleColorPalette> = {}
): CandlestickData<Time>[] {
  const colors = { ...DEFAULT_PALETTE, ...palette };
  const { vwapColor } = computeVwapVolumeProfile(bars, inputs);
  const period = inputs.period ?? 250;
  const lastIndex = bars.length - 1;

  return bars.map((bar, i) => {
    const withinWindow = lastIndex - i < period;
    const c = withinWindow ? vwapColor[i] : null;
    const color = c === "up" ? colors.up : c === "down" ? colors.down : undefined;

    const candle: CandlestickData<Time> = {
      time: bar.time as UTCTimestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    };
    if (color) {
      candle.color = color;
      candle.wickColor = color;
      candle.borderColor = color;
    }
    return candle;
  });
}
