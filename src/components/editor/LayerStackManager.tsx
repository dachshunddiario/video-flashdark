import {
  Layers,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Video,
  Type,
  AlignLeft,
  Sparkles,
  Layout,
  User,
  AtSign,
} from "lucide-react";
import type { LayerId } from "@/lib/types";

interface LayerStackManagerProps {
  layerOrder: LayerId[];
  hiddenLayers: string[];
  selectedLayer?: string;
  onSelectLayer: (id: string) => void;
  onReorderLayers: (newOrder: LayerId[]) => void;
  onToggleLayerVisibility: (id: string) => void;
}

const LAYER_CONFIG: Record<
  LayerId,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  template: { label: "Fundo / Template", icon: Layout },
  video: { label: "Vídeo Recortado (1º Plano)", icon: Video },
  headline: { label: "Headline (Título)", icon: Type },
  subHeadline: { label: "Sub-headline", icon: AlignLeft },
  watermark: { label: "Marca d'água / Rodapé", icon: Sparkles },
  profile: { label: "Foto de Perfil", icon: User },
  pageName: { label: "Nome da Página / Selo", icon: AtSign },
};

export function LayerStackManager({
  layerOrder,
  hiddenLayers,
  selectedLayer,
  onSelectLayer,
  onReorderLayers,
  onToggleLayerVisibility,
}: LayerStackManagerProps) {
  const moveLayer = (idx: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= layerOrder.length) return;

    const newOrder = [...layerOrder];
    const [moved] = newOrder.splice(idx, 1);
    if (moved) {
      newOrder.splice(targetIdx, 0, moved);
      onReorderLayers(newOrder);
    }
  };

  return (
    <div className="rounded-xl border border-border/80 bg-secondary/20 p-3 space-y-2">
      <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
        <div className="flex items-center gap-1.5">
          <Layers className="size-3.5 text-primary" />
          <span className="text-xs font-bold text-foreground">Camadas Visuais</span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {layerOrder.length} camadas
        </span>
      </div>

      <div className="space-y-1">
        {layerOrder.map((layerId, idx) => {
          const cfg = LAYER_CONFIG[layerId] || {
            label: layerId,
            icon: Layout,
          };
          const Icon = cfg.icon;
          const isHidden = hiddenLayers.includes(layerId);
          const isSelected = selectedLayer === layerId;

          return (
            <div
              key={layerId}
              onClick={() => onSelectLayer(layerId)}
              className={`flex items-center justify-between gap-2 rounded-lg border p-1.5 text-xs transition cursor-pointer ${
                isSelected
                  ? "border-primary bg-primary/10 shadow-xs"
                  : "border-border/60 bg-secondary/30 hover:bg-secondary/60"
              } ${isHidden ? "opacity-45" : ""}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-[9px] text-muted-foreground w-3 text-right">
                  {idx + 1}
                </span>
                <Icon className={`size-3.5 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-[11px] font-medium truncate ${isSelected ? "text-primary font-semibold" : "text-foreground"}`}>
                  {cfg.label}
                </span>
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleLayerVisibility(layerId);
                  }}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                  title={isHidden ? "Mostrar camada" : "Ocultar camada"}
                >
                  {isHidden ? <EyeOff className="size-3 text-rose-400" /> : <Eye className="size-3" />}
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    moveLayer(idx, "up");
                  }}
                  disabled={idx === 0}
                  className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-20"
                  title="Mover camada para cima"
                >
                  <ChevronUp className="size-3" />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    moveLayer(idx, "down");
                  }}
                  disabled={idx === layerOrder.length - 1}
                  className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-20"
                  title="Mover camada para baixo"
                >
                  <ChevronDown className="size-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
