import {
  type ImageFlashAdjustment,
  type TemplateVisual,
  type InstagramImageFormat,
  INSTAGRAM_IMAGE_FORMATS,
  type FilterType,
  type ImageCropConfig,
  type ImageLayerOrder,
} from "./types";
import { formatBatchDate } from "./video-processor";
import { createZip, downloadBlob } from "./zip-utils";

export interface ImageRenderProgressCallback {
  (current: number, total: number, message: string): void;
}

export interface RenderedImageResult {
  id: string;
  name: string;
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  sizeMB: number;
}

/**
 * Motor de Composição e Renderização de Imagens em Massa (Imagem Flash).
 * Opera 100% no navegador (Client-Side Canvas 2D) com velocidade instantânea
 * e sem limites de quantidade.
 */
export class ImageProcessor {
  /**
   * Obtém as dimensões de largura e altura nativas para o formato do Instagram escolhido.
   */
  static getFormatDimensions(format: InstagramImageFormat = "portrait_4_5"): {
    width: number;
    height: number;
  } {
    const spec = INSTAGRAM_IMAGE_FORMATS.find((f) => f.id === format);
    return {
      width: spec?.width ?? 1080,
      height: spec?.height ?? 1350,
    };
  }

  /**
   * Converte a seleção de filtro para regra CSS de Canvas.
   */
  static getCanvasFilter(filter: FilterType, intensity: number): string {
    const factor = intensity / 100;
    switch (filter) {
      case "contrast":
        return `contrast(${1 + factor * 0.8})`;
      case "brightness":
        return `brightness(${1 + factor * 0.35})`;
      case "saturation":
        return `saturate(${1 + factor * 1.2})`;
      case "blackwhite":
        return `grayscale(${factor * 100}%)`;
      case "vintage":
        return `sepia(${factor * 60}%) contrast(${1 + factor * 0.2}) saturate(${1 - factor * 0.3})`;
      case "sharp":
        return `contrast(${1 + factor * 0.3}) brightness(${1 + factor * 0.05})`;
      default:
        return "none";
    }
  }

  /**
   * Carrega uma imagem a partir de um File ou URL e retorna o elemento HTMLImageElement.
   */
  static async loadImage(source: File | string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      let url = "";

      if (typeof source === "string") {
        url = source;
      } else {
        url = URL.createObjectURL(source);
      }

      img.onload = () => {
        if (typeof source !== "string") URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (e) => {
        if (typeof source !== "string") URL.revokeObjectURL(url);
        reject(new Error("Falha ao carregar imagem: " + e));
      };

      img.src = url;
    });
  }

  /**
   * Renderiza uma imagem individual com template aplicado e retorna o Blob.
   */
  static async renderImage(
    sourceImg: HTMLImageElement | File,
    adj: ImageFlashAdjustment,
    template: TemplateVisual,
    customWidth?: number,
    customHeight?: number,
    overrideCrop?: ImageCropConfig,
  ): Promise<Blob> {
    const dims = ImageProcessor.getFormatDimensions(adj.format);
    const canvasWidth = customWidth ?? dims.width;
    const canvasHeight = customHeight ?? dims.height;

    const img = sourceImg instanceof HTMLImageElement ? sourceImg : await ImageProcessor.loadImage(sourceImg);

    // Carrega foto de perfil se habilitada
    let profileImg: HTMLImageElement | null = null;
    if (template.profilePic.enabled && template.profilePic.imageUrl) {
      try {
        profileImg = await ImageProcessor.loadImage(template.profilePic.imageUrl);
      } catch {
        profileImg = null;
      }
    }

    // Carrega marca d'água de imagem se habilitada
    let watermarkImg: HTMLImageElement | null = null;
    if (
      template.watermark.enabled &&
      template.watermark.type === "image" &&
      template.watermark.imageUrl
    ) {
      try {
        watermarkImg = await ImageProcessor.loadImage(template.watermark.imageUrl);
      } catch {
        watermarkImg = null;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponível");

    // 1. Fundo sólido do template
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = template.background?.color || "#0D0E15";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const isOverlay = adj.layerOrder === "overlay";

    // Se NÃO for sobreposto, desenha a imagem primeiro (por baixo do texto)
    if (!isOverlay) {
      ImageProcessor.drawCentralImage(ctx, img, adj, canvasWidth, canvasHeight, overrideCrop);
    }

    // 2. Elementos do Template (Texto, Perfil, Selo, Marca d'água)
    ImageProcessor.drawProfilePic(ctx, template, canvasWidth, canvasHeight, profileImg);
    ImageProcessor.drawPageNameAndBadge(ctx, template, canvasWidth, canvasHeight);
    ImageProcessor.drawHeadline(ctx, template, canvasWidth, canvasHeight);
    ImageProcessor.drawSubHeadline(ctx, template, canvasWidth, canvasHeight);
    ImageProcessor.drawWatermark(ctx, template, canvasWidth, canvasHeight, watermarkImg);

    // Se FOR sobreposto, desenha a imagem por cima de tudo
    if (isOverlay) {
      ImageProcessor.drawCentralImage(ctx, img, adj, canvasWidth, canvasHeight, overrideCrop);
    }

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Falha ao exportar imagem"));
        },
        "image/png",
        0.98,
      );
    });
  }

  /**
   * Renderiza a imagem central no canvas com suporte a recorte e transformação.
   */
  static drawCentralImage(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    adj: ImageFlashAdjustment,
    canvasWidth: number,
    canvasHeight: number,
    overrideCrop?: ImageCropConfig,
  ) {
    ctx.save();
    try {
      const srcW = img.naturalWidth || img.width;
      const srcH = img.naturalHeight || img.height;

      const effectiveCrop = overrideCrop ?? adj.crop;
      const isCropActive =
        Boolean(effectiveCrop?.enabled) &&
        ((effectiveCrop?.top ?? 0) > 0 ||
          (effectiveCrop?.bottom ?? 0) > 0 ||
          (effectiveCrop?.left ?? 0) > 0 ||
          (effectiveCrop?.right ?? 0) > 0);

      let cropLeft = 0;
      let cropTop = 0;
      let cutW = srcW;
      let cutH = srcH;

      if (isCropActive && effectiveCrop) {
        cropLeft = Math.max(0, Math.min(srcW - 1, ((effectiveCrop.left || 0) / 100) * srcW));
        cropTop = Math.max(0, Math.min(srcH - 1, ((effectiveCrop.top || 0) / 100) * srcH));
        const cropRight = Math.max(0, Math.min(srcW - cropLeft - 1, ((effectiveCrop.right || 0) / 100) * srcW));
        const cropBottom = Math.max(0, Math.min(srcH - cropTop - 1, ((effectiveCrop.bottom || 0) / 100) * srcH));

        cutW = Math.max(1, srcW - cropLeft - cropRight);
        cutH = Math.max(1, srcH - cropTop - cropBottom);
      }

      const imgAspect = cutW / cutH;

      const posX = ((adj.imageX ?? 50) / 100) * canvasWidth;
      const posY = ((adj.imageY ?? 56) / 100) * canvasHeight;
      const renderWidth = ((adj.imageWidth ?? 94) / 100) * canvasWidth;

      let renderHeight = renderWidth / imgAspect;

      const maxAvailableHeight = canvasHeight * 0.72;
      if (renderHeight > maxAvailableHeight && adj.imageFit === "contain") {
        renderHeight = maxAvailableHeight;
      }

      ctx.translate(posX, posY);

      // Se for sobreposto ao template, adiciona sombra suave para destacar
      if (adj.layerOrder === "overlay") {
        ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
        ctx.shadowBlur = Math.round(20 * (canvasWidth / 1080));
        ctx.shadowOffsetY = Math.round(8 * (canvasWidth / 1080));
      }

      // Cantos arredondados da imagem
      const rawRadius = adj.borderRadius ?? 14;
      if (rawRadius > 0) {
        const scaleFactor = canvasWidth / 360;
        const r = Math.min(rawRadius * scaleFactor, renderWidth / 2, renderHeight / 2);
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(-renderWidth / 2, -renderHeight / 2, renderWidth, renderHeight, r);
        } else {
          ctx.rect(-renderWidth / 2, -renderHeight / 2, renderWidth, renderHeight);
        }
        ctx.clip();
      }

      // Aplica zoom se diferente de 1
      if (adj.zoom && adj.zoom !== 1) {
        ctx.scale(adj.zoom, adj.zoom);
      }

      // Filtro visual
      if (adj.filter && adj.filter !== "normal") {
        ctx.filter = ImageProcessor.getCanvasFilter(adj.filter, adj.filterIntensity ?? 50);
      }

      if (isCropActive) {
        ctx.drawImage(
          img,
          cropLeft,
          cropTop,
          cutW,
          cutH,
          -renderWidth / 2,
          -renderHeight / 2,
          renderWidth,
          renderHeight,
        );
      } else {
        ctx.drawImage(
          img,
          -renderWidth / 2,
          -renderHeight / 2,
          renderWidth,
          renderHeight,
        );
      }
    } finally {
      ctx.restore();
    }
  }

  /**
   * Gera uma imagem recortada sob demanda em DataURL (PNG).
   */
  static async createCroppedDataUrl(
    source: HTMLImageElement | File | string,
    crop: ImageCropConfig,
  ): Promise<string> {
    const img = source instanceof HTMLImageElement ? source : await ImageProcessor.loadImage(source);
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;

    const cropLeftPx = Math.max(0, Math.min(srcW - 1, ((crop.left || 0) / 100) * srcW));
    const cropTopPx = Math.max(0, Math.min(srcH - 1, ((crop.top || 0) / 100) * srcH));
    const cropRightPx = Math.max(0, Math.min(srcW - cropLeftPx - 1, ((crop.right || 0) / 100) * srcW));
    const cropBottomPx = Math.max(0, Math.min(srcH - cropTopPx - 1, ((crop.bottom || 0) / 100) * srcH));

    const cutW = Math.max(1, srcW - cropLeftPx - cropRightPx);
    const cutH = Math.max(1, srcH - cropTopPx - cropBottomPx);

    const canvas = document.createElement("canvas");
    canvas.width = cutW;
    canvas.height = cutH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return typeof source === "string" ? source : "";

    ctx.drawImage(img, cropLeftPx, cropTopPx, cutW, cutH, 0, 0, cutW, cutH);
    return canvas.toDataURL("image/png");
  }

  /**
   * Renderiza foto de perfil circular com borda
   */
  static drawProfilePic(
    ctx: CanvasRenderingContext2D,
    template: TemplateVisual,
    canvasWidth: number,
    canvasHeight: number,
    profileImg: HTMLImageElement | null,
  ) {
    if (!template.profilePic.enabled || !profileImg) return;

    ctx.save();
    try {
      const scaleFactor = canvasWidth / 1080;
      const size = template.profilePic.size * scaleFactor;
      const x = (template.profilePic.x / 100) * canvasWidth;
      const y = (template.profilePic.y / 100) * canvasHeight;

      if (template.profilePic.circular) {
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
      }

      const pZoom = (template.profilePic.zoom ?? 100) / 100;
      const drawSize = size * pZoom;
      ctx.drawImage(
        profileImg,
        x - drawSize / 2,
        y - drawSize / 2,
        drawSize,
        drawSize,
      );

      // Borda da foto de perfil
      if (template.profilePic.borderEnabled && template.profilePic.borderWidth > 0) {
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.strokeStyle = template.profilePic.borderColor || "#FFFFFF";
        ctx.lineWidth = template.profilePic.borderWidth * scaleFactor;
        ctx.stroke();
      }
    } finally {
      ctx.restore();
    }
  }

  /**
   * Renderiza nome da página e selo de verificado
   */
  static drawPageNameAndBadge(
    ctx: CanvasRenderingContext2D,
    template: TemplateVisual,
    canvasWidth: number,
    canvasHeight: number,
  ) {
    if (!template.pageName.enabled || !template.pageName.text) return;

    ctx.save();
    try {
      const scaleFactor = canvasWidth / 1080;
      const fontSize = Math.round(template.pageName.fontSize * scaleFactor);
      const fontFam = template.pageName.fontFamily || "Inter, sans-serif";
      const fontWeight = template.pageName.fontWeight === "bold" ? "700" : template.pageName.fontWeight === "600" ? "600" : "500";

      ctx.font = `${fontWeight} ${fontSize}px ${fontFam}`;
      ctx.fillStyle = template.pageName.color || "#FFFFFF";
      ctx.textAlign = template.pageName.align || "left";
      ctx.textBaseline = "middle";

      const x = (template.pageName.x / 100) * canvasWidth;
      const y = (template.pageName.y / 100) * canvasHeight;

      ctx.fillText(template.pageName.text, x, y);

      // Desenha selo oficial de verificado
      if (template.badge.enabled) {
        const textMetrics = ctx.measureText(template.pageName.text);
        const badgeSize = (template.badge.size || 20) * scaleFactor;
        const badgeX = x + textMetrics.width + 12 * scaleFactor;
        const badgeY = y;

        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = "#3897F0"; // Instagram Verified Blue
        ctx.fill();

        // Checkmark branco
        ctx.beginPath();
        ctx.moveTo(badgeX - badgeSize * 0.22, badgeY);
        ctx.lineTo(badgeX - badgeSize * 0.05, badgeY + badgeSize * 0.18);
        ctx.lineTo(badgeX + badgeSize * 0.24, badgeY - badgeSize * 0.16);
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 2.2 * scaleFactor;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }
    } finally {
      ctx.restore();
    }
  }

  /**
   * Renderiza a headline com quebra de linha inteligente
   */
  static drawHeadline(
    ctx: CanvasRenderingContext2D,
    template: TemplateVisual,
    canvasWidth: number,
    canvasHeight: number,
  ) {
    if (!template.headline.enabled || !template.headline.text) return;

    ctx.save();
    try {
      const scaleFactor = canvasWidth / 1080;
      const fontSize = Math.round(template.headline.fontSize * scaleFactor);
      const fontFam = template.headline.fontFamily || "Outfit, sans-serif";
      const fontWeight = template.headline.fontWeight === "bold" ? "800" : template.headline.fontWeight === "600" ? "600" : "500";

      ctx.font = `${fontWeight} ${fontSize}px ${fontFam}`;
      ctx.fillStyle = template.headline.color || "#FFFFFF";
      ctx.textAlign = template.headline.align || "center";
      ctx.textBaseline = "top";

      const x = (template.headline.x / 100) * canvasWidth;
      const y = (template.headline.y / 100) * canvasHeight;
      const maxWidth = ((template.headline.maxWidth || 92) / 100) * canvasWidth;
      const lineHeight = fontSize * 1.25;

      const words = template.headline.text.split(" ");
      let currentLine = "";
      const lines: string[] = [];

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);

      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 8 * scaleFactor;
      ctx.shadowOffsetY = 2 * scaleFactor;

      lines.forEach((line, idx) => {
        ctx.fillText(line, x, y + idx * lineHeight);
      });
    } finally {
      ctx.restore();
    }
  }

  /**
   * Renderiza sublegenda / texto de apoio
   */
  static drawSubHeadline(
    ctx: CanvasRenderingContext2D,
    template: TemplateVisual,
    canvasWidth: number,
    canvasHeight: number,
  ) {
    if (!template.subHeadline.enabled || !template.subHeadline.text) return;

    ctx.save();
    try {
      const scaleFactor = canvasWidth / 1080;
      const fontSize = Math.round(template.subHeadline.fontSize * scaleFactor);
      const fontFam = template.subHeadline.fontFamily || "Inter, sans-serif";
      const fontWeight = template.subHeadline.fontWeight === "bold" ? "700" : "400";

      ctx.font = `${fontWeight} ${fontSize}px ${fontFam}`;
      ctx.fillStyle = template.subHeadline.color || "#A1A1AA";
      ctx.textAlign = template.subHeadline.align || "center";
      ctx.textBaseline = "top";

      const x = (template.subHeadline.x / 100) * canvasWidth;
      const y = (template.subHeadline.y / 100) * canvasHeight;
      const maxWidth = ((template.subHeadline.maxWidth || 88) / 100) * canvasWidth;
      const lineHeight = fontSize * 1.35;

      const words = template.subHeadline.text.split(" ");
      let currentLine = "";
      const lines: string[] = [];

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);

      lines.forEach((line, idx) => {
        ctx.fillText(line, x, y + idx * lineHeight);
      });
    } finally {
      ctx.restore();
    }
  }

  /**
   * Renderiza marca d'água no rodapé
   */
  static drawWatermark(
    ctx: CanvasRenderingContext2D,
    template: TemplateVisual,
    canvasWidth: number,
    canvasHeight: number,
    watermarkImg: HTMLImageElement | null,
  ) {
    if (!template.watermark.enabled) return;

    ctx.save();
    try {
      const scaleFactor = canvasWidth / 1080;
      ctx.globalAlpha = (template.watermark.opacity ?? 60) / 100;

      const x = (template.watermark.x / 100) * canvasWidth;
      const y = (template.watermark.y / 100) * canvasHeight;

      if (template.watermark.type === "image" && watermarkImg) {
        const wSize = (template.watermark.size || 80) * scaleFactor;
        const aspect = (watermarkImg.naturalWidth || 1) / (watermarkImg.naturalHeight || 1);
        const wHeight = wSize / aspect;
        ctx.drawImage(watermarkImg, x - wSize / 2, y - wHeight / 2, wSize, wHeight);
      } else if (template.watermark.text) {
        const fontSize = Math.round((template.watermark.fontSize || 14) * scaleFactor);
        ctx.font = `600 ${fontSize}px Inter, sans-serif`;
        ctx.fillStyle = template.watermark.color || "#71717A";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(template.watermark.text, x, y);
      }
    } finally {
      ctx.restore();
    }
  }

  /**
   * Renderização em massa de uma lista de imagens com acompanhamento de progresso.
   */
  static async renderBatch(
    images: { id: string; file: File; name: string; crop?: ImageCropConfig | undefined }[],
    adj: ImageFlashAdjustment,
    template: TemplateVisual,
    onProgress?: ImageRenderProgressCallback,
  ): Promise<RenderedImageResult[]> {
    const results: RenderedImageResult[] = [];
    const total = images.length;
    const date = new Date();

    for (let i = 0; i < total; i++) {
      const item = images[i];
      if (!item) continue;

      const currentNum = i + 1;
      onProgress?.(currentNum, total, `Modelando imagem ${currentNum} de ${total}...`);

      const padIndex = String(currentNum).padStart(2, "0");
      const dateStr = formatBatchDate(date);
      const outputName = `Lote_${padIndex}_${dateStr}.png`;

      const blob = await ImageProcessor.renderImage(
        item.file,
        adj,
        template,
        undefined,
        undefined,
        item.crop,
      );
      const dataUrl = URL.createObjectURL(blob);
      const dims = ImageProcessor.getFormatDimensions(adj.format);

      results.push({
        id: item.id,
        name: outputName,
        blob,
        dataUrl,
        width: dims.width,
        height: dims.height,
        sizeMB: Math.round((blob.size / (1024 * 1024)) * 100) / 100,
      });
    }

    onProgress?.(total, total, "Todas as imagens foram finalizadas com sucesso!");
    return results;
  }

  /**
   * Empacota todas as imagens geradas em um único arquivo ZIP e dispara o download.
   */
  static async downloadBatchAsZip(
    results: RenderedImageResult[],
    zipName: string = `Lote_Imagens_${formatBatchDate()}.zip`,
  ): Promise<void> {
    if (results.length === 0) return;

    const filesToZip = results.map((r) => ({
      name: r.name,
      data: r.blob,
    }));

    const zipBlob = await createZip(filesToZip);
    downloadBlob(zipBlob, zipName);
  }
}
