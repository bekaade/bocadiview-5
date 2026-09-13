import type { Candle } from "@/lib/binance/types";

export interface IndicatorPoint {
  time: number;
  value: number;
}

export interface MACDPoint {
  time: number;
  macd: number;
  signal: number;
  histogram: number;
}

export interface VwapProfileBin {
  low: number;
  high: number;
  signedVolume: number;
  totalVolume: number;
}

/** VWAP Volume Profile [BigBeluga], matching Pine's session VWAP and signed profile volume. */
export function vwapVolumeProfile(
  candles: Candle[],
  period = 250,
  bins = 50,
): { vwap: IndicatorPoint[]; profile: VwapProfileBin[]; high: number; low: number } {
  const source = candles.slice(-Math.min(period, candles.length));
  if (!source.length || bins < 1) return { vwap: [], profile: [], high: 0, low: 0 };

  const vwap: IndicatorPoint[] = [];
  const signedVolumes: number[] = [];
  let session = "";
  let volumeSum = 0;
  let priceVolumeSum = 0;
  for (let index = 0; index < source.length; index += 1) {
    const candle = source[index];
    const day = new Date(candle.time * 1000).toISOString().slice(0, 10);
    if (day !== session) {
      session = day;
      volumeSum = 0;
      priceVolumeSum = 0;
    }
    const price = candle.close;
    const volume = Number.isFinite(candle.volume) ? candle.volume : 0;
    volumeSum += volume;
    priceVolumeSum += price * volume;
    const value = volumeSum > 0 ? priceVolumeSum / volumeSum : price;
    vwap.push({ time: candle.time, value });
    const previous = vwap[index - 2]?.value;
    signedVolumes.push(previous !== undefined && value > previous ? volume : -volume);
  }

  const high = Math.max(...source.map((candle) => candle.high));
  const low = Math.min(...source.map((candle) => candle.low));
  const step = (high - low || 1) / bins;
  const profile = Array.from({ length: bins }, (_, index) => ({
    low: low + index * step,
    high: low + (index + 1) * step,
    signedVolume: 0,
    totalVolume: 0,
  }));
  for (let index = 0; index < source.length; index += 1) {
    const value = vwap[index].value;
    const binIndex = Math.max(0, Math.min(bins - 1, Math.floor(((value - low) / (high - low || 1)) * bins)));
    profile[binIndex].signedVolume += signedVolumes[index];
    profile[binIndex].totalVolume += source[index].volume;
  }
  return { vwap, profile, high, low };
}

/**
 * Simple Moving Average
 */
export function sma(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) out.push({ time: candles[i].time, value: sum / period });
  }
  return out;
}

/**
 * Exponential Moving Average — seeded with SMA of first `period` candles.
 */
export function ema(candles: Candle[], period: number): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += candles[i].close;
  prev /= period;
  out.push({ time: candles[period - 1].time, value: prev });
  for (let i = period; i < candles.length; i++) {
    prev = candles[i].close * k + prev * (1 - k);
    out.push({ time: candles[i].time, value: prev });
  }
  return out;
}

/**
 * RSI (Wilder) — period typically 14.
 */
export function rsi(candles: Candle[], period = 14): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  if (candles.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  gain /= period;
  loss /= period;
  let rs = loss === 0 ? 100 : gain / loss;
  out.push({ time: candles[period].time, value: 100 - 100 / (1 + rs) });
  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    rs = loss === 0 ? 100 : gain / loss;
    out.push({ time: candles[i].time, value: 100 - 100 / (1 + rs) });
  }
  return out;
}

/**
 * MACD — fast EMA, slow EMA, signal EMA of the MACD line.
 * Defaults: 12 / 26 / 9.
 */
export function macd(
  candles: Candle[],
  fast = 12,
  slow = 26,
  signal = 9,
): MACDPoint[] {
  if (candles.length < slow + signal) return [];
  const emaFast = ema(candles, fast);
  const emaSlow = ema(candles, slow);
  // align: emaSlow starts later
  const slowStartTime = emaSlow[0].time;
  const fastByTime = new Map(emaFast.map((p) => [p.time, p.value]));
  const macdLine: IndicatorPoint[] = [];
  for (const p of emaSlow) {
    const f = fastByTime.get(p.time);
    if (f !== undefined) macdLine.push({ time: p.time, value: f - p.value });
  }
  // signal = EMA of MACD line. Build synthetic candles for ema()
  const synth: Candle[] = macdLine.map((p) => ({
    time: p.time,
    open: p.value,
    high: p.value,
    low: p.value,
    close: p.value,
    volume: 0,
  }));
  const sig = ema(synth, signal);
  const sigByTime = new Map(sig.map((p) => [p.time, p.value]));
  const out: MACDPoint[] = [];
  for (const p of macdLine) {
    const s = sigByTime.get(p.time);
    if (s === undefined) continue;
    out.push({ time: p.time, macd: p.value, signal: s, histogram: p.value - s });
  }
  void slowStartTime;
  return out;
}
