import React, { useState, useEffect } from "react";
import {
  type ImageCropConfig,
  type ImageQueueItem,
  DEFAULT_IMAGE_CROP,
} from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Crop,
  Check,
  RotateCcw,
  Scissors,
  Layers,
  Sparkles,
  Eye,
  Sliders,
  MoveVertical,
  MoveHorizontal,
} from "lucide-react";

interface ImageCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageItem: ImageQueueItem | null;
  initialCrop?: ImageCropConfig | undefined;
  onApplyCrop: (crop: ImageCropConfig, applyToAll: boolean) => void;
  queueLength: number;
}

export function ImageCropModal({
  isOpen,
  onClose,
  imageItem,
  initialCrop,
  onApplyCrop,
  queueLength,
}: ImageCropModalProps) {
  const [crop, setCrop] = useState<ImageCropConfig>(
    initialCrop || DEFAULT_IMAGE_CROP,
  );
  const [naturalDimensions, setNaturalDimensions] = useState<{
    width: number;
    height: number;
  }>({ width: 1080, height: 1080 });

  // Sincroniza sempre que abrir
  useEffect(() => {
    if (isOpen) {
      setCrop(initialCrop || DEFAULT_IMAGE_CROP);
    }
  }, [isOpen, initialCrop, imageItem?.id]);

  // Carrega dimensões naturais da imagem para mostrar medidas reais
  useEffect(() => {
    if (imageItem?.previewUrl) {
      const img = new Image();
      img.onload = () => {
        setNaturalDimensions({
          width: img.naturalWidth || 1080,
          height: img.naturalHeight || 1080,
        });
      };
      img.src = imageItem.previewUrl;
    }
  }, [imageItem?.previewUrl]);

  if (!imageItem) return null;

  const isCropEffective =
    crop.enabled &&
    (crop.top > 0 || crop.bottom > 0 || crop.left > 0 || crop.right > 0);

  const remainingWidthPercent = Math.max(1, 100 - crop.left - crop.right);
  const remainingHeightPercent = Math.max(1, 100 - crop.top - crop.bottom);

  const approxWidthPx = Math.round(
    (naturalDimensions.width * remainingWidthPercent) / 100,
  );
  const approxHeightPx = Math.round(
    (naturalDimensions.height * remainingHeightPercent) / 100,
  );

  const handlePreset = (preset: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  }) => {
    setCrop({
      enabled: true,
      ...preset,
    });
  };

  const handleReset = () => {
    setCrop({
      enabled: false,
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden bg-card border-border/80 text-foreground shadow-2xl rounded-2xl">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/70 bg-secondary/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
                <Scissors className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
                  Recorte Manual da Imagem & Seleção de Área
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Isole apenas a foto, remova cabeçalhos de tweets/memes ou corte marcas d'água indesejadas.
                </DialogDescription>
              </div>
            </div>

            {/* Toggle Ativar/Desativar */}
            <div className="flex items-center gap-2 bg-secondary/40 px-3 py-1.5 rounded-xl border border-border/60">
              <Switch
                checked={crop.enabled}
                onCheckedChange={(checked) =>
                  setCrop((prev) => ({ ...prev, enabled: checked }))
                }
                id="crop-active-toggle"
              />
              <Label
                htmlFor="crop-active-toggle"
                className="text-xs font-semibold cursor-pointer select-none text-foreground"
              >
                {crop.enabled ? "Recorte Ativo" : "Recorte Desativado"}
              </Label>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden max-h-[75vh]">
          {/* Lado Esquerdo: Área Visual Interativa com Máscara de Seleção */}
          <div className="lg:col-span-7 p-6 flex flex-col items-center justify-center bg-black/40 border-r border-border/70 overflow-hidden relative">
            <div className="relative max-h-[460px] max-w-full rounded-xl overflow-hidden shadow-2xl border border-border/80 select-none">
              {/* Imagem Original */}
              <img
                src={imageItem.previewUrl}
                alt={imageItem.name}
                className="max-h-[420px] w-auto object-contain block"
              />

              {/* Máscara de Sobreposição quando o recorte estiver ativado */}
              {crop.enabled && (
                <>
                  {/* Máscara Superior (escura) */}
                  <div
                    className="absolute inset-x-0 top-0 bg-black/75 backdrop-blur-[1px] transition-all duration-75 border-b border-primary/60"
                    style={{ height: `${crop.top}%` }}
                  >
                    {crop.top > 6 && (
                      <span className="absolute bottom-1 right-2 text-[10px] font-mono text-primary font-bold bg-black/80 px-1.5 py-0.5 rounded">
                        Corte Topo: -{crop.top}%
                      </span>
                    )}
                  </div>

                  {/* Máscara Inferior (escura) */}
                  <div
                    className="absolute inset-x-0 bottom-0 bg-black/75 backdrop-blur-[1px] transition-all duration-75 border-t border-primary/60"
                    style={{ height: `${crop.bottom}%` }}
                  >
                    {crop.bottom > 6 && (
                      <span className="absolute top-1 right-2 text-[10px] font-mono text-primary font-bold bg-black/80 px-1.5 py-0.5 rounded">
                        Corte Base: -{crop.bottom}%
                      </span>
                    )}
                  </div>

                  {/* Máscara Esquerda (escura) */}
                  <div
                    className="absolute left-0 bg-black/75 backdrop-blur-[1px] transition-all duration-75 border-r border-primary/60"
                    style={{
                      top: `${crop.top}%`,
                      bottom: `${crop.bottom}%`,
                      width: `${crop.left}%`,
                    }}
                  />

                  {/* Máscara Direita (escura) */}
                  <div
                    className="absolute right-0 bg-black/75 backdrop-blur-[1px] transition-all duration-75 border-l border-primary/60"
                    style={{
                      top: `${crop.top}%`,
                      bottom: `${crop.bottom}%`,
                      width: `${crop.right}%`,
                    }}
                  />

                  {/* Caixa de Área Ativa Selecionada (Área que será mantida) */}
                  <div
                    className="absolute pointer-events-none ring-2 ring-primary ring-offset-1 ring-offset-black/50 shadow-inner"
                    style={{
                      top: `${crop.top}%`,
                      bottom: `${crop.bottom}%`,
                      left: `${crop.left}%`,
                      right: `${crop.right}%`,
                    }}
                  >
                    {/* Linhas da Regra dos Terços para enquadramento perfeito */}
                    <div className="absolute inset-x-0 top-1/3 border-b border-primary/30 border-dashed" />
                    <div className="absolute inset-x-0 top-2/3 border-b border-primary/30 border-dashed" />
                    <div className="absolute inset-y-0 left-1/3 border-r border-primary/30 border-dashed" />
                    <div className="absolute inset-y-0 left-2/3 border-r border-primary/30 border-dashed" />

                    <div className="absolute top-1.5 left-2 bg-primary text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded shadow">
                      Área Útil: {remainingWidthPercent}% × {remainingHeightPercent}%
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Dimensões em tempo real */}
            <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground font-mono">
              <span className="bg-secondary/60 px-2 py-0.5 rounded border border-border/60">
                Original: {naturalDimensions.width} × {naturalDimensions.height} px
              </span>
              <span>➔</span>
              <span className="bg-primary/15 text-primary px-2 py-0.5 rounded border border-primary/30 font-semibold">
                Recortada: ~{approxWidthPx} × {approxHeightPx} px
              </span>
            </div>
          </div>

          {/* Lado Direito: Controles e Sliders de Recorte */}
          <div className="lg:col-span-5 p-5 flex flex-col justify-between overflow-y-auto space-y-4">
            <div className="space-y-4">
              {/* Presets Rápidos Inteligentes */}
              <div>
                <Label className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-primary" /> Presets Rápidos de Recorte
                </Label>
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      handlePreset({ top: 32, bottom: 0, left: 0, right: 0 })
                    }
                    className="p-2 rounded-lg border border-border/70 bg-secondary/30 hover:bg-secondary hover:border-primary/50 text-left transition flex flex-col"
                  >
                    <span className="text-xs font-semibold text-foreground">
                      Remover Tweet/Meme
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Corta 32% do topo
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handlePreset({ top: 0, bottom: 18, left: 0, right: 0 })
                    }
                    className="p-2 rounded-lg border border-border/70 bg-secondary/30 hover:bg-secondary hover:border-primary/50 text-left transition flex flex-col"
                  >
                    <span className="text-xs font-semibold text-foreground">
                      Remover Rodapé
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Corta 18% da base
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handlePreset({ top: 28, bottom: 16, left: 0, right: 0 })
                    }
                    className="p-2 rounded-lg border border-border/70 bg-secondary/30 hover:bg-secondary hover:border-primary/50 text-left transition flex flex-col"
                  >
                    <span className="text-xs font-semibold text-foreground">
                      Apenas Foto Central
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Limpa topo & base
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleReset}
                    className="p-2 rounded-lg border border-border/70 bg-secondary/30 hover:bg-secondary hover:border-destructive/50 text-left transition flex flex-col"
                  >
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                      <RotateCcw className="size-3" /> Resetar
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Sem recorte (100%)
                    </span>
                  </button>
                </div>
              </div>

              {/* Sliders Manuais com Ajuste Fino */}
              <div className="rounded-xl border border-border/80 bg-secondary/20 p-3.5 space-y-3.5">
                <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Sliders className="size-3.5 text-primary" /> Ajuste Manual de Bordas
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Defina em % o quanto cortar
                  </span>
                </Label>

                {/* Cortar Topo */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] font-medium text-foreground flex items-center gap-1">
                      <MoveVertical className="size-3 text-primary" /> Cortar Topo
                    </span>
                    <div className="flex items-center gap-1 font-mono text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                      {crop.top}%
                    </div>
                  </div>
                  <Slider
                    min={0}
                    max={80}
                    step={1}
                    value={[crop.top]}
                    onValueChange={([val]) =>
                      setCrop((prev) => ({
                        ...prev,
                        enabled: true,
                        top: val ?? 0,
                      }))
                    }
                  />
                </div>

                {/* Cortar Base */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] font-medium text-foreground flex items-center gap-1">
                      <MoveVertical className="size-3 text-primary" /> Cortar Base / Rodapé
                    </span>
                    <div className="flex items-center gap-1 font-mono text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                      {crop.bottom}%
                    </div>
                  </div>
                  <Slider
                    min={0}
                    max={80}
                    step={1}
                    value={[crop.bottom]}
                    onValueChange={([val]) =>
                      setCrop((prev) => ({
                        ...prev,
                        enabled: true,
                        bottom: val ?? 0,
                      }))
                    }
                  />
                </div>

                {/* Cortar Laterais (Esquerda & Direita) */}
                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border/50">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[11px] font-medium text-foreground">
                        Esquerda
                      </span>
                      <span className="font-mono text-[11px] font-semibold text-primary">
                        {crop.left}%
                      </span>
                    </div>
                    <Slider
                      min={0}
                      max={45}
                      step={1}
                      value={[crop.left]}
                      onValueChange={([val]) =>
                        setCrop((prev) => ({
                          ...prev,
                          enabled: true,
                          left: val ?? 0,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[11px] font-medium text-foreground">
                        Direita
                      </span>
                      <span className="font-mono text-[11px] font-semibold text-primary">
                        {crop.right}%
                      </span>
                    </div>
                    <Slider
                      min={0}
                      max={45}
                      step={1}
                      value={[crop.right]}
                      onValueChange={([val]) =>
                        setCrop((prev) => ({
                          ...prev,
                          enabled: true,
                          right: val ?? 0,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="pt-3 border-t border-border/70 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="h-9 text-xs"
                >
                  Cancelar
                </Button>

                <Button
                  type="button"
                  onClick={() => onApplyCrop(crop, false)}
                  className="h-9 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
                >
                  <Check className="size-3.5 mr-1" /> Aplicar nesta Imagem
                </Button>
              </div>

              {queueLength > 1 && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onApplyCrop(crop, true)}
                  className="w-full h-8 text-xs font-medium text-foreground hover:bg-secondary/80 border border-border"
                >
                  <Layers className="size-3 mr-1 text-primary" /> Aplicar a Todas as Imagens da Fila ({queueLength})
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
