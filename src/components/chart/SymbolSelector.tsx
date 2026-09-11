"use client";

import { useEffect, useState, useMemo } from "react";
import { Search, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchExchangeSymbols } from "@/lib/binance/rest";
import { fetchLivePanel } from "@/lib/data912/client";
import { useChartStore, type AssetClass } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";
import type { SymbolInfo } from "@/lib/binance/types";

/** Forma unificada para poder listar crypto y CEDEARs en la misma tabla */
interface UnifiedSymbol {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  assetClass: AssetClass;
}

export function SymbolSelector() {
  const symbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const addToWatchlist = useChartStore((s) => s.addToWatchlist);
  const open = useChartStore((s) => s.symbolDialogOpen);
  const setOpen = useChartStore((s) => s.setSymbolDialogOpen);

  const [query, setQuery] = useState("");
  const [cryptoSymbols, setCryptoSymbols] = useState<SymbolInfo[]>([]);
  const [cedearSymbols, setCedearSymbols] = useState<UnifiedSymbol[]>([]);

  useEffect(() => {
    if (!open) return;

    if (cryptoSymbols.length === 0) {
      fetchExchangeSymbols().then(setCryptoSymbols).catch(console.error);
    }

    if (cedearSymbols.length === 0) {
      fetchLivePanel("arg_cedears")
        .then((items) =>
          setCedearSymbols(
            items.map((it) => ({
              symbol: it.symbol,
              baseAsset: it.symbol,
              quoteAsset: "ARS",
              assetClass: "cedear" as const,
            })),
          ),
        )
        .catch(console.error);
    }
  }, [open, cryptoSymbols.length, cedearSymbols.length]);

  const allSymbols: UnifiedSymbol[] = useMemo(
    () => [
      ...cryptoSymbols.map((s) => ({
        symbol: s.symbol,
        baseAsset: s.baseAsset,
        quoteAsset: s.quoteAsset,
        assetClass: "crypto" as const,
      })),
      ...cedearSymbols,
    ],
    [cryptoSymbols, cedearSymbols],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return allSymbols.slice(0, 100);
    return allSymbols
      .filter(
        (s) =>
          s.symbol.includes(q) ||
          s.baseAsset.includes(q) ||
          s.quoteAsset.includes(q),
      )
      .slice(0, 100);
  }, [query, allSymbols]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="group flex items-center gap-2 rounded px-3 py-1.5 text-sm font-semibold hover:bg-tv-panel-hover">
        <Search className="h-3.5 w-3.5 text-tv-text-muted group-hover:text-tv-text" />
        <span className="tabular-nums">{symbol}</span>
        <ChevronDown className="h-3.5 w-3.5 text-tv-text-muted" />
      </DialogTrigger>
      <DialogContent className="max-w-md gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="text-sm font-medium">Buscar símbolo</DialogTitle>
        </DialogHeader>
        <div className="border-b border-tv-border p-3">
          <Input
            autoFocus
            placeholder="BTC, ETH, GGAL…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-tv-bg"
          />
        </div>
        <ScrollArea className="h-[400px]">
          <div className="flex flex-col">
            {filtered.length === 0 && (
              <div className="p-4 text-center text-xs text-tv-text-muted">
                Sin resultados
              </div>
            )}
            {filtered.map((s) => (
              <button
                key={`${s.assetClass}-${s.symbol}`}
                onClick={() => {
                  setSymbol(s.symbol, s.assetClass);
                  addToWatchlist(s.symbol, s.assetClass);
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(
                  "flex items-center justify-between border-b border-tv-border px-4 py-2 text-left text-xs hover:bg-tv-panel-hover",
                  s.symbol === symbol && "bg-tv-panel-hover",
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-tv-text">{s.baseAsset}</span>
                  <span className="text-tv-text-muted">/ {s.quoteAsset}</span>
                </div>
                <span className="flex items-center gap-2 text-tv-text-muted">
                  {s.assetClass === "cedear" && (
                    <span className="rounded bg-tv-panel-hover px-1 text-[10px] uppercase">
                      CEDEAR
                    </span>
                  )}
                  {s.symbol}
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
