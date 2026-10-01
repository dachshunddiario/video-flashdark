import { Sliders, Volume2, Crop, ZoomIn, Gauge, Sparkles, FlipHorizontal } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { type FilterType, type VideoAdjustment } from "@/lib/types";

interface VideoAdjustmentsPanelProps {
  adjustment: VideoAdjustment;
  onChange: (updated: VideoAdjustment) => void;
}

const SPEED_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const FILTERS: { id: FilterType; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "contrast", label: "Contraste" },
  { id: "brightness", label: "Brilho" },
  { id: "saturation", label: "Saturação" },
  { id: "blackwhite", label: "P&B" },
  { id: "vintage", label: "Vintage" },
  { id: "sharp", label: "Nitidez" },
];

export function VideoAdjustmentsPanel({
  adjustment,
  onChange,
}: VideoAdjustmentsPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-border/60 pb-3">
        <Sliders className="size-4 text-primary" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
          Ajustes de Vídeo & Render
        </h3>
      </div>

      {/* 1. ZOOM */}
      <div className="rounded-lg border border-border bg-secondary/20 p-3.5 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold flex items-center gap-1.5">
            <ZoomIn className="size-3.5 text-muted-foreground" />
            Zoom ({adjustment.zoom.toFixed(2)}x)
          </Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              step="0.05"
              min="0.5"
              max="3.0"
              value={adjustment.zoom}
              onChange={(e) =>
                onChange({
                  ...adjustment,
                  zoom: Math.min(3, Math.max(0.5, Number(e.target.value) || 1)),
                })
              }
              className="h-6 w-16 text-center text-xs font-mono"
            />
            <span className="text-xs text-muted-foreground">x</span>
          </div>
        </div>

        <input
          type="range"
          min="0.5"
          max="3.0"
          step="0.05"
          value={adjustment.zoom}
          onChange={(e) =>
            onChange({ ...adjustment, zoom: Number(e.target.value) })
          }
          className="w-full accent-primary"
        />

        <div className="flex justify-between text-[10px] text-muted-foreground">
          <button type="button" onClick={() => onChange({ ...adjustment, zoom: 0.5 })}>
            0.5x
          </button>
          <button type="button" onClick={() => onChange({ ...adjustment, zoom: 1 })}>
            1.0x (Padrão)
          </button>
          <button type="button" onClick={() => onChange({ ...adjustment, zoom: 2 })}>
            2.0x
          </button>
          <button type="button" onClick={() => onChange({ ...adjustment, zoom: 3 })}>
            3.0x
          </button>
        </div>
      </div>

      {/* 2. VELOCIDADE */}
      <div className="rounded-lg border border-border bg-secondary/20 p-3.5 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold flex items-center gap-1.5">
            <Gauge className="size-3.5 text-muted-foreground" />
            Velocidade ({adjustment.speed.toFixed(2)}x)
          </Label>
          <Input
            type="number"
            step="0.05"
            min="0.25"
            max="3.0"
            value={adjustment.speed}
            onChange={(e) =>
              onChange({
                ...adjustment,
                speed: Math.min(3, Math.max(0.25, Number(e.target.value) || 1)),
              })
            }
            className="h-6 w-16 text-center text-xs font-mono"
          />
        </div>

        {/* Botões de presets rápidos */}
        <div className="grid grid-cols-6 gap-1">
          {SPEED_PRESETS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ ...adjustment, speed: s })}
              className={`rounded py-1 text-xs font-mono transition ${
                adjustment.speed === s
                  ? "bg-primary text-primary-foreground font-bold"
                  : "bg-secondary/40 text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* 3. FILTROS VISUAIS */}
      <div className="rounded-lg border border-border bg-secondary/20 p-3.5 space-y-2.5">
        <Label className="text-xs font-semibold flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-muted-foreground" />
          Filtros Visuais
        </Label>

        <div className="grid grid-cols-4 gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onChange({ ...adjustment, filter: f.id })}
              className={`rounded py-1.5 px-2 text-[11px] font-medium transition ${
                adjustment.filter === f.id
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-secondary/40 text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {adjustment.filter !== "normal" && (
          <div className="pt-2 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Intensidade do Filtro</span>
              <span>{adjustment.filterIntensity}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={adjustment.filterIntensity}
              onChange={(e) =>
                onChange({
                  ...adjustment,
                  filterIntensity: Number(e.target.value),
                })
              }
              className="w-full accent-primary"
            />
          </div>
        )}
      </div>

      {/* 4. RECORTE (CROP) */}
      <div className="rounded-lg border border-border bg-secondary/20 p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold flex items-center gap-1.5">
            <Crop className="size-3.5 text-muted-foreground" />
            Enquadramento (9:16)
          </Label>
        </div>

        <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-border bg-secondary/30 p-1">
          <button
            type="button"
            onClick={() => onChange({ ...adjustment, cropMode: "auto" })}
            className={`py-1 text-xs font-medium rounded ${
              adjustment.cropMode === "auto"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Recorte Automático
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...adjustment, cropMode: "manual" })}
            className={`py-1 text-xs font-medium rounded ${
              adjustment.cropMode === "manual"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Recorte Manual
          </button>
        </div>

        {adjustment.cropMode === "manual" && (
          <div className="grid grid-cols-2 gap-2 text-xs pt-1">
            <div>
              <span className="text-[10px] text-muted-foreground block">
                Pan Horizontal ({adjustment.cropPanX}%)
              </span>
              <input
                type="range"
                min="-50"
                max="50"
                value={adjustment.cropPanX}
                onChange={(e) =>
                  onChange({
                    ...adjustment,
                    cropPanX: Number(e.target.value),
                  })
                }
                className="w-full accent-primary"
              />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block">
                Pan Vertical ({adjustment.cropPanY}%)
              </span>
              <input
                type="range"
                min="-50"
                max="50"
                value={adjustment.cropPanY}
                onChange={(e) =>
                  onChange({
                    ...adjustment,
                    cropPanY: Number(e.target.value),
                  })
                }
                className="w-full accent-primary"
              />
            </div>
          </div>
        )}
      </div>

      {/* 5. ÁUDIO E ESPELHAMENTO */}
      <div className="rounded-lg border border-border bg-secondary/20 p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Volume2 className="size-3.5 text-muted-foreground" />
            <Label className="text-xs font-medium">Manter áudio original</Label>
          </div>
          <Switch
            checked={adjustment.keepAudio}
            onCheckedChange={(val) =>
              onChange({ ...adjustment, keepAudio: val })
            }
          />
        </div>

        <div className="flex items-center justify-between border-t border-border/40 pt-2.5">
          <div className="flex items-center gap-2">
            <FlipHorizontal className="size-3.5 text-muted-foreground" />
            <Label className="text-xs font-medium">Espelhar vídeo horizontalmente</Label>
          </div>
          <Switch
            checked={adjustment.mirror}
            onCheckedChange={(val) =>
              onChange({ ...adjustment, mirror: val })
            }
          />
        </div>
      </div>
    </div>
  );
}
