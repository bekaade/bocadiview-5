/**
 * VwapVolumeProfilePrimitive
 * ---------------------------------------------------------------------------
 * "Series Primitive" para lightweight-charts v5 que dibuja, sobre el mismo
 * canvas de la serie de velas:
 *   - el histograma horizontal de volumen (equivalente a las `box.new` del
 *     script de Pine),
 *   - las cajas de POC (+VWAP / -VWAP),
 *   - la línea de VWAP coloreada por tramo (sube/baja).
 *
 * Requiere lightweight-charts >= 4.1 (API de primitives). Probado contra
 * v5.2.
 *
 * Uso típico:
 *
 *   const primitive = new VwapVolumeProfilePrimitive({ period: 250, offset: 10, bins: 50 });
 *   candleSeries.attachPrimitive(primitive);
 *   primitive.setData(bars); // cada vez que cambien las velas
 */

import type {
  IChartApiBase,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import {
  computeVwapVolumeProfile,
  type Bar,
  type VwapVolumeProfileInputs,
  type VwapVolumeProfileResult,
} from "./vwapVolumeProfile";

// ────────────────────────────────────────────────────────────────────────
// Colores
// ────────────────────────────────────────────────────────────────────────

export interface VwapVolumeProfileColors {
  up: string;
  down: string;
  background: string;
  pocBorder: string;
  pocText: string;
}

const DEFAULT_COLORS: VwapVolumeProfileColors = {
  up: "#42bda8",
  down: "#ffb950",
  background: "rgba(5, 38, 82, 0.31)",
  pocBorder: "rgba(255, 255, 255, 0.45)",
  pocText: "#e8ecf3",
};

function withAlpha(hex: string, ratio: number): string {
  const clamped = Math.max(0.1, Math.min(1, Math.abs(ratio)));
  if (hex.startsWith("rgba") || hex.startsWith("rgb(")) return hex;
  const clean = hex.replace("#", "");
  const bigint = parseInt(
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean,
    16
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${clamped})`;
}

// ────────────────────────────────────────────────────────────────────────
// Estructuras internas del renderer (ya en coordenadas de pantalla)
// ────────────────────────────────────────────────────────────────────────

interface RendererRect {
  x1: number | null;
  x2: number | null;
  y1: number | null;
  y2: number | null;
  isUp: boolean;
  gradientRatio: number;
}

interface RendererPoc extends RendererRect {
  label: string;
}

interface RendererVwapPoint {
  x: number | null;
  y: number | null;
  color: "up" | "down" | null;
}

interface RendererData {
  bins: RendererRect[];
  pocs: RendererPoc[];
  vwapLine: RendererVwapPoint[];
  anchorX: number | null;
  gridLeftX: number | null;
  gridTopY: number | null;
  gridBottomY: number | null;
  colors: VwapVolumeProfileColors;
}

// ────────────────────────────────────────────────────────────────────────
// Renderer: dibuja en el canvas usando las coordenadas ya calculadas
// ────────────────────────────────────────────────────────────────────────

class VwapVolumeProfileRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly _getData: () => RendererData | null) {}

  draw(target: CanvasRenderingTarget2D): void {
    const data = this._getData();
    if (!data) return;

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const hr = scope.horizontalPixelRatio;
      const vr = scope.verticalPixelRatio;
      const { colors } = data;

      // Fondo del grid completo (equivalente al box de bgcol en Pine)
      if (
        data.gridLeftX != null &&
        data.anchorX != null &&
        data.gridTopY != null &&
        data.gridBottomY != null
      ) {
        ctx.fillStyle = colors.background;
        const x = Math.min(data.gridLeftX, data.anchorX) * hr;
        const w = Math.abs(data.anchorX - data.gridLeftX) * hr;
        const y = Math.min(data.gridTopY, data.gridBottomY) * vr;
        const h = Math.abs(data.gridBottomY - data.gridTopY) * vr;
        ctx.fillRect(x, y, w, h);
      }

      // Histograma de volumen
      for (const bin of data.bins) {
        if (bin.x1 == null || bin.x2 == null || bin.y1 == null || bin.y2 == null) continue;
        ctx.fillStyle = withAlpha(bin.isUp ? colors.up : colors.down, bin.gradientRatio);
        const x = Math.min(bin.x1, bin.x2) * hr;
        const w = Math.max(Math.abs(bin.x2 - bin.x1) * hr, 1);
        const y = Math.min(bin.y1, bin.y2) * vr;
        const h = Math.max(Math.abs(bin.y2 - bin.y1) * vr, 1);
        ctx.fillRect(x, y, w, h);
      }

      // Cajas de POC (+VWAP / -VWAP)
      for (const poc of data.pocs) {
        if (poc.x1 == null || poc.x2 == null || poc.y1 == null || poc.y2 == null) continue;
        const x = Math.min(poc.x1, poc.x2) * hr;
        const w = Math.abs(poc.x2 - poc.x1) * hr;
        const y = Math.min(poc.y1, poc.y2) * vr;
        const h = Math.abs(poc.y2 - poc.y1) * vr;

        ctx.fillStyle = withAlpha(poc.isUp ? colors.up : colors.down, 0.14);
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = colors.pocBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);

        ctx.fillStyle = colors.pocText;
        ctx.font = `${Math.round(11 * vr)}px sans-serif`;
        ctx.textBaseline = "middle";
        ctx.fillText(poc.label, x + 4 * hr, y + h / 2);
      }

      // Línea de VWAP, coloreada por tramo (up/down)
      const points = data.vwapLine;
      if (points.length > 1) {
        ctx.lineWidth = 2 * hr;
        for (let i = 1; i < points.length; i++) {
          const p0 = points[i - 1];
          const p1 = points[i];
          if (p0.x == null || p0.y == null || p1.x == null || p1.y == null) continue;
          ctx.strokeStyle = p1.color === "down" ? colors.down : colors.up;
          ctx.beginPath();
          ctx.moveTo(p0.x * hr, p0.y * vr);
          ctx.lineTo(p1.x * hr, p1.y * vr);
          ctx.stroke();
        }
      }
    });
  }
}

// ────────────────────────────────────────────────────────────────────────
// PaneView: traduce el resultado del indicador (precio/índice) a coordenadas
// de pantalla, recalculando en cada updateAllViews() (zoom, scroll, nueva vela)
// ────────────────────────────────────────────────────────────────────────

class VwapVolumeProfilePaneView implements IPrimitivePaneView {
  private _data: RendererData | null = null;

  constructor(private readonly _source: VwapVolumeProfilePrimitive) {}

  update(): void {
    const chart = this._source.chart;
    const series = this._source.series;
    const result = this._source.result;
    const bars = this._source.bars;

    if (!chart || !series || !result || bars.length === 0) {
      this._data = null;
      return;
    }

    const timeScale = chart.timeScale();
    const toX = (logical: number) => timeScale.logicalToCoordinate(logical as never);
    const toY = (price: number) => series.priceToCoordinate(price);

    const anchorX = toX(result.anchorIndex);
    const period = this._source.options.period ?? 250;
    const gridLeftIndex = Math.max(0, bars.length - 1 - period);
    const gridLeftX = toX(gridLeftIndex);
    const gridTopY = toY(result.range.high);
    const gridBottomY = toY(result.range.low);

    const bins: RendererRect[] = result.bins.map((bin) => ({
      x1: anchorX,
      x2: toX(result.anchorIndex + bin.volumeSigned),
      y1: toY(bin.priceHigh),
      y2: toY(bin.priceLow),
      isUp: bin.isUp,
      gradientRatio: bin.gradientRatio,
    }));

    const pocs: RendererPoc[] = [];
    if (result.positivePoc) {
      pocs.push({
        x1: gridLeftX,
        x2: anchorX,
        y1: toY(result.positivePoc.priceHigh),
        y2: toY(result.positivePoc.priceLow),
        isUp: true,
        gradientRatio: 1,
        label: result.positivePoc.label,
      });
    }
    if (result.negativePoc) {
      pocs.push({
        x1: gridLeftX,
        x2: anchorX,
        y1: toY(result.negativePoc.priceHigh),
        y2: toY(result.negativePoc.priceLow),
        isUp: false,
        gradientRatio: 1,
        label: result.negativePoc.label,
      });
    }

    const startIdx = Math.max(0, bars.length - period);
    const vwapLine: RendererVwapPoint[] = [];
    for (let i = startIdx; i < bars.length; i++) {
      const v = result.vwapSeries[i];
      vwapLine.push({
        x: toX(i),
        y: v == null ? null : toY(v),
        color: result.vwapColor[i],
      });
    }

    this._data = {
      bins,
      pocs,
      vwapLine,
      anchorX,
      gridLeftX,
      gridTopY,
      gridBottomY,
      colors: this._source.colors,
    };
  }

  renderer(): IPrimitivePaneRenderer | null {
    return new VwapVolumeProfileRenderer(() => this._data);
  }
}

// ────────────────────────────────────────────────────────────────────────
// Primitive principal — esto es lo que se le pasa a series.attachPrimitive()
// ────────────────────────────────────────────────────────────────────────

export class VwapVolumeProfilePrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApiBase<Time> | null = null;
  private _series: ISeriesApi<SeriesType, Time> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private readonly _paneView: VwapVolumeProfilePaneView;
  private _bars: Bar[] = [];
  private _result: VwapVolumeProfileResult | null = null;
  private readonly _colors: VwapVolumeProfileColors;
  private readonly _options: VwapVolumeProfileInputs;

  constructor(options: VwapVolumeProfileInputs = {}, colors: Partial<VwapVolumeProfileColors> = {}) {
    this._options = options;
    this._colors = { ...DEFAULT_COLORS, ...colors };
    this._paneView = new VwapVolumeProfilePaneView(this);
  }

  get chart(): IChartApiBase<Time> | null {
    return this._chart;
  }

  get series(): ISeriesApi<SeriesType, Time> | null {
    return this._series;
  }

  get bars(): Bar[] {
    return this._bars;
  }

  get options(): VwapVolumeProfileInputs {
    return this._options;
  }

  get colors(): VwapVolumeProfileColors {
    return this._colors;
  }

  get result(): VwapVolumeProfileResult | null {
    return this._result;
  }

  /** Lifecycle hook de lightweight-charts, se llama al hacer attachPrimitive() */
  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  /** Llamar cada vez que cambien las velas: carga inicial, nueva vela, WS update, etc. */
  setData(bars: Bar[]): void {
    this._bars = bars;
    this._result = bars.length > 0 ? computeVwapVolumeProfile(bars, this._options) : null;
    this.updateAllViews();
    this._requestUpdate?.();
  }

  updateAllViews(): void {
    this._paneView.update();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._paneView];
  }
}
