/**
 * VWAP Volume Profile [BigBeluga]
 *
 * A framework-independent TypeScript conversion of the Pine Script indicator.
 *
 * The calculation returns:
 * - VWAP values and colors
 * - Candle colors
 * - Volume-profile boxes
 * - Positive and negative POC boxes
 * - Background box
 * - No-volume labels
 *
 * A charting library can consume the returned drawing primitives.
 */

export type POCType = "+VWAP" | "-VWAP" | "+/-VWAP";

export interface OHLCVBar {
  time?: number | Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface VWAPVolumeProfileOptions {
  period?: number;
  offset?: number;
  bins?: number;
  pocType?: POCType;

  upColor?: string;
  downColor?: string;
  backgroundColor?: string;

  /**
   * Equivalent to TradingView's chart.bg_color.
   * It is used as the border color of profile boxes.
   */
  chartBackgroundColor?: string;

  /**
   * Pine's ta.vwap() uses an exchange/session anchor.
   * This callback allows callers to define that session.
   *
   * When omitted, UTC calendar days are used if bar timestamps exist.
   */
  sessionKey?: (bar: OHLCVBar, index: number) => string;
}

export interface RGBAColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface IndicatorBox {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  backgroundColor: string;
  borderColor: string | null;
  text?: string;
  textColor?: string;
  textSize?: "normal";
  textAlign?: "left";
  forceOverlay: boolean;
}

export interface IndicatorLabel {
  id: string;
  x: number;
  y: number;
  text: string;
  size: "huge";
}

export interface CandleColor {
  index: number;
  open: number;
  high: number;
  low: number;
  close: number;
  color: string | null;
  wickColor: string | null;
  borderColor: string | null;
}

export interface ProfileDrawing {
  high: number;
  low: number;
  step: number;
  positiveVolumes: number[];
  rawVolumes: number[];
  boxes: IndicatorBox[];
  positivePOC: IndicatorBox | null;
  negativePOC: IndicatorBox | null;
  backgroundBox: IndicatorBox;
}

export interface VWAPVolumeProfileResult {
  metadata: {
    title: string;
    overlay: true;
    maxBarsBack: number;
    maxBoxesCount: number;
  };

  vwap: Array<number | null>;
  vwapColors: Array<string | null>;

  candles: CandleColor[];
  barColors: Array<string | null>;

  profile: ProfileDrawing | null;
  labels: IndicatorLabel[];
}

interface NormalizedOptions {
  period: number;
  offset: number;
  bins: number;
  pocType: POCType;
  upColor: string;
  downColor: string;
  backgroundColor: string;
  chartBackgroundColor: string;
  sessionKey: (bar: OHLCVBar, index: number) => string;
}

interface Grid {
  high: number;
  low: number;
  step: number;
}

/* -------------------------------------------------------------------------- */
/* Color utilities                                                            */
/* -------------------------------------------------------------------------- */

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseColor(color: string): RGBAColor {
  const value = color.trim();

  if (value.startsWith("#")) {
    const hex = value.slice(1);

    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    }

    if (hex.length === 4) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: parseInt(hex[3] + hex[3], 16) / 255,
      };
    }

    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }

    if (hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: parseInt(hex.slice(6, 8), 16) / 255,
      };
    }
  }

  const rgbaMatch = value.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
  );

  if (rgbaMatch) {
    return {
      r: clamp(Number(rgbaMatch[1]), 0, 255),
      g: clamp(Number(rgbaMatch[2]), 0, 255),
      b: clamp(Number(rgbaMatch[3]), 0, 255),
      a:
        rgbaMatch[4] === undefined
          ? 1
          : clamp(Number(rgbaMatch[4]), 0, 1),
    };
  }

  throw new Error(`Unsupported color format: ${color}`);
}

function colorToCss(color: RGBAColor): string {
  const r = Math.round(clamp(color.r, 0, 255));
  const g = Math.round(clamp(color.g, 0, 255));
  const b = Math.round(clamp(color.b, 0, 255));
  const a = clamp(color.a, 0, 1);

  if (a >= 0.999) {
    return `rgb(${r}, ${g}, ${b})`;
  }

  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(4))})`;
}

/**
 * Equivalent to Pine Script's color.new().
 *
 * Pine transparency:
 * - 0 means fully opaque
 * - 100 means fully transparent
 */
function pineColorNew(color: string, transparency: number): string {
  const parsed = parseColor(color);

  return colorToCss({
    ...parsed,
    a: 1 - clamp(transparency, 0, 100) / 100,
  });
}

/**
 * Equivalent to Pine Script's color.from_gradient().
 */
function colorFromGradient(
  value: number,
  bottomValue: number,
  topValue: number,
  bottomColor: string,
  topColor: string,
): string {
  const lower = parseColor(bottomColor);
  const upper = parseColor(topColor);

  const range = topValue - bottomValue;
  const ratio =
    range === 0 ? 0 : clamp((value - bottomValue) / range, 0, 1);

  return colorToCss({
    r: lower.r + (upper.r - lower.r) * ratio,
    g: lower.g + (upper.g - lower.g) * ratio,
    b: lower.b + (upper.b - lower.b) * ratio,
    a: lower.a + (upper.a - lower.a) * ratio,
  });
}

/* -------------------------------------------------------------------------- */
/* Numeric utilities                                                          */
/* -------------------------------------------------------------------------- */

function isFiniteNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function pineInt(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.trunc(value);
}

function highest(values: number[]): number {
  const validValues = values.filter(Number.isFinite);
  return validValues.length > 0 ? Math.max(...validValues) : NaN;
}

function lowest(values: number[]): number {
  const validValues = values.filter(Number.isFinite);
  return validValues.length > 0 ? Math.min(...validValues) : NaN;
}

function formatVolume(value: number): string {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);

  if (absolute >= 1_000_000_000) {
    return `${sign}${trimDecimal((absolute / 1_000_000_000).toFixed(2))}B`;
  }

  if (absolute >= 1_000_000) {
    return `${sign}${trimDecimal((absolute / 1_000_000).toFixed(2))}M`;
  }

  if (absolute >= 1_000) {
    return `${sign}${trimDecimal((absolute / 1_000).toFixed(2))}K`;
  }

  return `${sign}${trimDecimal(absolute.toFixed(2))}`;
}

function trimDecimal(value: string): string {
  return value.replace(/\.?0+$/, "");
}

function defaultSessionKey(bar: OHLCVBar): string {
  if (bar.time === undefined) {
    return "default-session";
  }

  const timestamp =
    bar.time instanceof Date ? bar.time.getTime() : bar.time;

  if (!Number.isFinite(timestamp)) {
    return "default-session";
  }

  return new Date(timestamp).toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* Indicator                                                                  */
/* -------------------------------------------------------------------------- */

export class VWAPVolumeProfile {
  private readonly options: NormalizedOptions;
  private boxCounter = 0;
  private labelCounter = 0;

  public constructor(options: VWAPVolumeProfileOptions = {}) {
    this.options = {
      period: clamp(Math.trunc(options.period ?? 250), 1, 500),
      offset: Math.trunc(options.offset ?? 10),
      bins: clamp(Math.trunc(options.bins ?? 50), 1, 500),
      pocType: options.pocType ?? "+/-VWAP",
      upColor: options.upColor ?? "#42bda8",
      downColor: options.downColor ?? "#ffb950",

      // color.rgb(5, 38, 82, 80)
      backgroundColor:
        options.backgroundColor ?? "rgba(5, 38, 82, 0.2)",

      // Equivalent to chart.bg_color in a light chart.
      chartBackgroundColor:
        options.chartBackgroundColor ?? "#ffffff",

      sessionKey:
        options.sessionKey ??
        ((bar: OHLCVBar): string => defaultSessionKey(bar)),
    };
  }

  /**
   * Equivalent to:
   *
   * series float vwap = ta.vwap(close)
   */
  public calculate(bars: OHLCVBar[]): VWAPVolumeProfileResult {
    this.boxCounter = 0;
    this.labelCounter = 0;

    const vwap = this.calculateVWAP(bars);
    const vwapColors = this.calculateVWAPColors(vwap);
    const lastIndex = bars.length - 1;

    const visibleColors: Array<string | null> = bars.map(
      (_bar, index) => {
        const isVisible =
          lastIndex - index < this.options.period;

        return isVisible ? vwapColors[index] : null;
      },
    );

    const candles: CandleColor[] = bars.map((bar, index) => {
      const color = visibleColors[index];

      return {
        index,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        color,
        wickColor: color,
        borderColor: color,
      };
    });

    const labels: IndicatorLabel[] = [];

    if (bars.length > 0 && this.totalVolume(bars) < 1) {
      const lastBar = bars[lastIndex];

      labels.push({
        id: this.nextLabelId(),
        x: lastIndex,
        y: (lastBar.high + lastBar.low) / 2,
        text: "No Volume Data Provided",
        size: "huge",
      });
    }

    const profile =
      bars.length > 0
        ? this.vwapProfile(bars, vwap, lastIndex)
        : null;

    return {
      metadata: {
        title: "VWAP Volume Profile [BigBeluga]",
        overlay: true,
        maxBarsBack: 500,
        maxBoxesCount: 500,
      },

      vwap,
      vwapColors,

      candles,
      // Pine's barcolor() call uses display = display.none.
      // The values are returned for consumers that want to enable it.
      barColors: visibleColors,

      profile,
      labels,
    };
  }

  /**
   * Calculates ta.vwap(close).
   *
   * TradingView's default VWAP anchor is session-based. This implementation
   * resets cumulative price-volume values whenever sessionKey changes.
   */
  private calculateVWAP(
    bars: OHLCVBar[],
  ): Array<number | null> {
    const result: Array<number | null> = [];

    let cumulativeVolume = 0;
    let cumulativePriceVolume = 0;
    let previousSession: string | null = null;

    for (let index = 0; index < bars.length; index += 1) {
      const bar = bars[index];
      const session = this.options.sessionKey(bar, index);

      if (previousSession !== null && session !== previousSession) {
        cumulativeVolume = 0;
        cumulativePriceVolume = 0;
      }

      previousSession = session;

      const volume = Number.isFinite(bar.volume) ? bar.volume : 0;
      const source = bar.close;

      cumulativeVolume += volume;
      cumulativePriceVolume += source * volume;

      result.push(
        cumulativeVolume !== 0
          ? cumulativePriceVolume / cumulativeVolume
          : null,
      );
    }

    return result;
  }

  /**
   * Equivalent to:
   *
   * color vwap_col = vwap > vwap[5] ? up_col : dn_col
   */
  private calculateVWAPColors(
    vwap: Array<number | null>,
  ): Array<string | null> {
    return vwap.map((value, index) => {
      const historicalValue = index >= 5 ? vwap[index - 5] : null;

      if (!isFiniteNumber(value)) {
        return null;
      }

      if (isFiniteNumber(historicalValue) && value > historicalValue) {
        return this.options.upColor;
      }

      return this.options.downColor;
    });
  }

  /**
   * Equivalent to:
   *
   * get_vol(vwap)=>
   *     ...
   *
   * The returned array contains the historical volume_ series, so volume_[j]
   * behaves like the Pine Script historical reference.
   */
  public getVol(
    bars: OHLCVBar[],
    vwap: Array<number | null>,
  ): number[] {
    const signedVolume = new Array<number>(bars.length).fill(0);

    for (let index = 0; index < bars.length; index += 1) {
      const start = Math.max(0, index - 999);
      const volumeWindow = bars
        .slice(start, index + 1)
        .map((bar) => bar.volume)
        .filter(Number.isFinite);

      const volumeHighest = highest(volumeWindow);
      const volume = Number.isFinite(bars[index].volume)
        ? bars[index].volume
        : 0;

      const source = vwap[index];
      const sourceTwoBarsAgo =
        index >= 2 ? vwap[index - 2] : null;

      if (
        !isFiniteNumber(source) ||
        !isFiniteNumber(sourceTwoBarsAgo) ||
        !Number.isFinite(volumeHighest) ||
        volumeHighest === 0
      ) {
        signedVolume[index] = 0;
        continue;
      }

      const direction = source > sourceTwoBarsAgo ? 1 : -1;

      signedVolume[index] = (direction * volume * 20) / volumeHighest;
    }

    return signedVolume;
  }

  /**
   * Equivalent to:
   *
   * get_grid(period, bins)=>
   *     H = ta.highest(period)
   *     L = ta.lowest(period)
   *     step = (H-L) / bins
   */
  public getGrid(
    bars: OHLCVBar[],
    lastIndex: number,
  ): Grid {
    const startIndex = Math.max(
      0,
      lastIndex - this.options.period + 1,
    );

    const highs = bars
      .slice(startIndex, lastIndex + 1)
      .map((bar) => bar.high);

    const lows = bars
      .slice(startIndex, lastIndex + 1)
      .map((bar) => bar.low);

    const high = highest(highs);
    const low = lowest(lows);
    const step = (high - low) / this.options.bins;

    return {
      high,
      low,
      step,
    };
  }

  /**
   * Equivalent to:
   *
   * vwap_profile(src, period, bins)=>
   */
  public vwapProfile(
    bars: OHLCVBar[],
    src: Array<number | null>,
    lastIndex: number,
  ): ProfileDrawing | null {
    if (bars.length === 0 || lastIndex < 0) {
      return null;
    }

    const { high, low, step } = this.getGrid(bars, lastIndex);
    const signedVolume = this.getVol(bars, src);

    const positiveVolumes = new Array<number>(
      this.options.bins,
    ).fill(0);

    const rawVolumes = new Array<number>(
      this.options.bins,
    ).fill(0);

    const profileBoxes: IndicatorBox[] = [];

    const profileStart = Math.max(
      0,
      lastIndex - this.options.period + 1,
    );

    /**
     * Pine uses:
     *
     * int n = bar_index + offset
     */
    const n = lastIndex + this.options.offset;

    for (let binIndex = 0; binIndex < this.options.bins; binIndex += 1) {
      const binLow = low + step * binIndex;
      const binHigh = binLow + step;

      for (
        let barsAgo = 0;
        barsAgo < this.options.period;
        barsAgo += 1
      ) {
        const sourceIndex = lastIndex - barsAgo;

        if (sourceIndex < 0) {
          break;
        }

        const source = src[sourceIndex];

        if (!isFiniteNumber(source)) {
          continue;
        }

        const value = pineInt(signedVolume[sourceIndex]);

        if (
          source >= binLow - step &&
          source <= binHigh + step
        ) {
          positiveVolumes[binIndex] += value;

          const rawVolume = Number.isFinite(
            bars[sourceIndex].volume,
          )
            ? bars[sourceIndex].volume
            : 0;

          rawVolumes[binIndex] += rawVolume;
        }
      }

      const currentValue = positiveVolumes[binIndex];

      const maximum = Math.max(...positiveVolumes);
      const minimum = Math.min(...positiveVolumes);

      let backgroundColor: string;

      if (currentValue > 0) {
        backgroundColor = colorFromGradient(
          currentValue,
          0,
          maximum,
          pineColorNew(this.options.upColor, 90),
          this.options.upColor,
        );
      } else {
        backgroundColor = colorFromGradient(
          currentValue,
          minimum,
          0,
          this.options.downColor,
          pineColorNew(this.options.downColor, 90),
        );
      }

      /**
       * Equivalent to:
       *
       * box.new(
       *     n,
       *     high_,
       *     n + volume_1.get(i),
       *     low_,
       *     border_color = chart.bg_color,
       *     bgcolor = bg_col,
       *     force_overlay = true
       * )
       */
      profileBoxes.push({
        id: this.nextBoxId("profile"),
        left: n,
        right: n + currentValue,
        top: binHigh,
        bottom: binLow,
        backgroundColor,
        borderColor: this.options.chartBackgroundColor,
        forceOverlay: true,
      });
    }

    const positiveMaximum = Math.max(...positiveVolumes);
    const negativeMinimum = Math.min(...positiveVolumes);

    let positivePOC: IndicatorBox | null = null;
    let negativePOC: IndicatorBox | null = null;

    for (
      let binIndex = 0;
      binIndex < this.options.bins;
      binIndex += 1
    ) {
      const binLow = low + step * binIndex;
      const binHigh = binLow + step;
      const volumeValue = positiveVolumes[binIndex];

      const boxColor = profileBoxes[binIndex].backgroundColor;

      /**
       * Equivalent to:
       *
       * if volume_1.get(i) == volume_1.max()
       *     and (poc_type == 1 or poc_type == 3)
       */
      if (
        volumeValue === positiveMaximum &&
        (this.options.pocType === "+VWAP" ||
          this.options.pocType === "+/-VWAP")
      ) {
        positivePOC = {
          id: this.nextBoxId("positive-poc"),
          left: lastIndex - this.options.period,
          right: n,
          top: binHigh,
          bottom: binLow,
          backgroundColor: pineColorNew(boxColor, 90),
          borderColor: pineColorNew(boxColor, 50),
          text: `+VWAP: ${formatVolume(rawVolumes[binIndex])}`,
          textColor: boxColor,
          textSize: "normal",
          textAlign: "left",
          forceOverlay: true,
        };
      }

      /**
       * Equivalent to:
       *
       * if volume_1.get(i) == volume_1.min()
       *     and (poc_type == 2 or poc_type == 3)
       */
      if (
        volumeValue === negativeMinimum &&
        (this.options.pocType === "-VWAP" ||
          this.options.pocType === "+/-VWAP")
      ) {
        negativePOC = {
          id: this.nextBoxId("negative-poc"),
          left: lastIndex - this.options.period,
          right: n,
          top: binHigh,
          bottom: binLow,
          backgroundColor: pineColorNew(boxColor, 90),
          borderColor: pineColorNew(boxColor, 50),
          text: `-VWAP: ${formatVolume(rawVolumes[binIndex])}`,
          textColor: boxColor,
          textSize: "normal",
          textAlign: "left",
          forceOverlay: true,
        };
      }
    }

    /**
     * Equivalent to:
     *
     * box.new(
     *     bar_index - period,
     *     H,
     *     n,
     *     L,
     *     border_color = na,
     *     bgcolor = bgcol,
     *     force_overlay = false
     * )
     */
    const backgroundBox: IndicatorBox = {
      id: this.nextBoxId("background"),
      left: lastIndex - this.options.period,
      right: n,
      top: high,
      bottom: low,
      backgroundColor: this.options.backgroundColor,
      borderColor: null,
      forceOverlay: false,
    };

    return {
      high,
      low,
      step,
      positiveVolumes,
      rawVolumes,
      boxes: profileBoxes,
      positivePOC,
      negativePOC,
      backgroundBox,
    };
  }

  private totalVolume(bars: OHLCVBar[]): number {
    return bars.reduce((total, bar) => {
      return total + (Number.isFinite(bar.volume) ? bar.volume : 0);
    }, 0);
  }

  private nextBoxId(prefix: string): string {
    this.boxCounter += 1;
    return `${prefix}-${this.boxCounter}`;
  }

  private nextLabelId(): string {
    this.labelCounter += 1;
    return `label-${this.labelCounter}`;
  }
}

/* -------------------------------------------------------------------------- */
/* Convenience function                                                       */
/* -------------------------------------------------------------------------- */

export function calculateVWAPVolumeProfile(
  bars: OHLCVBar[],
  options: VWAPVolumeProfileOptions = {},
): VWAPVolumeProfileResult {
  return new VWAPVolumeProfile(options).calculate(bars);
}

/* -------------------------------------------------------------------------- */
/* Example                                                                     */
/* -------------------------------------------------------------------------- */

/*
const result = calculateVWAPVolumeProfile(
  [
    {
      time: Date.now(),
      open: 100,
      high: 105,
      low: 98,
      close: 103,
      volume: 2500,
    },
    {
      time: Date.now() + 60_000,
      open: 103,
      high: 108,
      low: 101,
      close: 106,
      volume: 3100,
    },
  ],
  {
    period: 250,
    offset: 10,
    bins: 50,
    pocType: "+/-VWAP",
    upColor: "#42bda8",
    downColor: "#ffb950",
    backgroundColor: "rgba(5, 38, 82, 0.2)",
  },
);

console.log(result.vwap);
console.log(result.profile?.boxes);
console.log(result.profile?.positivePOC);
console.log(result.profile?.negativePOC);
*/
