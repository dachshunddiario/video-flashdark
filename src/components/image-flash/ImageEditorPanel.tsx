import React, { useRef } from "react";
import {
  type ImageFlashAdjustment,
  type ImageQueueItem,
  type InstagramImageFormat,
  INSTAGRAM_IMAGE_FORMATS,
  type FilterType,
  type ImageCropConfig,
  type ImageLayerOrder,
  DEFAULT_IMAGE_CROP,
} from "@/lib/types";
import {
  Image as ImageIcon,
  Upload,
  Trash2,
  Sliders,
  ZoomIn,
  Sparkles,
  Download,
  CheckCircle2,
  Loader2,
  Layers,
  Crop,
  Maximize2,
  Scissors,
  MoveVertical,
  MoveHorizontal,
  RotateCcw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

interface ImageEditorPanelProps {
  queue: ImageQueueItem[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onAddImages: (files: File[]) => void;
  onRemoveItem: (id: string) => void;
  onClearQueue: () => void;
  adjustment: ImageFlashAdjustment;
  onUpdateAdjustment: (adj: ImageFlashAdjustment) => void;
  onUpdateItemCrop?: (crop: ImageCropConfig, applyToAll: boolean) => void;
  onOpenCropModal?: () => void;
  onExportAll: () => void;
  onExportCurrent: () => void;
  isProcessing: boolean;
  progressCurrent: number;
  progressTotal: number;
  progressMessage: string;
  className?: string;
}

const RADIUS_PRESETS = [0, 8, 14, 20, 28];

const FILTERS: { id: FilterType; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "contrast", label: "Contraste" },
  { id: "brightness", label: "Brilho" },
  { id: "saturation", label: "Saturação" },
  { id: "blackwhite", label: "P&B" },
  { id: "vintage", label: "Vintage" },
  { id: "sharp", label: "Nitidez" },
];

export function ImageEditorPanel({
  queue,
  selectedIndex,
  onSelectIndex,
  onAddImages,
  onRemoveItem,
  onClearQueue,
  adjustment,
  onUpdateAdjustment,
  onUpdateItemCrop,
  onOpenCropModal,
  onExportAll,
  onExportCurrent,
  isProcessing,
  progressCurrent,
  progressTotal,
  progressMessage,
  className = "",
}: ImageEditorPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onAddImages(files);
      e.target.value = "";
    }
  };

  const currentItem = queue[selectedIndex] ?? null;

  return (
    <div className={`flex flex-col h-full space-y-4 ${className}`}>
      {/* 1. SELETOR DE FORMATO DO INSTAGRAM */}
      <div className="rounded-xl border border-border/80 bg-secondary/25 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
            <Crop className="size-3.5 text-primary" /> Formato Instagram
          </Label>
          <span className="text-[10px] text-muted-foreground">Otimizado para feed</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {INSTAGRAM_IMAGE_FORMATS.map((f) => {
            const isSelected = adjustment.format === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onUpdateAdjustment({ ...adjustment, format: f.id })}
                className={`relative flex flex-col p-2.5 rounded-xl border text-left transition ${
                  isSelected
                    ? "border-primary bg-primary/10 ring-1 ring-primary/40 shadow-xs"
                    : "border-border/60 bg-secondary/30 hover:bg-secondary/60 hover:border-border"
                }`}
              >
                {f.recommendedTag && (
                  <span className="absolute -top-1.5 right-1.5 rounded-full bg-emerald-500/90 text-white text-[8px] font-bold px-1.5 py-0.2 shadow-xs">
                    {f.recommendedTag}
                  </span>
                )}
                <span className="text-xs font-semibold text-foreground truncate">
                  {f.label}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground mt-0.5">
                  {f.subLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. FILA DE IMAGENS EM MASSA (Sem Limite) */}
      <div className="rounded-xl border border-border/80 bg-secondary/25 p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
            <ImageIcon className="size-3.5 text-primary" /> Fila de Imagens ({queue.length})
          </Label>
          <div className="flex items-center gap-1.5">
            {queue.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onClearQueue}
                className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive"
              >
                Limpar
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="h-7 text-xs px-2.5"
            >
              <Upload className="size-3 mr-1" /> Adicionar Fotos
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={handleFilesChosen}
            />
          </div>
        </div>

        {/* Lista Horizontal de Miniaturas */}
        {queue.length === 0 ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border/70 rounded-xl p-5 text-center cursor-pointer hover:border-primary/60 hover:bg-secondary/40 transition"
          >
            <Upload className="size-6 text-muted-foreground mx-auto mb-1.5" />
            <p className="text-xs font-medium text-foreground">
              Arraste ou clique para adicionar imagens em massa
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              JPG, PNG, WebP — Sem limite de quantidade
            </p>
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-slim">
            {queue.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => onSelectIndex(idx)}
                  className={`group relative size-16 shrink-0 rounded-lg overflow-hidden border cursor-pointer transition ${
                    isSelected
                      ? "border-primary ring-2 ring-primary/40 shadow-md"
                      : "border-border/60 hover:border-border opacity-70 hover:opacity-100"
                  }`}
                >
                  <img
                    src={item.previewUrl}
                    alt={item.name}
                    className="size-full object-cover"
                  />
                  <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-center font-mono text-white py-0.5 truncate px-0.5">
                    #{idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveItem(item.id);
                    }}
                    className="absolute top-0.5 right-0.5 size-4 rounded-full bg-black/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-destructive"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. CONTROLES DE ENQUADRAMENTO DA IMAGEM ATUAL */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-3.5">
        {/* SEÇÃO DE RECORTE MANUAL & SELEÇÃO DE ÁREA */}
        <div className="rounded-xl border border-border/80 bg-secondary/25 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
              <Scissors className="size-3.5 text-primary" /> Recorte Manual da Imagem
            </Label>
            <div className="flex items-center gap-1.5">
              <Switch
                checked={(currentItem?.crop ?? adjustment.crop ?? DEFAULT_IMAGE_CROP).enabled}
                onCheckedChange={(checked) => {
                  const current = currentItem?.crop ?? adjustment.crop ?? DEFAULT_IMAGE_CROP;
                  const updated = { ...current, enabled: checked };
                  if (onUpdateItemCrop) onUpdateItemCrop(updated, false);
                  else onUpdateAdjustment({ ...adjustment, crop: updated });
                }}
                id="panel-crop-switch"
              />
              <span className="text-[10px] text-muted-foreground font-mono">
                {(currentItem?.crop ?? adjustment.crop ?? DEFAULT_IMAGE_CROP).enabled ? "Ativo" : "Off"}
              </span>
            </div>
          </div>

          {/* Botão em destaque para abrir o Modal Visual */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenCropModal}
            disabled={!currentItem}
            className="w-full h-8 text-xs font-semibold border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary flex items-center justify-center gap-1.5"
          >
            <Crop className="size-3.5" /> Abrir Recortador Visual Interativo
          </Button>

          {/* Sliders rápidos de recorte no próprio painel */}
          {(currentItem?.crop ?? adjustment.crop ?? DEFAULT_IMAGE_CROP).enabled && (
            <div className="space-y-2.5 pt-1 border-t border-border/60">
              {/* Presets Rápidos */}
              <div className="grid grid-cols-4 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const updated = { top: 32, bottom: 0, left: 0, right: 0, enabled: true };
                    if (onUpdateItemCrop) onUpdateItemCrop(updated, false);
                    else onUpdateAdjustment({ ...adjustment, crop: updated });
                  }}
                  className="rounded py-1 text-[10px] font-medium bg-secondary/50 hover:bg-secondary text-foreground text-center"
                  title="Corta 32% do topo (remove tweet/pergunta)"
                >
                  Tirar Tweet
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const updated = { top: 0, bottom: 18, left: 0, right: 0, enabled: true };
                    if (onUpdateItemCrop) onUpdateItemCrop(updated, false);
                    else onUpdateAdjustment({ ...adjustment, crop: updated });
                  }}
                  className="rounded py-1 text-[10px] font-medium bg-secondary/50 hover:bg-secondary text-foreground text-center"
                  title="Corta 18% da base (remove marca/botões)"
                >
                  Tirar Base
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const updated = { top: 28, bottom: 16, left: 0, right: 0, enabled: true };
                    if (onUpdateItemCrop) onUpdateItemCrop(updated, false);
                    else onUpdateAdjustment({ ...adjustment, crop: updated });
                  }}
                  className="rounded py-1 text-[10px] font-medium bg-secondary/50 hover:bg-secondary text-foreground text-center"
                  title="Corta topo e base"
                >
                  Foto Central
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const updated = { top: 0, bottom: 0, left: 0, right: 0, enabled: false };
                    if (onUpdateItemCrop) onUpdateItemCrop(updated, false);
                    else onUpdateAdjustment({ ...adjustment, crop: updated });
                  }}
                  className="rounded py-1 text-[10px] font-medium bg-secondary/50 hover:bg-destructive/20 hover:text-destructive text-muted-foreground text-center"
                >
                  Resetar
                </button>
              </div>

              {/* Slider Cortar Topo */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <MoveVertical className="size-3 text-primary" /> Cortar Topo (remover texto)
                  </span>
                  <span className="font-mono font-semibold text-primary">
                    {(currentItem?.crop ?? adjustment.crop ?? DEFAULT_IMAGE_CROP).top}%
                  </span>
                </div>
                <Slider
                  min={0}
                  max={80}
                  step={1}
                  value={[(currentItem?.crop ?? adjustment.crop ?? DEFAULT_IMAGE_CROP).top]}
                  onValueChange={([val]) => {
                    const current = currentItem?.crop ?? adjustment.crop ?? DEFAULT_IMAGE_CROP;
                    const updated = { ...current, enabled: true, top: val ?? 0 };
                    if (onUpdateItemCrop) onUpdateItemCrop(updated, false);
                    else onUpdateAdjustment({ ...adjustment, crop: updated });
                  }}
                />
              </div>

              {/* Slider Cortar Base */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <MoveVertical className="size-3 text-primary" /> Cortar Base / Rodapé
                  </span>
                  <span className="font-mono font-semibold text-primary">
                    {(currentItem?.crop ?? adjustment.crop ?? DEFAULT_IMAGE_CROP).bottom}%
                  </span>
                </div>
                <Slider
                  min={0}
                  max={80}
                  step={1}
                  value={[(currentItem?.crop ?? adjustment.crop ?? DEFAULT_IMAGE_CROP).bottom]}
                  onValueChange={([val]) => {
                    const current = currentItem?.crop ?? adjustment.crop ?? DEFAULT_IMAGE_CROP;
                    const updated = { ...current, enabled: true, bottom: val ?? 0 };
                    if (onUpdateItemCrop) onUpdateItemCrop(updated, false);
                    else onUpdateAdjustment({ ...adjustment, crop: updated });
                  }}
                />
              </div>

              {queue.length > 1 && onUpdateItemCrop && (
                <button
                  type="button"
                  onClick={() => {
                    const current = currentItem?.crop ?? adjustment.crop ?? DEFAULT_IMAGE_CROP;
                    onUpdateItemCrop(current, true);
                  }}
                  className="w-full text-center py-1 text-[10px] font-medium text-muted-foreground hover:text-primary transition flex items-center justify-center gap-1 border-t border-border/40 pt-1.5"
                >
                  <Layers className="size-3" /> Aplicar este recorte a todas da fila ({queue.length})
                </button>
              )}
            </div>
          )}

          {/* Opção de Sobrepor a Imagem ao Template */}
          <div className="pt-2 border-t border-border/60">
            <span className="text-[10px] text-muted-foreground block mb-1">
              Camada de Sobreposição do Template
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onUpdateAdjustment({ ...adjustment, layerOrder: "behind" })}
                className={`py-1 px-2.5 rounded-lg text-[11px] font-medium transition ${
                  (adjustment.layerOrder ?? "behind") === "behind"
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "bg-secondary/40 text-muted-foreground hover:bg-secondary/70"
                }`}
              >
                Normal (Fundo)
              </button>
              <button
                type="button"
                onClick={() => onUpdateAdjustment({ ...adjustment, layerOrder: "overlay" })}
                className={`py-1 px-2.5 rounded-lg text-[11px] font-medium transition ${
                  adjustment.layerOrder === "overlay"
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "bg-secondary/40 text-muted-foreground hover:bg-secondary/70"
                }`}
              >
                Sobrepor ao Post (Frente)
              </button>
            </div>
            <p className="text-[9px] text-muted-foreground mt-1">
              {adjustment.layerOrder === "overlay"
                ? "A imagem recortada fica na frente do template como elemento de destaque."
                : "Os textos e títulos do template ficam sobrepostos à imagem."}
            </p>
          </div>
        </div>

        {/* Enquadramento & Posição */}
        <div className="rounded-xl border border-border/80 bg-secondary/20 p-3 space-y-3">
          <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
            <Sliders className="size-3.5 text-primary" /> Posicionamento & Enquadramento
          </Label>

          {/* Fit: Cover vs Contain */}
          <div>
            <span className="text-[10px] text-muted-foreground block mb-1">
              Modo de Preenchimento
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onUpdateAdjustment({ ...adjustment, imageFit: "cover" })}
                className={`py-1.5 px-3 rounded-lg text-xs font-medium transition ${
                  adjustment.imageFit === "cover"
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "bg-secondary/40 text-muted-foreground hover:bg-secondary/70"
                }`}
              >
                Preencher (Cover)
              </button>
              <button
                type="button"
                onClick={() => onUpdateAdjustment({ ...adjustment, imageFit: "contain" })}
                className={`py-1.5 px-3 rounded-lg text-xs font-medium transition ${
                  adjustment.imageFit === "contain"
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "bg-secondary/40 text-muted-foreground hover:bg-secondary/70"
                }`}
              >
                Inteira (Contain)
              </button>
            </div>
          </div>

          {/* Cantos Arredondados */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                Cantos da Imagem
              </span>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={48}
                  step={1}
                  value={adjustment.borderRadius ?? 14}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    onUpdateAdjustment({
                      ...adjustment,
                      borderRadius: isNaN(val) ? 0 : Math.max(0, Math.min(48, val)),
                    });
                  }}
                  className="h-6 w-14 px-1.5 text-right font-mono text-[11px] bg-background/60"
                />
                <span className="text-[10px] text-muted-foreground font-mono">px</span>
              </div>
            </div>

            <Slider
              min={0}
              max={48}
              step={1}
              value={[adjustment.borderRadius ?? 14]}
              onValueChange={([val]) =>
                onUpdateAdjustment({ ...adjustment, borderRadius: val ?? 14 })
              }
            />

            <div className="grid grid-cols-5 gap-1 pt-0.5">
              {RADIUS_PRESETS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onUpdateAdjustment({ ...adjustment, borderRadius: r })}
                  className={`rounded py-1 text-[10px] font-mono transition ${
                    (adjustment.borderRadius ?? 14) === r
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "bg-secondary/40 text-muted-foreground hover:bg-secondary/70"
                  }`}
                >
                  {r === 0 ? "0" : `${r}px`}
                </button>
              ))}
            </div>
          </div>

          {/* Largura da Imagem */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                Largura Útil ({adjustment.imageWidth}%)
              </span>
            </div>
            <Slider
              min={50}
              max={100}
              step={1}
              value={[adjustment.imageWidth ?? 94]}
              onValueChange={([val]) =>
                onUpdateAdjustment({ ...adjustment, imageWidth: val ?? 94 })
              }
            />
          </div>

          {/* Posição Horizontal X */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                Posição Horizontal X ({adjustment.imageX ?? 50}%)
              </span>
            </div>
            <Slider
              min={20}
              max={80}
              step={1}
              value={[adjustment.imageX ?? 50]}
              onValueChange={([val]) =>
                onUpdateAdjustment({ ...adjustment, imageX: val ?? 50 })
              }
            />
          </div>

          {/* Posição Vertical Y */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                Posição Vertical Y ({adjustment.imageY}%)
              </span>
            </div>
            <Slider
              min={20}
              max={85}
              step={1}
              value={[adjustment.imageY ?? 56]}
              onValueChange={([val]) =>
                onUpdateAdjustment({ ...adjustment, imageY: val ?? 56 })
              }
            />
          </div>

          {/* Zoom Interno */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                Zoom Interno ({adjustment.zoom.toFixed(2)}x)
              </span>
            </div>
            <Slider
              min={0.8}
              max={2.5}
              step={0.05}
              value={[adjustment.zoom ?? 1]}
              onValueChange={([val]) =>
                onUpdateAdjustment({ ...adjustment, zoom: val ?? 1 })
              }
            />
          </div>
        </div>

        {/* Filtros de Imagem */}
        <div className="rounded-xl border border-border/80 bg-secondary/20 p-3 space-y-2">
          <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
            <Sparkles className="size-3.5 text-primary" /> Filtro da Imagem
          </Label>
          <div className="grid grid-cols-4 gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onUpdateAdjustment({ ...adjustment, filter: f.id })}
                className={`rounded py-1 text-[11px] font-medium transition ${
                  adjustment.filter === f.id
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "bg-secondary/40 text-muted-foreground hover:bg-secondary/70"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 4. BOTÕES DE EXPORTAÇÃO EM MASSA */}
      <div className="pt-2 border-t border-border/60 space-y-2">
        {isProcessing && (
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-primary flex items-center gap-1.5">
                <Loader2 className="size-3.5 animate-spin" /> {progressMessage}
              </span>
              <span className="font-mono text-muted-foreground">
                {progressCurrent} / {progressTotal}
              </span>
            </div>
            <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{
                  width: `${progressTotal > 0 ? (progressCurrent / progressTotal) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onExportCurrent}
            disabled={!currentItem || isProcessing}
            className="h-9 text-xs"
          >
            <Download className="size-3.5 mr-1.5" /> Baixar Atual (PNG)
          </Button>

          <Button
            type="button"
            onClick={onExportAll}
            disabled={queue.length === 0 || isProcessing}
            className="h-9 text-xs font-semibold shadow-md bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {isProcessing ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="size-3.5 animate-spin" /> Renderizando...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Download className="size-3.5" /> Baixar Todas em ZIP ({queue.length})
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
