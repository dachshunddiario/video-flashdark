import React, { useRef } from "react";
import {
  type ImageFlashAdjustment,
  type TemplateVisual,
  type ImageCropConfig,
  DEFAULT_IMAGE_CROP,
  INSTAGRAM_IMAGE_FORMATS,
} from "@/lib/types";
import { ImageProcessor } from "@/lib/image-processor";
import { Sparkles } from "lucide-react";

interface ImageCanvasPreviewProps {
  currentImage: {
    id: string;
    file: File;
    name: string;
    previewUrl: string;
    crop?: ImageCropConfig | undefined;
  } | null;
  adjustment: ImageFlashAdjustment;
  template: TemplateVisual;
  className?: string;
}

export function ImageCanvasPreview({
  currentImage,
  adjustment,
  template,
  className = "",
}: ImageCanvasPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const spec = INSTAGRAM_IMAGE_FORMATS.find((f) => f.id === adjustment.format) ?? INSTAGRAM_IMAGE_FORMATS[0];

  // Aspect ratio em CSS
  const aspectClass =
    adjustment.format === "portrait_4_5"
      ? "aspect-[4/5] max-h-[560px]"
      : adjustment.format === "square_1_1"
        ? "aspect-square max-h-[500px]"
        : "aspect-[9/16] max-h-[620px]";

  const scale = adjustment.zoom || 1;
  const filterStyle = ImageProcessor.getCanvasFilter(adjustment.filter, adjustment.filterIntensity ?? 50);

  const effectiveCrop = currentImage?.crop ?? adjustment.crop ?? DEFAULT_IMAGE_CROP;
  const isCropActive =
    Boolean(effectiveCrop?.enabled) &&
    ((effectiveCrop?.top ?? 0) > 0 ||
      (effectiveCrop?.bottom ?? 0) > 0 ||
      (effectiveCrop?.left ?? 0) > 0 ||
      (effectiveCrop?.right ?? 0) > 0);

  const remainingW = Math.max(1, 100 - (effectiveCrop?.left || 0) - (effectiveCrop?.right || 0));
  const remainingH = Math.max(1, 100 - (effectiveCrop?.top || 0) - (effectiveCrop?.bottom || 0));
  const cropAspect = `${remainingW} / ${remainingH}`;

  return (
    <div className={`relative flex flex-col items-center justify-center p-3 sm:p-6 select-none ${className}`}>
      {/* Badge de formato do Instagram */}
      <div className="mb-3 flex items-center gap-2 rounded-full border border-border/80 bg-secondary/60 px-3.5 py-1 text-xs text-muted-foreground backdrop-blur-md">
        <span className="inline-block size-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="font-semibold text-foreground">{spec?.label}</span>
        <span className="font-mono text-[11px] text-muted-foreground">({spec?.subLabel})</span>
      </div>

      {/* Frame Principal do Instagram */}
      <div
        ref={containerRef}
        className={`relative w-full max-w-[420px] rounded-2xl overflow-hidden border-2 border-border/90 shadow-2xl transition-all duration-200 ${aspectClass}`}
        style={{
          backgroundColor: template.background?.color || "#0D0E15",
        }}
      >
        {/* 1. Imagem Central Modelada com Suporte a Recorte e Camadas */}
        <div
          style={{
            position: "absolute",
            left: `${adjustment.imageX ?? 50}%`,
            top: `${adjustment.imageY ?? 56}%`,
            width: `${adjustment.imageWidth ?? 94}%`,
            transform: "translate(-50%, -50%)",
            zIndex: adjustment.layerOrder === "overlay" ? 40 : 10,
          }}
          className="relative flex items-center justify-center transition-all"
        >
          {currentImage ? (
            <div
              className="relative w-full overflow-hidden flex items-center justify-center shadow-lg transition-all"
              style={{
                borderRadius: `${adjustment.borderRadius ?? 14}px`,
                aspectRatio: isCropActive
                  ? cropAspect
                  : adjustment.imageFit === "cover"
                    ? adjustment.format === "portrait_4_5"
                      ? "4/3"
                      : "1/1"
                    : undefined,
                maxHeight: adjustment.format === "portrait_4_5" ? "380px" : "320px",
                boxShadow:
                  adjustment.layerOrder === "overlay"
                    ? "0 18px 36px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.12)"
                    : undefined,
              }}
            >
              {isCropActive ? (
                <div
                  className="relative w-full h-full overflow-hidden"
                  style={{
                    transform: `scale(${scale})`,
                    filter: filterStyle,
                  }}
                >
                  <img
                    src={currentImage.previewUrl}
                    alt={currentImage.name}
                    className="max-w-none transition-transform"
                    style={{
                      position: "absolute",
                      width: `${(100 / remainingW) * 100}%`,
                      height: `${(100 / remainingH) * 100}%`,
                      left: `-${((effectiveCrop.left || 0) / remainingW) * 100}%`,
                      top: `-${((effectiveCrop.top || 0) / remainingH) * 100}%`,
                      objectFit: "fill",
                    }}
                  />
                </div>
              ) : (
                <img
                  src={currentImage.previewUrl}
                  alt={currentImage.name}
                  className="w-full h-full object-cover transition-transform"
                  style={{
                    objectFit: adjustment.imageFit,
                    transform: `scale(${scale})`,
                    filter: filterStyle,
                  }}
                />
              )}
            </div>
          ) : (
            <div
              className="w-full h-64 border-2 border-dashed border-border/70 rounded-2xl flex flex-col items-center justify-center gap-2 text-muted-foreground bg-secondary/30"
              style={{ borderRadius: `${adjustment.borderRadius ?? 14}px` }}
            >
              <Sparkles className="size-8 text-primary/70 animate-pulse" />
              <span className="text-xs font-medium">Nenhuma imagem selecionada</span>
              <span className="text-[10px] text-muted-foreground">Adicione fotos na aba ao lado</span>
            </div>
          )}
        </div>

        {/* 2. Cabeçalho: Foto de Perfil + Nome da Página + Badge */}
        {template.profilePic.enabled && (
          <div
            style={{
              position: "absolute",
              left: `${template.profilePic.x}%`,
              top: `${template.profilePic.y}%`,
              transform: "translate(-50%, -50%)",
              zIndex: 30,
            }}
          >
            <div
              className="overflow-hidden shadow-md flex items-center justify-center"
              style={{
                width: `${template.profilePic.size * 0.35}px`,
                height: `${template.profilePic.size * 0.35}px`,
                borderRadius: template.profilePic.circular ? "9999px" : "8px",
                border:
                  template.profilePic.borderEnabled && template.profilePic.borderWidth > 0
                    ? `${template.profilePic.borderWidth * 0.35}px solid ${template.profilePic.borderColor}`
                    : "none",
                backgroundColor: "#222",
              }}
            >
              {template.profilePic.imageUrl ? (
                <img
                  src={template.profilePic.imageUrl}
                  alt="Perfil"
                  className="w-full h-full object-cover"
                  style={{
                    transform: `scale(${(template.profilePic.zoom ?? 100) / 100})`,
                  }}
                />
              ) : (
                <div className="size-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                  P
                </div>
              )}
            </div>
          </div>
        )}

        {/* Nome da Página & Selo Verificado */}
        {template.pageName.enabled && template.pageName.text && (
          <div
            style={{
              position: "absolute",
              left: `${template.pageName.x}%`,
              top: `${template.pageName.y}%`,
              transform:
                template.pageName.align === "center"
                  ? "translate(-50%, -50%)"
                  : template.pageName.align === "right"
                    ? "translate(-100%, -50%)"
                    : "translate(0, -50%)",
              zIndex: 30,
            }}
            className="flex items-center gap-1.5 whitespace-nowrap"
          >
            <span
              style={{
                color: template.pageName.color || "#FFFFFF",
                fontSize: `${template.pageName.fontSize * 0.38}px`,
                fontWeight: template.pageName.fontWeight || "600",
                fontFamily: template.pageName.fontFamily || "Inter, sans-serif",
              }}
            >
              {template.pageName.text}
            </span>

            {template.badge.enabled && (
              <span
                style={{
                  width: `${(template.badge.size || 18) * 0.38}px`,
                  height: `${(template.badge.size || 18) * 0.38}px`,
                }}
                className="inline-flex items-center justify-center rounded-full bg-[#3897F0] text-white shadow-xs"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="size-2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </span>
            )}
          </div>
        )}

        {/* 3. Headline (Manchete / Pergunta / Gancho) */}
        {template.headline.enabled && template.headline.text && (
          <div
            style={{
              position: "absolute",
              left: `${template.headline.x}%`,
              top: `${template.headline.y}%`,
              width: `${template.headline.maxWidth || 92}%`,
              transform:
                template.headline.align === "center"
                  ? "translate(-50%, 0)"
                  : template.headline.align === "right"
                    ? "translate(-100%, 0)"
                    : "translate(0, 0)",
              textAlign: template.headline.align || "center",
              zIndex: 30,
            }}
          >
            <p
              style={{
                color: template.headline.color || "#FFFFFF",
                fontSize: `${template.headline.fontSize * 0.36}px`,
                fontWeight: template.headline.fontWeight === "bold" ? 800 : 700,
                fontFamily: template.headline.fontFamily || "Outfit, sans-serif",
                lineHeight: 1.25,
                textShadow: "0 2px 8px rgba(0,0,0,0.6)",
              }}
            >
              {template.headline.text}
            </p>
          </div>
        )}

        {/* 4. Sublegenda (Contexto) */}
        {template.subHeadline.enabled && template.subHeadline.text && (
          <div
            style={{
              position: "absolute",
              left: `${template.subHeadline.x}%`,
              top: `${template.subHeadline.y}%`,
              width: `${template.subHeadline.maxWidth || 88}%`,
              transform:
                template.subHeadline.align === "center"
                  ? "translate(-50%, 0)"
                  : template.subHeadline.align === "right"
                    ? "translate(-100%, 0)"
                    : "translate(0, 0)",
              textAlign: template.subHeadline.align || "center",
              zIndex: 30,
            }}
          >
            <p
              style={{
                color: template.subHeadline.color || "#A1A1AA",
                fontSize: `${template.subHeadline.fontSize * 0.35}px`,
                fontWeight: template.subHeadline.fontWeight === "bold" ? 700 : 400,
                fontFamily: template.subHeadline.fontFamily || "Inter, sans-serif",
                lineHeight: 1.35,
              }}
            >
              {template.subHeadline.text}
            </p>
          </div>
        )}

        {/* 5. Marca d'água */}
        {template.watermark.enabled && (
          <div
            style={{
              position: "absolute",
              left: `${template.watermark.x}%`,
              top: `${template.watermark.y}%`,
              transform: "translate(-50%, -50%)",
              opacity: (template.watermark.opacity ?? 60) / 100,
              zIndex: 30,
            }}
          >
            {template.watermark.type === "image" && template.watermark.imageUrl ? (
              <img
                src={template.watermark.imageUrl}
                alt="Marca d'água"
                style={{ width: `${(template.watermark.size || 80) * 0.35}px` }}
                className="object-contain"
              />
            ) : (
              <span
                style={{
                  fontSize: `${(template.watermark.fontSize || 14) * 0.35}px`,
                  color: template.watermark.color || "#71717A",
                  fontFamily: "Inter, sans-serif",
                }}
                className="font-semibold tracking-wider uppercase text-[10px]"
              >
                {template.watermark.text || "@seuperfil"}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
