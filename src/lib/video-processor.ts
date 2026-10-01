import {
  type TemplateVisual,
  type VideoAdjustment,
  validateVideoOnlyCrop,
  calculateNativePixelCrop,
} from "./types";
import { createZip, type ZipFileInput } from "./zip-utils";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";

/**
 * Injeta metadados de duração em arquivos MP4 fragmentados para permitir seek e barra de progresso no Windows Media Player.
 */
export function patchMp4Duration(buffer: ArrayBuffer, durationSec: number): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const findBox = (tag: string, startOffset = 0): number => {
    const b0 = tag.charCodeAt(0);
    const b1 = tag.charCodeAt(1);
    const b2 = tag.charCodeAt(2);
    const b3 = tag.charCodeAt(3);
    for (let i = startOffset; i < bytes.length - 8; i++) {
      if (
        bytes[i] === b0 &&
        bytes[i + 1] === b1 &&
        bytes[i + 2] === b2 &&
        bytes[i + 3] === b3
      ) {
        return i;
      }
    }
    return -1;
  };

  // 1. Atualiza mvhd (Movie Header)
  let offset = findBox("mvhd");
  if (offset !== -1) {
    const version = bytes[offset + 4] ?? 0;
    if (version === 0) {
      const timescale = view.getUint32(offset + 16, false) || 1000;
      view.setUint32(offset + 20, Math.round(durationSec * timescale), false);
    } else if (version === 1) {
      const timescale = view.getUint32(offset + 24, false) || 1000;
      const dur = BigInt(Math.round(durationSec * timescale));
      view.setBigUint64(offset + 28, dur, false);
    }
  }

  // 2. Atualiza mehd se presente dentro de mvex
  offset = findBox("mehd");
  if (offset !== -1) {
    const version = bytes[offset + 4] ?? 0;
    const timescale = 1000;
    if (version === 0) {
      view.setUint32(offset + 8, Math.round(durationSec * timescale), false);
    } else if (version === 1) {
      view.setBigUint64(offset + 8, BigInt(Math.round(durationSec * timescale)), false);
    }
  }

  return buffer;
}

/**
 * Injeta metadados de duração em arquivos WebM para que players exibam a barra de progresso.
 */
export function patchWebmDuration(buffer: ArrayBuffer, durationSec: number): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  for (let i = 0; i < bytes.length - 12; i++) {
    if (bytes[i] === 0x44 && bytes[i + 1] === 0x89) {
      const lengthByte = bytes[i + 2];
      if (lengthByte === 0x84) {
        view.setFloat32(i + 3, durationSec * 1000, false);
        return buffer;
      } else if (lengthByte === 0x88) {
        view.setFloat64(i + 3, durationSec * 1000, false);
        return buffer;
      }
    }
  }
  return buffer;
}

export interface ProcessProgressCallback {
  (progress: number, message?: string): void;
}

export interface ProcessedVideoResult {
  id: string;
  name: string;
  blob: Blob;
  sizeMB: number;
}

export interface VideoLayoutMask {
  overlayX: number;
  overlayY: number;
  renderWidth: number;
  renderHeight: number;
  borderRadius: number;
  bgColor: string;
}

/**
 * Formata a data atual no formato brasileiro DD_MM_YYYY (ex: 23_09_2026).
 */
export function formatBatchDate(date: Date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}_${mm}_${yyyy}`;
}

/**
 * Gera o nome de arquivo padronizado para lote:
 * Ex: Lote_01_23_09_2026.mp4 | Lote_02_23_09_2026.mp4 | Lote_03_23_09_2026.mp4
 */
export function getBatchFileName(
  index: number,
  ext: string = "mp4",
  date: Date = new Date(),
): string {
  const padIndex = String(index).padStart(2, "0");
  const dateStr = formatBatchDate(date);
  const cleanExt = ext.replace(/^\./, "");
  return `Lote_${padIndex}_${dateStr}.${cleanExt}`;
}

/**
 * Camada de serviço de processamento e montagem de vídeos.
 * Opera 100% no dispositivo local, respeitando a privacidade dos arquivos.
 */
export class VideoProcessor {
  /**
   * Converte as coordenadas visuais da bounding box responsiva para o comando FFmpeg no pixel exato.
   */
  static getFFmpegCropCommand(
    nativeWidth: number,
    nativeHeight: number,
    adj: VideoAdjustment,
  ): {
    x: number;
    y: number;
    width: number;
    height: number;
    ffmpegArgs: string[];
    filterString: string;
  } {
    const res = calculateNativePixelCrop(
      nativeWidth,
      nativeHeight,
      adj.cropTop,
      adj.cropBottom,
      adj.cropLeft,
      adj.cropRight,
    );
    return {
      ...res,
      filterString: res.ffmpegFilter,
      ffmpegArgs: ["-vf", res.ffmpegFilter],
    };
  }
  /**
   * Constrói a linha de comando FFmpeg equivalente e completa para automação via desktop/CLI.
   */
  static buildFfmpegCommand(
    inputName: string,
    outputName: string,
    adj: VideoAdjustment,
    template: TemplateVisual,
    ffmpegPath = "ffmpeg",
  ): string {
    const videoFilters: string[] = [];

    // 1. Crop e Enquadramento 9:16
    if (adj.cropMode === "auto") {
      videoFilters.push("crop='min(iw,ih*9/16)':'min(ih,iw*16/9)':(iw-ow)/2:(ih-oh)/2");
    } else {
      const panXOffset = adj.cropPanX ? `+(iw*${(adj.cropPanX / 100).toFixed(2)})` : "";
      const panYOffset = adj.cropPanY ? `+(ih*${(adj.cropPanY / 100).toFixed(2)})` : "";
      videoFilters.push(
        `crop='min(iw,ih*9/16)':'min(ih,iw*16/9)':'(iw-ow)/2${panXOffset}':'(ih-oh)/2${panYOffset}'`,
      );
    }

    // 2. Zoom & Scale 1080x1920
    if (adj.zoom !== 1) {
      videoFilters.push(
        `scale=1080*${adj.zoom.toFixed(2)}:1920*${adj.zoom.toFixed(2)}`,
        "crop=1080:1920:(iw-1080)/2:(ih-1920)/2",
      );
    } else {
      videoFilters.push("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920");
    }

    // 3. Espelhamento
    if (adj.mirror) {
      videoFilters.push("hflip");
    }

    // 4. Filtros Visuais
    const intensityNorm = adj.filterIntensity / 100;
    switch (adj.filter) {
      case "contrast":
        videoFilters.push(`eq=contrast=${(1 + intensityNorm * 0.8).toFixed(2)}`);
        break;
      case "brightness":
        videoFilters.push(`eq=brightness=${(intensityNorm * 0.25).toFixed(2)}`);
        break;
      case "saturation":
        videoFilters.push(`eq=saturation=${(1 + intensityNorm * 1.2).toFixed(2)}`);
        break;
      case "blackwhite":
        videoFilters.push("hue=s=0");
        break;
      case "vintage":
        videoFilters.push(
          `eq=contrast=1.1:brightness=0.05:saturation=0.85,colorchannelmixer=rr=1.1:gg=1.0:bb=0.85`,
        );
        break;
      case "sharp":
        videoFilters.push(`unsharp=5:5:${(0.5 + intensityNorm * 1.5).toFixed(2)}:5:5:0.0`);
        break;
      default:
        break;
    }

    // 5. Velocidade de Vídeo
    if (adj.speed !== 1) {
      videoFilters.push(`setpts=${(1 / adj.speed).toFixed(3)}*PTS`);
    }

    // 6. Template Overlay: Headline, Sub-headline, Marca d'água via drawtext
    if (template.headline.enabled && template.headline.text.trim()) {
      const escaped = template.headline.text.replace(/[:'\\]/g, "");
      const yPos = Math.round((template.headline.y / 100) * 1920);
      videoFilters.push(
        `drawtext=text='${escaped}':fontcolor=${template.headline.color}@1.0:fontsize=${template.headline.fontSize * 2}:x=(w-text_w)/2:y=${yPos}`,
      );
    }

    if (template.subHeadline.enabled && template.subHeadline.text.trim()) {
      const escaped = template.subHeadline.text.replace(/[:'\\]/g, "");
      const yPos = Math.round((template.subHeadline.y / 100) * 1920);
      videoFilters.push(
        `drawtext=text='${escaped}':fontcolor=${template.subHeadline.color}@0.9:fontsize=${template.subHeadline.fontSize * 2}:x=(w-text_w)/2:y=${yPos}`,
      );
    }

    if (template.watermark.enabled && template.watermark.text.trim()) {
      const escaped = template.watermark.text.replace(/[:'\\]/g, "");
      const xPos = Math.round((template.watermark.x / 100) * 1080);
      const yPos = Math.round((template.watermark.y / 100) * 1920);
      const opacity = (template.watermark.opacity / 100).toFixed(2);
      videoFilters.push(
        `drawtext=text='${escaped}':fontcolor=white@${opacity}:fontsize=${template.watermark.fontSize * 2}:x=${xPos}-(text_w/2):y=${yPos}`,
      );
    }

    // Filtros de Áudio
    const audioFilters: string[] = [];
    if (adj.speed !== 1 && adj.keepAudio) {
      const atempo = Math.min(2.0, Math.max(0.5, adj.speed));
      audioFilters.push(`atempo=${atempo.toFixed(2)}`);
    }

    const vf = videoFilters.length > 0 ? `-vf "${videoFilters.join(",")}"` : "";
    const af =
      !adj.keepAudio
        ? "-an"
        : audioFilters.length > 0
          ? `-af "${audioFilters.join(",")}"`
          : "";

    return `${ffmpegPath} -y -i "${inputName}" ${vf} ${af} -c:v libx264 -preset veryfast -crf 22 -c:a aac -b:a 128k "${outputName}"`;
  }

  /**
   * Extrai miniatura (thumbnail) e duração do vídeo carregado.
   */
  static async extractMetadata(
    file: File,
  ): Promise<{ thumbnailUrl: string; durationSec: number }> {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;

      const url = URL.createObjectURL(file);
      video.src = url;

      const cleanup = () => {
        URL.revokeObjectURL(url);
        video.remove();
      };

      video.onloadedmetadata = () => {
        // Busca o frame a 0.5 segundo ou 0s
        const seekTime = Math.min(0.5, video.duration / 2);
        video.currentTime = seekTime;
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 180;
          canvas.height = 320; // Proporção 9:16
          const ctx = canvas.getContext("2d");
          if (ctx) {
            // Desenha com crop cover central
            const vRatio = video.videoWidth / video.videoHeight;
            const cRatio = 180 / 320;
            let sx = 0,
              sy = 0,
              sw = video.videoWidth,
              sh = video.videoHeight;

            if (vRatio > cRatio) {
              sw = video.videoHeight * cRatio;
              sx = (video.videoWidth - sw) / 2;
            } else {
              sh = video.videoWidth / cRatio;
              sy = (video.videoHeight - sh) / 2;
            }

            ctx.drawImage(video, sx, sy, sw, sh, 0, 0, 180, 320);
            const thumbnailUrl = canvas.toDataURL("image/jpeg", 0.7);
            const durationSec = video.duration || 0;
            cleanup();
            resolve({ thumbnailUrl, durationSec });
          } else {
            cleanup();
            resolve({ thumbnailUrl: "", durationSec: video.duration || 0 });
          }
        } catch (e) {
          cleanup();
          reject(e);
        }
      };

      video.onerror = (e) => {
        cleanup();
        reject(new Error("Não foi possível carregar o vídeo. Verifique o formato."));
      };
    });
  }

  /**
   * Renderiza uma camada completa em um frame de Canvas 2D de alta performance.
   */
  static renderFrame(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    adj: VideoAdjustment,
    template: TemplateVisual,
    canvasWidth: number,
    canvasHeight: number,
    profileImg: HTMLImageElement | null,
    watermarkImg: HTMLImageElement | null,
  ) {
    // 1. Reseta transformações e preenche fundo do template
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = template.background?.color || "#000000";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const layerOrder = adj.layerOrder || [
      "template",
      "video",
      "headline",
      "subHeadline",
      "watermark",
    ];
    const hiddenLayers = adj.hiddenLayers || [];
    const vWidth = video.videoWidth || canvasWidth;
    const vHeight = video.videoHeight || canvasHeight;

    for (const layerId of layerOrder) {
      if (hiddenLayers.includes(layerId)) continue;
      if (adj.exportOnlyVideoFootage && layerId !== "video") continue;

      ctx.save();
      try {
        if (layerId === "template") {
          VideoProcessor.drawProfilePic(ctx, template, canvasWidth, canvasHeight, profileImg);
          VideoProcessor.drawPageNameAndBadge(ctx, template, canvasWidth, canvasHeight);
        } else if (layerId === "video") {
          validateVideoOnlyCrop(
            vWidth,
            vHeight,
            adj.cropTop ?? 0,
            adj.cropBottom ?? 0,
            adj.cropLeft ?? 0,
            adj.cropRight ?? 0,
          );

          if (adj.filter && adj.filter !== "normal") {
            ctx.filter = VideoProcessor.getCanvasFilter(adj.filter, adj.filterIntensity ?? 100);
          }

          const scale = adj.zoom;
          const cropTopPct = Math.min(48, Math.max(0, adj.cropTop ?? 0)) / 100;
          const cropBottomPct = Math.min(48, Math.max(0, adj.cropBottom ?? 0)) / 100;
          const cropLeftPct = Math.min(48, Math.max(0, adj.cropLeft ?? 0)) / 100;
          const cropRightPct = Math.min(48, Math.max(0, adj.cropRight ?? 0)) / 100;

          const srcX = Math.round(vWidth * cropLeftPct);
          const srcY = Math.round(vHeight * cropTopPct);
          const srcW = Math.max(1, Math.round(vWidth * (1 - cropLeftPct - cropRightPct)));
          const srcH = Math.max(1, Math.round(vHeight * (1 - cropTopPct - cropBottomPct)));

          const croppedAspect = srcW / srcH;
          const posX = ((adj.videoX ?? 50) / 100) * canvasWidth;
          const posY = ((adj.videoY ?? 53) / 100) * canvasHeight;
          const renderWidth = ((adj.videoWidth ?? 96) / 100) * canvasWidth;
          const renderHeight = renderWidth / croppedAspect;

          ctx.translate(posX, posY);

          if (adj.rotation && adj.rotation !== 0) {
            ctx.rotate((adj.rotation * Math.PI) / 180);
          }

          const rawRadius = adj.borderRadius ?? 8;
          if (rawRadius > 0) {
            const r = Math.min(
              rawRadius * (canvasWidth / 360),
              renderWidth / 2,
              renderHeight / 2,
            );
            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(-renderWidth / 2, -renderHeight / 2, renderWidth, renderHeight, r);
            } else {
              ctx.rect(-renderWidth / 2, -renderHeight / 2, renderWidth, renderHeight);
            }
            ctx.clip();
          }

          if (adj.mirror) ctx.scale(-1, 1);
          ctx.scale(scale, scale);

          if (adj.cropPanX !== 0 || adj.cropPanY !== 0) {
            ctx.translate(
              (adj.cropPanX / 100) * renderWidth,
              (adj.cropPanY / 100) * renderHeight,
            );
          }

          ctx.drawImage(
            video,
            srcX,
            srcY,
            srcW,
            srcH,
            -renderWidth / 2,
            -renderHeight / 2,
            renderWidth,
            renderHeight,
          );
        } else if (layerId === "headline") {
          VideoProcessor.drawHeadline(ctx, template, canvasWidth, canvasHeight);
        } else if (layerId === "subHeadline") {
          VideoProcessor.drawSubHeadline(ctx, template, canvasWidth, canvasHeight);
        } else if (layerId === "watermark") {
          VideoProcessor.drawWatermark(ctx, template, canvasWidth, canvasHeight, watermarkImg);
        }
      } finally {
        ctx.restore();
      }
    }
  }

  /**
   * Renderiza apenas os elementos gráficos e tipográficos do template (sem o vídeo)
   */
  static renderTemplateOverlays(
    ctx: CanvasRenderingContext2D,
    template: TemplateVisual,
    canvasWidth: number,
    canvasHeight: number,
    profileImg: HTMLImageElement | null,
    watermarkImg: HTMLImageElement | null,
  ) {
    VideoProcessor.drawProfilePic(ctx, template, canvasWidth, canvasHeight, profileImg);
    VideoProcessor.drawPageNameAndBadge(ctx, template, canvasWidth, canvasHeight);
    VideoProcessor.drawHeadline(ctx, template, canvasWidth, canvasHeight);
    VideoProcessor.drawSubHeadline(ctx, template, canvasWidth, canvasHeight);
    VideoProcessor.drawWatermark(ctx, template, canvasWidth, canvasHeight, watermarkImg);
  }

  /**
   * Desenha com anti-aliasing de alta precisão as 4 quinas de recorte do vídeo usando a cor de fundo do template.
   * Isso transforma as quinas afiadas de 90° do vídeo retangular em cantos arredondados perfeitos na renderização GPU.
   */
  static drawVideoCornerMask(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
    bgColor: string,
  ) {
    if (radius <= 0) return;
    const r = Math.min(radius, Math.floor(w / 2), Math.floor(h / 2));
    if (r <= 0) return;

    ctx.save();
    ctx.fillStyle = bgColor;

    // 1. Canto Superior Esquerdo (Top-Left)
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + r, y);
    ctx.arc(x + r, y + r, r, -Math.PI / 2, Math.PI, true);
    ctx.closePath();
    ctx.fill();

    // 2. Canto Superior Direito (Top-Right)
    ctx.beginPath();
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + w, y + r);
    ctx.arc(x + w - r, y + r, r, 0, -Math.PI / 2, true);
    ctx.closePath();
    ctx.fill();

    // 3. Canto Inferior Direito (Bottom-Right)
    ctx.beginPath();
    ctx.moveTo(x + w, y + h);
    ctx.lineTo(x + w - r, y + h);
    ctx.arc(x + w - r, y + h - r, r, Math.PI / 2, 0, true);
    ctx.closePath();
    ctx.fill();

    // 4. Canto Inferior Esquerdo (Bottom-Left)
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + h - r);
    ctx.arc(x + r, y + h - r, r, Math.PI, Math.PI / 2, true);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  private static _overlayBlobPromiseCache: Map<string, Promise<Blob>> = new Map();

  static clearOverlayCache() {
    VideoProcessor._overlayBlobPromiseCache.clear();
  }

  /**
   * Gera uma imagem PNG transparente com todas as camadas visuais do template
   * (com cache inteligente baseado em Promise para não duplicar renderizações concorrentes).
   */
  static renderTemplateOverlayBlob(
    template: TemplateVisual,
    canvasWidth = 1080,
    canvasHeight = 1920,
    videoLayout?: VideoLayoutMask,
  ): Promise<Blob> {
    const cacheKey = JSON.stringify({ template, videoLayout }) + `_${canvasWidth}x${canvasHeight}`;
    if (VideoProcessor._overlayBlobPromiseCache.has(cacheKey)) {
      return VideoProcessor._overlayBlobPromiseCache.get(cacheKey)!;
    }

    const renderPromise = (async () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponível");

      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // Se houver cantos arredondados definidos para o vídeo, desenha as máscaras de canto com a cor de fundo do template
      if (videoLayout && videoLayout.borderRadius > 0) {
        VideoProcessor.drawVideoCornerMask(
          ctx,
          videoLayout.overlayX,
          videoLayout.overlayY,
          videoLayout.renderWidth,
          videoLayout.renderHeight,
          videoLayout.borderRadius,
          videoLayout.bgColor,
        );
      }

      let profileImg: HTMLImageElement | null = null;
      if (template.profilePic.enabled && template.profilePic.imageUrl) {
        profileImg = new Image();
        profileImg.crossOrigin = "anonymous";
        profileImg.src = template.profilePic.imageUrl;
        await new Promise<void>((r) => {
          profileImg!.onload = () => r();
          profileImg!.onerror = () => r();
        });
      }

      let watermarkImg: HTMLImageElement | null = null;
      if (
        template.watermark.enabled &&
        template.watermark.type === "image" &&
        template.watermark.imageUrl
      ) {
        watermarkImg = new Image();
        watermarkImg.crossOrigin = "anonymous";
        watermarkImg.src = template.watermark.imageUrl;
        await new Promise<void>((r) => {
          watermarkImg!.onload = () => r();
          watermarkImg!.onerror = () => r();
        });
      }

      VideoProcessor.renderTemplateOverlays(
        ctx,
        template,
        canvasWidth,
        canvasHeight,
        profileImg,
        watermarkImg,
      );

      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Erro ao gerar overlay do template"));
          }
        }, "image/png");
      });
    })();

    VideoProcessor._overlayBlobPromiseCache.set(cacheKey, renderPromise);
    return renderPromise;
  }

  /**
   * Verifica se o back-end local com NVIDIA RTX 3090 NVENC está ativo
   */
  static async isNativeNvencAvailable(): Promise<boolean> {
    try {
      const res = await fetch("/api/render-nvenc/status");
      if (!res.ok) return false;
      const data = await res.json();
      return !!data.available;
    } catch {
      return false;
    }
  }

  /**
   * Processamento na GPU NVIDIA RTX 3090 usando NVENC acelerado por hardware.
   * Renderiza vídeos em 2 a 3 segundos com qualidade máxima (-preset p2 -cq 26).
   */
  static async processVideoWithNativeNvenc(
    file: File,
    adj: VideoAdjustment,
    template: TemplateVisual,
    onProgress?: ProcessProgressCallback,
    abortSignal?: AbortSignal,
  ): Promise<Blob> {
    onProgress?.(5, "Conectando à NVIDIA RTX 3090 (NVENC)...");

    const video = document.createElement("video");
    video.preload = "metadata";
    const vUrl = URL.createObjectURL(file);
    video.src = vUrl;
    await new Promise<void>((r) => {
      video.onloadedmetadata = () => r();
      video.onerror = () => r();
    });
    const vWidth = video.videoWidth || 1080;
    const vHeight = video.videoHeight || 1920;
    const duration =
      video.duration && isFinite(video.duration) && video.duration > 0
        ? video.duration
        : 0;
    URL.revokeObjectURL(vUrl);
    video.remove();

    // Estimativa inteligente de bitrate baseada no arquivo original para manter o tamanho idêntico
    // (ex: vídeo de 4MB continua com ~4.2MB com qualidade nítida)
    const originalBitrate =
      duration > 0 && file.size > 0
        ? Math.round((file.size * 8) / duration)
        : 1_800_000;
    const targetVideoBitrate = Math.max(
      900_000,
      Math.min(Math.round(originalBitrate * 1.08), 2_800_000),
    );
    const maxBitrate = Math.round(targetVideoBitrate * 1.35);
    const bufSize = maxBitrate * 2;

    const cropTopPct = Math.min(48, Math.max(0, adj.cropTop ?? 0)) / 100;
    const cropBottomPct = Math.min(48, Math.max(0, adj.cropBottom ?? 0)) / 100;
    const cropLeftPct = Math.min(48, Math.max(0, adj.cropLeft ?? 0)) / 100;
    const cropRightPct = Math.min(48, Math.max(0, adj.cropRight ?? 0)) / 100;

    const srcX = Math.round(vWidth * cropLeftPct);
    const srcY = Math.round(vHeight * cropTopPct);
    const srcW = Math.max(2, Math.round(vWidth * (1 - cropLeftPct - cropRightPct)));
    const srcH = Math.max(2, Math.round(vHeight * (1 - cropTopPct - cropBottomPct)));

    const croppedAspect = srcW / srcH;
    const posX = Math.round(((adj.videoX ?? 50) / 100) * 1080);
    const posY = Math.round(((adj.videoY ?? 53) / 100) * 1920);
    const renderWidth = Math.round(((adj.videoWidth ?? 96) / 100) * 1080);
    const renderHeight = Math.round(renderWidth / croppedAspect);

    const overlayX = Math.round(posX - renderWidth / 2);
    const overlayY = Math.round(posY - renderHeight / 2);

    const rawRadius = adj.borderRadius ?? 8;
    const renderRadius = Math.round(rawRadius * (1080 / 360));

    const videoLayout: VideoLayoutMask = {
      overlayX,
      overlayY,
      renderWidth,
      renderHeight,
      borderRadius: renderRadius,
      bgColor: template.background?.color || "#000000",
    };

    onProgress?.(12, "Compondo template em alta resolução...");
    const overlayBlob = await VideoProcessor.renderTemplateOverlayBlob(
      template,
      1080,
      1920,
      videoLayout,
    );

    const jobId = "nvenc_" + Math.random().toString(36).slice(2) + "_" + Date.now();

    const formData = new FormData();
    formData.append("jobId", jobId);
    formData.append("duration", String(duration));
    formData.append("video", file);
    formData.append("templateImage", overlayBlob, "template.png");
    formData.append("cropX", String(srcX));
    formData.append("cropY", String(srcY));
    formData.append("cropW", String(srcW));
    formData.append("cropH", String(srcH));
    formData.append("overlayX", String(overlayX));
    formData.append("overlayY", String(overlayY));
    formData.append("overlayW", String(renderWidth));
    formData.append("overlayH", String(renderHeight));
    formData.append("borderRadius", String(rawRadius));
    formData.append("keepAudio", String(adj.keepAudio));
    formData.append("preset", "p2");
    formData.append("cq", "26");
    formData.append("targetBitrate", `${Math.round(targetVideoBitrate / 1000)}k`);
    formData.append("maxBitrate", `${Math.round(maxBitrate / 1000)}k`);
    formData.append("bufSize", `${Math.round(bufSize / 1000)}k`);
    formData.append("bgColor", template.background?.color || "#000000");

    onProgress?.(15, "Iniciando renderização GPU RTX 3090...");

    let isFinished = false;
    let pollTimeout: any = null;

    const pollNvencProgress = async () => {
      if (isFinished) return;
      try {
        const res = await fetch(`/api/render-nvenc/progress?id=${encodeURIComponent(jobId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.success && typeof data.progress === "number") {
            const pct = Math.min(98, Math.max(15, Math.round(data.progress)));
            const speedInfo = data.speed ? ` • ${data.speed}` : "";
            const fpsInfo = data.fps && data.fps > 0 ? ` (${Math.round(data.fps)} fps${speedInfo})` : "";
            onProgress?.(pct, `Renderizando via GPU RTX 3090: ${pct}%${fpsInfo}`);
          }
        }
      } catch {
        // Ignora pequenas falhas de polling na rede local
      }
      if (!isFinished) {
        pollTimeout = setTimeout(pollNvencProgress, 200);
      }
    };

    pollTimeout = setTimeout(pollNvencProgress, 180);

    try {
      const fetchInit: RequestInit = {
        method: "POST",
        body: formData,
      };
      if (abortSignal) {
        fetchInit.signal = abortSignal;
      }
      const response = await fetch("/api/render-nvenc", fetchInit);

      isFinished = true;
      if (pollTimeout) clearTimeout(pollTimeout);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Falha no motor NVENC: ${errText}`);
      }

      onProgress?.(99, "Finalizando contêiner MP4 FastStart...");
      const blob = await response.blob();
      onProgress?.(100, "Concluído!");
      return blob;
    } catch (e) {
      isFinished = true;
      if (pollTimeout) clearTimeout(pollTimeout);
      throw e;
    }
  }

  /**
   * Verifica suporte nativo da GPU para a API WebCodecs.
   */
  static isWebCodecsSupported(): boolean {
    return (
      typeof VideoEncoder !== "undefined" &&
      typeof VideoFrame !== "undefined" &&
      typeof AudioEncoder !== "undefined" &&
      typeof AudioData !== "undefined"
    );
  }

  /**
   * Processamento de vídeo com FORÇA MÁXIMA usando WebCodecs + mp4-muxer.
   * Não depende de playback em tempo real: acelera via hardware GPU, sem quedas de frames,
   * com áudio cristalino AAC e arquivo MP4 100% compatível (Fast Start + Seekbar no Windows Media Player).
   */
  static async processVideoWithWebCodecs(
    file: File,
    adj: VideoAdjustment,
    template: TemplateVisual,
    onProgress?: ProcessProgressCallback,
    abortSignal?: AbortSignal,
  ): Promise<Blob> {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    const videoUrl = URL.createObjectURL(file);
    video.src = videoUrl;

    // Conecta invisível no DOM para acelerar canais Direct3D / NVDEC
    video.style.position = "fixed";
    video.style.top = "-9999px";
    video.style.left = "-9999px";
    video.style.width = "16px";
    video.style.height = "16px";
    video.style.opacity = "0.001";
    video.style.pointerEvents = "none";
    document.body.appendChild(video);

    try {
      await new Promise<void>((resolve, reject) => {
        if (video.readyState >= 1) return resolve();
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("Erro ao carregar os metadados do vídeo."));
      });

      // 1. Extração instantânea e decodificação do áudio em memória
      let audioBuffer: AudioBuffer | null = null;
      if (adj.keepAudio) {
        try {
          const AudioContextClass =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const audioCtx = new AudioContextClass();
          const arrayBuf = await file.arrayBuffer();
          audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
          await audioCtx.close().catch(() => {});
        } catch (err) {
          console.warn("Áudio não decodificável ou vídeo silencioso:", err);
          audioBuffer = null;
        }
      }

      const duration = (video.duration && isFinite(video.duration) && video.duration > 0)
        ? video.duration
        : (audioBuffer?.duration || 1);

      const vWidth = video.videoWidth || 1080;
      const is720p = vWidth <= 720;
      const CANVAS_WIDTH = is720p ? 720 : 1080;
      const CANVAS_HEIGHT = is720p ? 1280 : 1920;

      const originalBitrate = duration > 0 ? Math.round((file.size * 8) / duration) : 1_800_000;
      const audioBitrate = audioBuffer ? 128_000 : 0;
      const targetVideoBitrate = Math.max(
        750_000,
        Math.min(Math.round(originalBitrate - audioBitrate), 4_000_000)
      );

      const canvas = document.createElement("canvas");
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;
      const ctx = canvas.getContext("2d", {
        alpha: false,
        desynchronized: true,
        willReadFrequently: false,
      });
      if (!ctx) throw new Error("Contexto Canvas 2D indisponível.");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // Pré-carrega imagens do template
      let profileImg: HTMLImageElement | null = null;
      if (template.profilePic.enabled && template.profilePic.imageUrl) {
        profileImg = new Image();
        profileImg.crossOrigin = "anonymous";
        profileImg.src = template.profilePic.imageUrl;
      }
      let watermarkImg: HTMLImageElement | null = null;
      if (
        template.watermark.enabled &&
        template.watermark.type === "image" &&
        template.watermark.imageUrl
      ) {
        watermarkImg = new Image();
        watermarkImg.crossOrigin = "anonymous";
        watermarkImg.src = template.watermark.imageUrl;
      }

      // 2. Verifica suporte de codec de áudio AAC
      let aacSupported = false;
      let audioChannels = 0;
      let audioSampleRate = 44100;

      if (audioBuffer) {
        audioChannels = Math.min(2, audioBuffer.numberOfChannels);
        audioSampleRate = audioBuffer.sampleRate;
        try {
          const aacCheck = await AudioEncoder.isConfigSupported({
            codec: "mp4a.40.2",
            numberOfChannels: audioChannels,
            sampleRate: audioSampleRate,
            bitrate: 128_000,
          });
          aacSupported = !!aacCheck.supported;
        } catch (_) {
          aacSupported = false;
        }
      }

      // 3. Inicializa Muxer MP4 com Fast Start e índice de Seeking (stss)
      const target = new ArrayBufferTarget();
      const muxerConfig: any = {
        target,
        video: {
          codec: "avc",
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          frameRate: 30,
        },
        fastStart: "in-memory",
        firstTimestampBehavior: "strict",
      };

      if (aacSupported && audioBuffer) {
        muxerConfig.audio = {
          codec: "aac",
          numberOfChannels: audioChannels,
          sampleRate: audioSampleRate,
        };
      }

      const muxer = new Muxer(muxerConfig);

      let encoderError: Error | null = null;
      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => {
          encoderError = e instanceof Error ? e : new Error(String(e));
        },
      });

      // Seleciona melhor profile H.264
      let selectedCodec = "avc1.42001f";
      const codecCandidates = ["avc1.4d002a", "avc1.42001f", "avc1.42E01E", "avc1.64002a"];
      for (const cand of codecCandidates) {
        try {
          const res = await VideoEncoder.isConfigSupported({
            codec: cand,
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            bitrate: targetVideoBitrate,
            framerate: 30,
          });
          if (res.supported) {
            selectedCodec = cand;
            break;
          }
        } catch (_) {}
      }

      videoEncoder.configure({
        codec: selectedCodec,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        bitrate: targetVideoBitrate,
        framerate: 30,
        avc: { format: "avc" },
      });

      // 4. Codifica toda a trilha de áudio AAC de forma ultrarrápida (~100ms)
      if (aacSupported && audioBuffer) {
        const audioEncoder = new AudioEncoder({
          output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
          error: (e) => console.warn("Aviso no AudioEncoder:", e),
        });

        audioEncoder.configure({
          codec: "mp4a.40.2",
          numberOfChannels: audioChannels,
          sampleRate: audioSampleRate,
          bitrate: 128_000,
        });

        const totalSamples = audioBuffer.length;
        const aacFrameSize = 1024; // Amostras por frame padrão do AAC

        for (let offset = 0; offset < totalSamples; offset += aacFrameSize) {
          const currentFrames = Math.min(aacFrameSize, totalSamples - offset);
          const planar = new Float32Array(currentFrames * audioChannels);

          for (let ch = 0; ch < audioChannels; ch++) {
            const channelData = audioBuffer.getChannelData(ch);
            planar.set(channelData.subarray(offset, offset + currentFrames), ch * currentFrames);
          }

          const audioChunk = new AudioData({
            format: "f32-planar",
            sampleRate: audioSampleRate,
            numberOfFrames: currentFrames,
            numberOfChannels: audioChannels,
            timestamp: Math.round((offset / audioSampleRate) * 1_000_000), // microsegundos
            data: planar,
          });

          audioEncoder.encode(audioChunk);
          audioChunk.close();
        }

        await audioEncoder.flush();
        audioEncoder.close();
      }

      // 5. Renderização quadro a quadro em alta velocidade via streaming contínuo da GPU
      const targetFps = 30;
      const frameDurationMicros = Math.round(1_000_000 / targetFps);
      const totalFrames = Math.max(1, Math.round(duration * targetFps));

      if (typeof (video as any).requestVideoFrameCallback === "function") {
        let frameCount = 0;
        await new Promise<void>((resolve, reject) => {
          let finished = false;
          const onFrame = (now: DOMHighResTimeStamp, meta: VideoFrameCallbackMetadata) => {
            if (finished) return;
            if (abortSignal?.aborted) {
              finished = true;
              video.pause();
              return reject(new Error("Processamento cancelado pelo usuário."));
            }
            if (encoderError) {
              finished = true;
              video.pause();
              return reject(encoderError);
            }

            VideoProcessor.renderFrame(
              ctx,
              video,
              adj,
              template,
              CANVAS_WIDTH,
              CANVAS_HEIGHT,
              profileImg,
              watermarkImg,
            );

            const timestampMicros = Math.round(meta.mediaTime * 1_000_000);
            const isKeyFrame = frameCount % (targetFps * 2) === 0;

            const vFrame = new VideoFrame(canvas, {
              timestamp: timestampMicros,
              duration: frameDurationMicros,
            });

            videoEncoder.encode(vFrame, { keyFrame: isKeyFrame });
            vFrame.close();
            frameCount++;

            if (onProgress && totalFrames > 0) {
              const pct = Math.min(99, Math.round((meta.mediaTime / duration) * 100));
              onProgress(pct, `Renderizando GPU: ${pct}%`);
            }

            if (video.ended || meta.mediaTime >= duration - 0.05) {
              finished = true;
              video.pause();
              return resolve();
            }

            video.requestVideoFrameCallback(onFrame);
          };

          video.onended = () => {
            if (!finished) {
              finished = true;
              resolve();
            }
          };

          video.playbackRate = 2.0;
          video.requestVideoFrameCallback(onFrame);
          video.play().catch(reject);
        });
      } else {
        for (let i = 0; i < totalFrames; i++) {
          if (abortSignal?.aborted) throw new Error("Processamento cancelado pelo usuário.");
          if (encoderError) throw encoderError;

          const targetTime = Math.min(duration, i / targetFps);
          video.currentTime = targetTime;
          await new Promise((r) => setTimeout(r, 10));

          VideoProcessor.renderFrame(
            ctx,
            video,
            adj,
            template,
            CANVAS_WIDTH,
            CANVAS_HEIGHT,
            profileImg,
            watermarkImg,
          );

          const vFrame = new VideoFrame(canvas, {
            timestamp: Math.round(i * frameDurationMicros),
            duration: frameDurationMicros,
          });
          videoEncoder.encode(vFrame, { keyFrame: i % (targetFps * 2) === 0 });
          vFrame.close();
        }
      }

      await videoEncoder.flush();
      videoEncoder.close();
      muxer.finalize();

      const buffer = target.buffer;
      return new Blob([buffer], { type: "video/mp4" });
    } finally {
      URL.revokeObjectURL(videoUrl);
      if (video.parentNode) {
        video.parentNode.removeChild(video);
      }
    }
  }

  /**
   * Fallback robusto usando MediaRecorder caso WebCodecs não esteja disponível.
   */
  static async processVideoWithMediaRecorder(
    file: File,
    adj: VideoAdjustment,
    template: TemplateVisual,
    onProgress?: ProcessProgressCallback,
    abortSignal?: AbortSignal,
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = !adj.keepAudio;
      video.playsInline = true;

      const videoUrl = URL.createObjectURL(file);
      video.src = videoUrl;

      let CANVAS_WIDTH = 1080;
      let CANVAS_HEIGHT = 1920;

      const canvas = document.createElement("canvas");
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;

      const ctx = canvas.getContext("2d", {
        alpha: false,
        desynchronized: true,
        willReadFrequently: false,
      });

      if (!ctx) {
        URL.revokeObjectURL(videoUrl);
        return reject(new Error("Falha ao inicializar contexto Canvas."));
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      video.style.position = "fixed";
      video.style.bottom = "0";
      video.style.right = "0";
      video.style.width = "320px";
      video.style.height = "180px";
      video.style.opacity = "0.01";
      video.style.pointerEvents = "none";
      video.style.zIndex = "-99999";
      document.body.appendChild(video);

      canvas.style.position = "fixed";
      canvas.style.bottom = "0";
      canvas.style.left = "0";
      canvas.style.width = "1px";
      canvas.style.height = "1px";
      canvas.style.opacity = "0.01";
      canvas.style.pointerEvents = "none";
      canvas.style.zIndex = "-99999";
      document.body.appendChild(canvas);

      let profileImg: HTMLImageElement | null = null;
      if (template.profilePic.enabled && template.profilePic.imageUrl) {
        profileImg = new Image();
        profileImg.crossOrigin = "anonymous";
        profileImg.src = template.profilePic.imageUrl;
      }

      let watermarkImg: HTMLImageElement | null = null;
      if (
        template.watermark.enabled &&
        template.watermark.type === "image" &&
        template.watermark.imageUrl
      ) {
        watermarkImg = new Image();
        watermarkImg.crossOrigin = "anonymous";
        watermarkImg.src = template.watermark.imageUrl;
      }

      let mediaRecorder: MediaRecorder | null = null;
      const chunks: Blob[] = [];
      let animationFrameId: number | null = null;
      let safetyInterval: any = null;
      let audioCtx: AudioContext | null = null;
      let isFinished = false;

      const cleanup = () => {
        if (safetyInterval) {
          clearInterval(safetyInterval);
          safetyInterval = null;
        }
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        video.pause();
        video.removeAttribute("src");
        video.load();
        URL.revokeObjectURL(videoUrl);
        if (video.parentNode) {
          video.parentNode.removeChild(video);
        }
        if (canvas.parentNode) {
          canvas.parentNode.removeChild(canvas);
        }
        if (audioCtx && audioCtx.state !== "closed") {
          audioCtx.close().catch(() => {});
        }
      };

      if (abortSignal) {
        abortSignal.addEventListener("abort", () => {
          if (mediaRecorder && mediaRecorder.state !== "inactive") {
            try {
              mediaRecorder.stop();
            } catch (_) {}
          }
          cleanup();
          reject(new Error("Processamento cancelado pelo usuário."));
        });
      }

      video.onloadedmetadata = async () => {
        try {
          const duration = video.duration || 1;
          const vWidth = video.videoWidth || 1080;

          const is720p = vWidth <= 720;
          CANVAS_WIDTH = is720p ? 720 : 1080;
          CANVAS_HEIGHT = is720p ? 1280 : 1920;

          canvas.width = CANVAS_WIDTH;
          canvas.height = CANVAS_HEIGHT;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";

          video.playbackRate = adj.speed || 1;

          const canvasStream = canvas.captureStream(30);

          if (adj.keepAudio) {
            try {
              const AudioContextClass =
                window.AudioContext ||
                (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
              audioCtx = new AudioContextClass();
              if (audioCtx.state === "suspended") {
                await audioCtx.resume();
              }
              const source = audioCtx.createMediaElementSource(video);
              const dest = audioCtx.createMediaStreamDestination();
              source.connect(dest);
              const audioTrack = dest.stream.getAudioTracks()[0];
              if (audioTrack) {
                canvasStream.addTrack(audioTrack);
              }
            } catch (err) {
              console.warn("Áudio não pôde ser roteado via Web Audio:", err);
            }
          }

          const preferredMimes = [
            'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
            'video/mp4;codecs=avc1',
            'video/mp4;codecs=h264',
            "video/mp4",
            'video/webm;codecs="h264,opus"',
            'video/webm;codecs=h264',
            'video/webm;codecs="vp9,opus"',
            'video/webm;codecs=vp9',
            'video/webm;codecs="vp8,opus"',
            "video/webm",
          ];

          let selectedMime = "video/webm";
          for (const candidate of preferredMimes) {
            if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidate)) {
              selectedMime = candidate;
              break;
            }
          }

          const originalBitrate = duration > 0 ? Math.round((file.size * 8) / duration) : 1_800_000;
          const audioBitrate = adj.keepAudio ? 128_000 : 0;
          const targetVideoBitrate = Math.max(
            750_000,
            Math.min(Math.round(originalBitrate - audioBitrate), 4_000_000)
          );

          try {
            const recorderOptions: MediaRecorderOptions = {
              mimeType: selectedMime,
              videoBitsPerSecond: targetVideoBitrate,
            };
            if (adj.keepAudio) {
              recorderOptions.audioBitsPerSecond = 128_000;
            }
            mediaRecorder = new MediaRecorder(canvasStream, recorderOptions);
          } catch (e) {
            try {
              mediaRecorder = new MediaRecorder(canvasStream, {
                mimeType: selectedMime,
                videoBitsPerSecond: targetVideoBitrate,
              });
            } catch (e2) {
              mediaRecorder = new MediaRecorder(canvasStream);
            }
          }

          mediaRecorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) {
              chunks.push(ev.data);
            }
          };

          mediaRecorder.onstop = async () => {
            cleanup();
            const isMp4 = selectedMime.toLowerCase().includes("mp4");
            const rawBlob = new Blob(chunks, { type: isMp4 ? "video/mp4" : "video/webm" });
            try {
              const arrayBuf = await rawBlob.arrayBuffer();
              const patchedBuf = isMp4
                ? patchMp4Duration(arrayBuf, duration)
                : patchWebmDuration(arrayBuf, duration);
              resolve(new Blob([patchedBuf], { type: isMp4 ? "video/mp4" : "video/webm" }));
            } catch (_) {
              resolve(rawBlob);
            }
          };

          mediaRecorder.onerror = (err) => {
            cleanup();
            reject(err);
          };

          const finishProcessing = () => {
            if (isFinished) return;
            isFinished = true;
            if (safetyInterval) clearInterval(safetyInterval);
            if (animationFrameId) {
              cancelAnimationFrame(animationFrameId);
              animationFrameId = null;
            }

            if (onProgress) onProgress(100, "Concluído");

            if (mediaRecorder && mediaRecorder.state === "recording") {
              try {
                mediaRecorder.requestData();
                mediaRecorder.stop();
              } catch (_) {
                cleanup();
                const isMp4 = selectedMime.toLowerCase().includes("mp4");
                resolve(new Blob(chunks, { type: isMp4 ? "video/mp4" : "video/webm" }));
              }
            } else {
              cleanup();
              const isMp4 = selectedMime.toLowerCase().includes("mp4");
              resolve(new Blob(chunks, { type: isMp4 ? "video/mp4" : "video/webm" }));
            }
          };

          video.onended = () => finishProcessing();
          video.ontimeupdate = () => {
            if (duration > 0 && video.currentTime >= duration - 0.2) {
              finishProcessing();
            }
          };
          video.onpause = () => {
            if (duration > 0 && video.currentTime >= duration - 0.3) {
              finishProcessing();
            }
          };

          safetyInterval = setInterval(() => {
            if (isFinished) {
              clearInterval(safetyInterval);
              return;
            }
            if (
              video.ended ||
              (duration > 0 && video.currentTime >= duration - 0.2) ||
              (video.paused && duration > 0 && video.currentTime >= duration * 0.95)
            ) {
              clearInterval(safetyInterval);
              finishProcessing();
            }
          }, 150);

          mediaRecorder.start(250);

          try {
            await video.play();
          } catch (playErr) {
            video.muted = true;
            await video.play();
          }

          let isProcessing = false;

          const renderLoop = () => {
            if (isFinished) return;

            if (
              video.ended ||
              (duration > 0 && video.currentTime >= duration - 0.15) ||
              (video.paused && duration > 0 && video.currentTime >= duration * 0.95)
            ) {
              finishProcessing();
              return;
            }

            if (!isProcessing) {
              isProcessing = true;
              try {
                VideoProcessor.renderFrame(
                  ctx,
                  video,
                  adj,
                  template,
                  CANVAS_WIDTH,
                  CANVAS_HEIGHT,
                  profileImg,
                  watermarkImg,
                );

                if (duration > 0 && onProgress) {
                  const currentPct = Math.min(99, Math.round((video.currentTime / duration) * 100));
                  onProgress(
                    currentPct,
                    `Renderizando frame (${Math.round(video.currentTime)}s/${Math.round(duration)}s)`,
                  );
                }
              } catch (renderErr) {
                console.error("Erro ao renderizar frame:", renderErr);
              } finally {
                isProcessing = false;
              }
            }

            animationFrameId = requestAnimationFrame(renderLoop);
          };

          animationFrameId = requestAnimationFrame(renderLoop);
        } catch (setupErr) {
          cleanup();
          reject(setupErr);
        }
      };

      video.onerror = () => {
        cleanup();
        reject(new Error("Erro ao carregar os frames do vídeo."));
      };
    });
  }

  /**
   * Processador Universal de Vídeo:
   * 1. Executa prioritariamente via NVIDIA NVENC (RTX 3090) na máquina local (~2 a 3 segundos).
   * 2. Fallback para WebCodecs por Hardware GPU no navegador.
   * 3. Fallback para MediaRecorder se codecs avançados não estiverem presentes.
   */
  static async processVideo(
    file: File,
    adj: VideoAdjustment,
    template: TemplateVisual,
    onProgress?: ProcessProgressCallback,
    abortSignal?: AbortSignal,
  ): Promise<Blob> {
    // 1. Prioridade Máxima: NVIDIA NVENC local na RTX 3090
    try {
      const hasNvenc = await VideoProcessor.isNativeNvencAvailable();
      if (hasNvenc) {
        return await VideoProcessor.processVideoWithNativeNvenc(
          file,
          adj,
          template,
          onProgress,
          abortSignal,
        );
      }
    } catch (nvencErr: any) {
      if (abortSignal?.aborted) throw nvencErr;
      console.warn("Motor nativo NVENC indisponível, chaveando para WebCodecs:", nvencErr);
    }

    // 2. Prioridade Secundária: WebCodecs acelerado por GPU
    if (VideoProcessor.isWebCodecsSupported()) {
      try {
        return await VideoProcessor.processVideoWithWebCodecs(
          file,
          adj,
          template,
          onProgress,
          abortSignal,
        );
      } catch (webcodecsErr: any) {
        if (abortSignal?.aborted) {
          throw webcodecsErr;
        }
        console.warn("Falha no WebCodecs, alternando para MediaRecorder:", webcodecsErr);
      }
    }

    return VideoProcessor.processVideoWithMediaRecorder(
      file,
      adj,
      template,
      onProgress,
      abortSignal,
    );
  }

  /**
   * Converte a seleção de filtro para regra CSS de Canvas.
   */
  static getCanvasFilter(filter: string, intensity: number): string {
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
   * Desenha os elementos configuráveis do template visual sobre o Canvas.
   */
  /**
   * 1. Foto de perfil do template
   */
  static drawProfilePic(
    ctx: CanvasRenderingContext2D,
    template: TemplateVisual,
    width: number,
    height: number,
    profileImg: HTMLImageElement | null,
  ) {
    if (template.profilePic.enabled && profileImg && profileImg.complete) {
      const pSize = (template.profilePic.size / 720) * width;
      const px = (template.profilePic.x / 100) * width;
      const py = (template.profilePic.y / 100) * height;
      const zoom = Math.max(0.5, Math.min(3, (template.profilePic.zoom ?? 100) / 100));

      ctx.save();
      ctx.beginPath();
      if (template.profilePic.circular) {
        ctx.arc(px, py, pSize / 2, 0, Math.PI * 2);
      } else {
        const radius = Math.min(16 * (width / 720), pSize * 0.18);
        if (ctx.roundRect) {
          ctx.roundRect(px - pSize / 2, py - pSize / 2, pSize, pSize, radius);
        } else {
          ctx.rect(px - pSize / 2, py - pSize / 2, pSize, pSize);
        }
      }
      ctx.closePath();
      ctx.clip();

      // Recorte com proporção preservada (aspect-ratio cover) para nunca achatar a foto
      const nw = profileImg.naturalWidth || profileImg.width || 1;
      const nh = profileImg.naturalHeight || profileImg.height || 1;
      const aspect = nw / nh;
      let sw = nw;
      let sh = nh;
      let sx = 0;
      let sy = 0;

      if (aspect > 1) {
        // Imagem mais larga que alta: recorta laterais
        sw = nh;
        sx = (nw - sw) / 2;
      } else {
        // Imagem mais alta que larga: recorta topo/base
        sh = nw;
        sy = (nh - sh) / 2;
      }

      // Aplicação da aproximação / zoom interno configurado pelo usuário
      if (zoom !== 1) {
        const scaledSw = sw / zoom;
        const scaledSh = sh / zoom;
        sx += (sw - scaledSw) / 2;
        sy += (sh - scaledSh) / 2;
        sw = scaledSw;
        sh = scaledSh;
      }

      ctx.drawImage(profileImg, sx, sy, sw, sh, px - pSize / 2, py - pSize / 2, pSize, pSize);
      ctx.restore();

      // Desenho da borda configurada
      if (template.profilePic.borderEnabled) {
        ctx.save();
        ctx.beginPath();
        if (template.profilePic.circular) {
          ctx.arc(px, py, pSize / 2, 0, Math.PI * 2);
        } else {
          const radius = Math.min(16 * (width / 720), pSize * 0.18);
          if (ctx.roundRect) {
            ctx.roundRect(px - pSize / 2, py - pSize / 2, pSize, pSize, radius);
          } else {
            ctx.rect(px - pSize / 2, py - pSize / 2, pSize, pSize);
          }
        }
        ctx.lineWidth = (template.profilePic.borderWidth || 2) * (width / 720);
        ctx.strokeStyle = template.profilePic.borderColor || "#ffffff";
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  /**
   * 2. Nome da Página e Selo de Verificação
   */
  static drawPageNameAndBadge(
    ctx: CanvasRenderingContext2D,
    template: TemplateVisual,
    width: number,
    height: number,
  ) {
    if (template.pageName.enabled && template.pageName.text) {
      const fontSize = Math.round((template.pageName.fontSize / 720) * width);
      const weight =
        template.pageName.fontWeight === "bold"
          ? "700"
          : template.pageName.fontWeight === "600"
            ? "600"
            : "400";
      const nx = (template.pageName.x / 100) * width;
      const ny = (template.pageName.y / 100) * height;

      ctx.save();
      const pageFont = template.pageName.fontFamily || '"Outfit", sans-serif';
      ctx.font = `${weight} ${fontSize}px ${pageFont}`;
      ctx.fillStyle = template.pageName.color;
      ctx.textAlign = template.pageName.align;
      ctx.textBaseline = "middle";

      ctx.shadowColor = "rgba(0,0,0,0.75)";
      ctx.shadowBlur = 8;
      ctx.fillText(template.pageName.text, nx, ny);

      const nameMetrics = ctx.measureText(template.pageName.text);
      ctx.restore();

      // Selo de Verificação
      if (template.badge.enabled) {
        const badgeSize = Math.round((template.badge.size / 720) * width);
        let bx =
          nx + (template.pageName.align === "left" ? nameMetrics.width + 10 : 0);
        if (template.pageName.align === "center") {
          bx = nx + nameMetrics.width / 2 + 10;
        }

        ctx.save();
        ctx.fillStyle = "#0ea5e9";
        ctx.beginPath();
        ctx.arc(bx + badgeSize / 2, ny, badgeSize / 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2 * (width / 720);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(bx + badgeSize * 0.3, ny);
        ctx.lineTo(bx + badgeSize * 0.45, ny + badgeSize * 0.18);
        ctx.lineTo(bx + badgeSize * 0.72, ny - badgeSize * 0.18);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  /**
   * 3. Headline (Título Principal)
   */
  static drawHeadline(
    ctx: CanvasRenderingContext2D,
    template: TemplateVisual,
    width: number,
    height: number,
  ) {
    if (template.headline.enabled && template.headline.text) {
      const fontSize = Math.round((template.headline.fontSize / 720) * width);
      const weight = template.headline.fontWeight === "bold" ? "700" : "600";
      const hx = (template.headline.x / 100) * width;
      const hy = (template.headline.y / 100) * height;
      const maxW = (template.headline.maxWidth / 100) * width;

      ctx.save();
      const headlineFont = template.headline.fontFamily || '"Outfit", sans-serif';
      ctx.font = `${weight} ${fontSize}px ${headlineFont}`;
      ctx.fillStyle = template.headline.color;
      ctx.textAlign = template.headline.align;
      ctx.shadowColor = "rgba(0,0,0,0.85)";
      ctx.shadowBlur = 10;

      VideoProcessor.wrapAndDrawText(
        ctx,
        template.headline.text,
        hx,
        hy,
        maxW,
        fontSize * 1.25,
      );
      ctx.restore();
    }
  }

  /**
   * 4. Sub-headline
   */
  static drawSubHeadline(
    ctx: CanvasRenderingContext2D,
    template: TemplateVisual,
    width: number,
    height: number,
  ) {
    if (template.subHeadline.enabled && template.subHeadline.text) {
      const fontSize = Math.round((template.subHeadline.fontSize / 720) * width);
      const weight = template.subHeadline.fontWeight === "bold" ? "700" : "400";
      const sx = (template.subHeadline.x / 100) * width;
      const sy = (template.subHeadline.y / 100) * height;
      const maxW = (template.subHeadline.maxWidth / 100) * width;

      ctx.save();
      const subFont = template.subHeadline.fontFamily || '"Outfit", sans-serif';
      ctx.font = `${weight} ${fontSize}px ${subFont}`;
      ctx.fillStyle = template.subHeadline.color;
      ctx.textAlign = template.subHeadline.align;
      ctx.shadowColor = "rgba(0,0,0,0.85)";
      ctx.shadowBlur = 8;

      VideoProcessor.wrapAndDrawText(
        ctx,
        template.subHeadline.text,
        sx,
        sy,
        maxW,
        fontSize * 1.25,
      );
      ctx.restore();
    }
  }

  /**
   * 5. Marca d'água / Rodapé
   */
  static drawWatermark(
    ctx: CanvasRenderingContext2D,
    template: TemplateVisual,
    width: number,
    height: number,
    watermarkImg: HTMLImageElement | null,
  ) {
    if (template.watermark.enabled) {
      const wx = (template.watermark.x / 100) * width;
      const wy = (template.watermark.y / 100) * height;
      const opacity = template.watermark.opacity / 100;

      ctx.save();
      ctx.globalAlpha = opacity;

      if (
        template.watermark.type === "image" &&
        watermarkImg &&
        watermarkImg.complete
      ) {
        const wmSize = (64 / 720) * width;
        ctx.drawImage(
          watermarkImg,
          wx - wmSize / 2,
          wy - wmSize / 2,
          wmSize,
          wmSize,
        );
      } else if (template.watermark.text) {
        const fontSize = Math.round((template.watermark.fontSize / 720) * width);
        const wmFont = template.watermark.fontFamily || '"Outfit", sans-serif';
        ctx.font = `600 ${fontSize}px ${wmFont}`;
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 6;
        ctx.fillText(template.watermark.text, wx, wy);
      }

      ctx.restore();
    }
  }

  /**
   * Desenha todos os elementos configuráveis do template visual sobre o Canvas.
   */
  static drawTemplateOnCanvas(
    ctx: CanvasRenderingContext2D,
    template: TemplateVisual,
    width: number,
    height: number,
    profileImg: HTMLImageElement | null,
    watermarkImg: HTMLImageElement | null,
  ) {
    VideoProcessor.drawProfilePic(ctx, template, width, height, profileImg);
    VideoProcessor.drawPageNameAndBadge(ctx, template, width, height);
    VideoProcessor.drawHeadline(ctx, template, width, height);
    VideoProcessor.drawSubHeadline(ctx, template, width, height);
    VideoProcessor.drawWatermark(ctx, template, width, height, watermarkImg);
  }

  /**
   * Quebra linhas de texto automaticamente se ultrapassar a largura máxima.
   */
  static wrapAndDrawText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
  ) {
    const words = text.split(" ");
    let line = "";
    let curY = y;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, curY);
        line = words[n] + " ";
        curY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, curY);
  }

  /**
   * DETECÇÃO DE BORDAS E RECORTE AUTOMÁTICO EXCLUSIVO DA CAMADA DE VÍDEO
   * Analisa estritamente os pixels do próprio vídeo original, NUNCA o canvas composto ou template.
   */
  static detectVideoMargins(video: HTMLVideoElement): {
    cropTop: number;
    cropBottom: number;
    cropLeft: number;
    cropRight: number;
  } {
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      return { cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0 };
    }

    const origW = video.videoWidth;
    const origH = video.videoHeight;
    const aspect = origW / origH;

    // Amostra apenas o frame do vídeo nativo em canvas isolado
    const sw = 160;
    const sh = Math.max(10, Math.round(160 * (origH / origW)));
    const offscreen = document.createElement("canvas");
    offscreen.width = sw;
    offscreen.height = sh;
    const ctx = offscreen.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0 };

    ctx.drawImage(video, 0, 0, sw, sh);
    const data = ctx.getImageData(0, 0, sw, sh).data;

    // 0. Amostra a região central (30% a 70% em X e Y) para testar se o frame atual é preto (ex: fade-in inicial)
    let centerLumaSum = 0;
    let centerCount = 0;
    const cy1 = Math.floor(sh * 0.3);
    const cy2 = Math.floor(sh * 0.7);
    const cx1 = Math.floor(sw * 0.3);
    const cx2 = Math.floor(sw * 0.7);

    for (let y = cy1; y < cy2; y++) {
      for (let x = cx1; x < cx2; x += 2) {
        const idx = (y * sw + x) * 4;
        const luma =
          (data[idx] ?? 0) * 0.299 +
          (data[idx + 1] ?? 0) * 0.587 +
          (data[idx + 2] ?? 0) * 0.114;
        centerLumaSum += luma;
        centerCount++;
      }
    }
    const centerAvgLuma = centerCount > 0 ? centerLumaSum / centerCount : 0;

    // Se o centro do frame for preto/muito escuro (< 16), o vídeo está em transição de preto.
    // NUNCA fazer crop cego nas bordas que colapsaria o vídeo!
    if (centerAvgLuma < 16) {
      // Se for formato 16:9 tradicional contendo filme cinemascope (2.39:1), aplica recorte seguro de 13%
      if (Math.abs(aspect - 16 / 9) < 0.1) {
        return { cropTop: 13, cropBottom: 13, cropLeft: 0, cropRight: 0 };
      }
      return { cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0 };
    }

    const isBlackPixel = (r: number, g: number, b: number) => {
      return r * 0.299 + g * 0.587 + b * 0.114 < 32;
    };

    // 1. Detecta topo da mídia original (com teto máximo de segurança de 28%)
    const maxTopScan = Math.floor(sh * 0.28);
    let topBar = 0;
    for (let y = 0; y < maxTopScan; y++) {
      let blackCount = 0;
      let totalRow = 0;
      for (let x = 8; x < sw - 8; x += 3) {
        const idx = (y * sw + x) * 4;
        if (isBlackPixel(data[idx] ?? 0, data[idx + 1] ?? 0, data[idx + 2] ?? 0)) {
          blackCount++;
        }
        totalRow++;
      }
      if (totalRow > 0 && blackCount / totalRow > 0.90) {
        topBar = y + 1;
      } else {
        break;
      }
    }

    // 2. Detecta base da mídia original (com teto máximo de segurança de 28%)
    const maxBottomScan = Math.floor(sh * 0.72);
    let bottomBar = 0;
    for (let y = sh - 1; y >= maxBottomScan; y--) {
      let blackCount = 0;
      let totalRow = 0;
      for (let x = 8; x < sw - 8; x += 3) {
        const idx = (y * sw + x) * 4;
        if (isBlackPixel(data[idx] ?? 0, data[idx + 1] ?? 0, data[idx + 2] ?? 0)) {
          blackCount++;
        }
        totalRow++;
      }
      if (totalRow > 0 && blackCount / totalRow > 0.90) {
        bottomBar = sh - y;
      } else {
        break;
      }
    }

    // 3. Detecta lateral esquerda da mídia original
    const maxLeftScan = Math.floor(sw * 0.28);
    let leftBar = 0;
    for (let x = 0; x < maxLeftScan; x++) {
      let blackCount = 0;
      let totalCol = 0;
      for (let y = 8; y < sh - 8; y += 3) {
        const idx = (y * sw + x) * 4;
        if (isBlackPixel(data[idx] ?? 0, data[idx + 1] ?? 0, data[idx + 2] ?? 0)) {
          blackCount++;
        }
        totalCol++;
      }
      if (totalCol > 0 && blackCount / totalCol > 0.90) {
        leftBar = x + 1;
      } else {
        break;
      }
    }

    // 4. Detecta lateral direita da mídia original
    const maxRightScan = Math.floor(sw * 0.72);
    let rightBar = 0;
    for (let x = sw - 1; x >= maxRightScan; x--) {
      let blackCount = 0;
      let totalCol = 0;
      for (let y = 8; y < sh - 8; y += 3) {
        const idx = (y * sw + x) * 4;
        if (isBlackPixel(data[idx] ?? 0, data[idx + 1] ?? 0, data[idx + 2] ?? 0)) {
          blackCount++;
        }
        totalCol++;
      }
      if (totalCol > 0 && blackCount / totalCol > 0.90) {
        rightBar = sw - x;
      } else {
        break;
      }
    }

    const cTop = Math.round((topBar / sh) * 100);
    const cBottom = Math.round((bottomBar / sh) * 100);
    const cLeft = Math.round((leftBar / sw) * 100);
    const cRight = Math.round((rightBar / sw) * 100);

    let finalTop = cTop > 2 ? Math.min(28, cTop) : 0;
    let finalBottom = cBottom > 2 ? Math.min(28, cBottom) : 0;
    let finalLeft = cLeft > 2 ? Math.min(28, cLeft) : 0;
    let finalRight = cRight > 2 ? Math.min(28, cRight) : 0;

    // Se topo e base forem próximos (diferença <= 3%), equaliza para enquadramento simétrico perfeito
    if (finalTop > 0 && finalBottom > 0 && Math.abs(finalTop - finalBottom) <= 3) {
      const avg = Math.round((finalTop + finalBottom) / 2);
      finalTop = avg;
      finalBottom = avg;
    }
    if (finalLeft > 0 && finalRight > 0 && Math.abs(finalLeft - finalRight) <= 3) {
      const avg = Math.round((finalLeft + finalRight) / 2);
      finalLeft = avg;
      finalRight = avg;
    }

    return {
      cropTop: finalTop,
      cropBottom: finalBottom,
      cropLeft: finalLeft,
      cropRight: finalRight,
    };
  }

  /**
   * DETECÇÃO INTELIGENTE DE FILMAGEM ATIVA (ISOLA O VÍDEO E CORTA TEMPLATE ESTÁTICO)
   *
   * Analisa a variação temporal de movimento, pureza de cores e uniformidade espacial
   * para identificar com precisão milimétrica a área onde existe cena/filmagem real,
   * recortando fora qualquer template estático (fundos brancos, headlines com texto,
   * rodapés brancos/pretos, legendas estáticas de redes sociais, etc.).
   */
  static async detectActiveFootage(video: HTMLVideoElement): Promise<{
    cropTop: number;
    cropBottom: number;
    cropLeft: number;
    cropRight: number;
    detectedType: string;
  }> {
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      return { cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0, detectedType: "none" };
    }

    const origW = video.videoWidth;
    const origH = video.videoHeight;
    const duration = video.duration || 10;
    const initialTime = video.currentTime;

    // Alta resolução vertical de amostragem para máxima precisão na detecção de cortes
    const sw = 240;
    const sh = Math.max(30, Math.round(240 * (origH / origW)));

    // 1. Canvas offscreen para análise de pixels
    const offscreen = document.createElement("canvas");
    offscreen.width = sw;
    offscreen.height = sh;
    const ctx = offscreen.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return { cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0, detectedType: "none" };
    }

    // Captura instantânea do quadro atual
    let fCurrent: Uint8ClampedArray | null = null;
    try {
      ctx.drawImage(video, 0, 0, sw, sh);
      fCurrent = ctx.getImageData(0, 0, sw, sh).data;
    } catch {
      fCurrent = null;
    }

    if (!fCurrent) {
      const fallback = VideoProcessor.detectVideoMargins(video);
      return { ...fallback, detectedType: "static_fallback" };
    }

    // Tenta obter um segundo frame distante para análise temporal caso o vídeo tenha duração suficiente
    let f2: Uint8ClampedArray | null = null;
    if (duration > 1.5) {
      const targetTime = Math.min(Math.max(0.8, duration * 0.50), duration - 0.3);
      if (Math.abs(initialTime - targetTime) > 0.3) {
        f2 = await new Promise((resolve) => {
          let resolved = false;
          const finish = () => {
            if (resolved) return;
            resolved = true;
            video.removeEventListener("seeked", onSeeked);
            try {
              const c2 = document.createElement("canvas");
              c2.width = sw;
              c2.height = sh;
              const ctx2 = c2.getContext("2d", { willReadFrequently: true });
              if (ctx2) {
                ctx2.drawImage(video, 0, 0, sw, sh);
                resolve(ctx2.getImageData(0, 0, sw, sh).data);
                return;
              }
            } catch {}
            resolve(null);
          };

          const onSeeked = () => finish();
          video.addEventListener("seeked", onSeeked);
          video.currentTime = targetTime;
          setTimeout(finish, 450);
        });

        // Restaura a posição original do vídeo
        video.currentTime = initialTime;
      }
    }

    // Helper de acesso seguro a arrays tipados
    const getP = (arr: Uint8ClampedArray, i: number): number => arr[i] ?? 0;

    // Verifica se f2 produziu movimento real comprovado
    let hasValidMotion = false;
    if (f2) {
      let diffSample = 0;
      let count = 0;
      for (let i = 0; i < fCurrent.length; i += 32) {
        diffSample +=
          Math.abs(getP(fCurrent, i) - getP(f2, i)) +
          Math.abs(getP(fCurrent, i + 1) - getP(f2, i + 1)) +
          Math.abs(getP(fCurrent, i + 2) - getP(f2, i + 2));
        count++;
      }
      if (count > 0 && diffSample / count > 6) {
        hasValidMotion = true;
      }
    }

    // 2. Classificação de cada linha do vídeo (0: filmagem real, 1: template estático)
    const rowIsTemplate = new Uint8Array(sh);

    for (let y = 0; y < sh; y++) {
      let whiteCount = 0;
      let blackCount = 0;
      let textDarkCount = 0;
      let lumaSum = 0;
      let lumaSqSum = 0;
      let motionSum = 0;
      let totalPixels = 0;

      for (let x = 4; x < sw - 4; x++) {
        const idx = (y * sw + x) * 4;
        const r = getP(fCurrent, idx);
        const g = getP(fCurrent, idx + 1);
        const b = getP(fCurrent, idx + 2);

        const luma = r * 0.299 + g * 0.587 + b * 0.114;
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const colorDelta = maxC - minC;

        // Fundo branco ou muito claro de template
        if ((luma >= 195 && colorDelta <= 32) || luma >= 235) {
          whiteCount++;
        }
        // Fundo preto ou letterbox
        else if (luma <= 38) {
          blackCount++;
        }

        // Caracteres escuros de texto (headlines / títulos em fundo branco)
        if (luma <= 100 && colorDelta <= 35) {
          textDarkCount++;
        }

        lumaSum += luma;
        lumaSqSum += luma * luma;

        if (hasValidMotion && f2) {
          const m =
            Math.abs(r - getP(f2, idx)) +
            Math.abs(g - getP(f2, idx + 1)) +
            Math.abs(b - getP(f2, idx + 2));
          motionSum += m;
        }

        totalPixels++;
      }

      const wRatio = totalPixels > 0 ? whiteCount / totalPixels : 0;
      const bRatio = totalPixels > 0 ? blackCount / totalPixels : 0;
      const textRatio = totalPixels > 0 ? textDarkCount / totalPixels : 0;
      const meanLuma = totalPixels > 0 ? lumaSum / totalPixels : 128;
      const variance = totalPixels > 0 ? Math.max(0, lumaSqSum / totalPixels - meanLuma * meanLuma) : 0;
      const stdDev = Math.sqrt(variance);
      const rowMotion = totalPixels > 0 && hasValidMotion ? motionSum / totalPixels : 0;

      // CRITÉRIOS DE IDENTIFICAÇÃO DE TEMPLATE (CABEÇALHOS, HEADLINES, BARRAS E RODAPÉS)
      // 1. Barra branca sólida (ex: rodapés brancos do usuário)
      const isWhiteBanner = wRatio >= 0.60 || meanLuma >= 218;

      // 2. Headline com texto sobre fundo branco (ex: "...do abajur que o vizinho deu 🥺")
      const isHeadlineTextOnWhite =
        (wRatio >= 0.35 && textRatio >= 0.04 && (wRatio + textRatio >= 0.65)) ||
        (wRatio >= 0.50 && textRatio >= 0.03);

      // 3. Barra preta sólida (letterbox)
      const isBlackBanner = bRatio >= 0.70 || meanLuma <= 30;

      // 4. Linha de legenda sobre barra preta
      const isCaptionOnBlack =
        bRatio >= 0.45 && wRatio >= 0.04 && (bRatio + wRatio >= 0.65);

      // 5. Fundo uniforme/estático (cinza, bege ou cor sólida de template)
      const isUniformColor = stdDev <= 13 && (!hasValidMotion || rowMotion <= 9);

      // 6. Extremo de brilho estático nas extremidades
      const isStaticExtremity = (!hasValidMotion || rowMotion <= 8) && (meanLuma >= 200 || meanLuma <= 35);

      if (
        isWhiteBanner ||
        isHeadlineTextOnWhite ||
        isBlackBanner ||
        isCaptionOnBlack ||
        isUniformColor ||
        isStaticExtremity
      ) {
        rowIsTemplate[y] = 1;
      } else {
        rowIsTemplate[y] = 0;
      }
    }

    // 3. Determina limite superior (cropTop): varre do topo em direção ao centro
    let topCut = 0;
    const maxTopScan = Math.floor(sh * 0.52);
    let consecutiveFootageCount = 0;

    for (let y = 0; y < maxTopScan; y++) {
      if (rowIsTemplate[y] === 1) {
        topCut = y + 1;
        consecutiveFootageCount = 0;
      } else {
        consecutiveFootageCount++;
        // Exige 4 linhas consecutivas com características comprovadas de cena/filmagem para parar
        if (consecutiveFootageCount >= 4) {
          break;
        }
      }
    }

    // Margem de segurança (over-crop de ~1.5%) para eliminar 100% de anti-aliasing de letras ou linhas brancas residuais
    if (topCut > 0) {
      const safetyPaddingTop = Math.max(2, Math.round(sh * 0.015));
      topCut = Math.min(maxTopScan, topCut + safetyPaddingTop);
    }

    // 4. Determina limite inferior (cropBottom): varre da base em direção ao centro
    let bottomCut = 0;
    const maxBottomScan = Math.floor(sh * 0.52);
    consecutiveFootageCount = 0;

    for (let y = sh - 1; y >= sh - maxBottomScan; y--) {
      if (rowIsTemplate[y] === 1) {
        bottomCut = sh - y;
        consecutiveFootageCount = 0;
      } else {
        consecutiveFootageCount++;
        if (consecutiveFootageCount >= 4) {
          break;
        }
      }
    }

    // Margem de segurança para a base
    if (bottomCut > 0) {
      const safetyPaddingBottom = Math.max(2, Math.round(sh * 0.015));
      bottomCut = Math.min(maxBottomScan, bottomCut + safetyPaddingBottom);
    }

    // 5. Analisa colunas (cropLeft e cropRight) dentro do intervalo vertical seguro da filmagem
    const yStart = Math.min(topCut, sh - 10);
    const yEnd = Math.max(yStart + 5, sh - bottomCut);

    let leftCut = 0;
    const maxLeftScan = Math.floor(sw * 0.40);
    for (let x = 0; x < maxLeftScan; x++) {
      let whiteCount = 0;
      let blackCount = 0;
      let count = 0;
      for (let y = yStart; y < yEnd; y += 2) {
        const idx = (y * sw + x) * 4;
        const r = getP(fCurrent, idx);
        const g = getP(fCurrent, idx + 1);
        const b = getP(fCurrent, idx + 2);
        const luma = r * 0.299 + g * 0.587 + b * 0.114;
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        if ((luma >= 200 && maxC - minC <= 30) || luma >= 235) whiteCount++;
        else if (luma <= 35) blackCount++;
        count++;
      }
      if (count > 0 && (whiteCount / count >= 0.70 || blackCount / count >= 0.75)) {
        leftCut = x + 1;
      } else {
        break;
      }
    }

    let rightCut = 0;
    const maxRightScan = Math.floor(sw * 0.60);
    for (let x = sw - 1; x >= maxRightScan; x--) {
      let whiteCount = 0;
      let blackCount = 0;
      let count = 0;
      for (let y = yStart; y < yEnd; y += 2) {
        const idx = (y * sw + x) * 4;
        const r = getP(fCurrent, idx);
        const g = getP(fCurrent, idx + 1);
        const b = getP(fCurrent, idx + 2);
        const luma = r * 0.299 + g * 0.587 + b * 0.114;
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        if ((luma >= 200 && maxC - minC <= 30) || luma >= 235) whiteCount++;
        else if (luma <= 35) blackCount++;
        count++;
      }
      if (count > 0 && (whiteCount / count >= 0.70 || blackCount / count >= 0.75)) {
        rightCut = sw - x;
      } else {
        break;
      }
    }

    // 6. Converte para porcentagem exata
    let cTop = Math.round((topCut / sh) * 100);
    let cBottom = Math.round((bottomCut / sh) * 100);
    let cLeft = Math.round((leftCut / sw) * 100);
    let cRight = Math.round((rightCut / sw) * 100);

    // Se o corte for insignificante (< 2%), zera para preservar vídeos já limpos
    if (cTop < 2) cTop = 0;
    if (cBottom < 2) cBottom = 0;
    if (cLeft < 2) cLeft = 0;
    if (cRight < 2) cRight = 0;

    // Proteção de integridade: garante que a filmagem útil retenha pelo menos 18% da altura
    if (cTop + cBottom > 82) {
      const scale = 80 / (cTop + cBottom);
      cTop = Math.round(cTop * scale);
      cBottom = Math.round(cBottom * scale);
    }
    if (cLeft + cRight > 70) {
      const scale = 65 / (cLeft + cRight);
      cLeft = Math.round(cLeft * scale);
      cRight = Math.round(cRight * scale);
    }

    // Se for formato simétrico clássico de letterbox (diferença <= 2%), equaliza
    if (cTop > 0 && cBottom > 0 && Math.abs(cTop - cBottom) <= 2) {
      const avg = Math.round((cTop + cBottom) / 2);
      cTop = avg;
      cBottom = avg;
    }

    let detectedType = "active_footage";
    if (cTop > 0 || cBottom > 0) {
      detectedType = "static_template_removed";
    }

    return {
      cropTop: cTop,
      cropBottom: cBottom,
      cropLeft: cLeft,
      cropRight: cRight,
      detectedType,
    };
  }

  /**
   * Executa a detecção de filmagem ativa diretamente a partir de um arquivo File.
   * Permite processar todos os vídeos da fila em segundo plano com decodificação garantida idêntica ao player.
   */
  static async detectActiveFootageFromFile(file: File): Promise<{
    cropTop: number;
    cropBottom: number;
    cropLeft: number;
    cropRight: number;
    detectedType: string;
  }> {
    return new Promise((resolve) => {
      const v = document.createElement("video");
      v.preload = "auto";
      v.muted = true;
      v.playsInline = true;
      // Anexa temporariamente ao DOM fora da visão para inicializar o decodificador de vídeo de hardware
      v.style.position = "fixed";
      v.style.top = "-9999px";
      v.style.left = "-9999px";
      v.style.width = "160px";
      v.style.height = "160px";
      v.style.opacity = "0";
      v.style.pointerEvents = "none";
      document.body.appendChild(v);

      const url = URL.createObjectURL(file);
      v.src = url;

      let finished = false;
      const cleanup = () => {
        if (finished) return;
        finished = true;
        URL.revokeObjectURL(url);
        try {
          v.pause();
          v.removeAttribute("src");
          v.load();
          v.remove();
        } catch {}
      };

      const analyze = async () => {
        try {
          // Inicializa o pipeline de decodificação
          try {
            await v.play();
            v.pause();
          } catch {}

          // Se estiver no início e tiver duração, busca um quadro ativo com imagem real
          if (v.duration > 0.5) {
            v.currentTime = Math.min(0.3, v.duration * 0.15);
            await new Promise((r) => {
              v.addEventListener("seeked", r, { once: true });
              setTimeout(r, 450);
            });
          }

          const res = await VideoProcessor.detectActiveFootage(v);
          cleanup();
          resolve(res);
        } catch (e) {
          console.warn("Erro ao detectar em arquivo de vídeo:", e);
          cleanup();
          resolve({ cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0, detectedType: "error" });
        }
      };

      if (v.readyState >= 2 && v.videoWidth > 0) {
        analyze();
      } else {
        v.onloadeddata = () => {
          if (v.videoWidth > 0) analyze();
        };
        v.oncanplay = () => {
          if (v.videoWidth > 0) analyze();
        };
      }

      v.onerror = () => {
        cleanup();
        resolve({ cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0, detectedType: "error" });
      };

      setTimeout(() => {
        if (!finished) {
          analyze().catch(() => {
            cleanup();
            resolve({ cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0, detectedType: "timeout" });
          });
        }
      }, 6000);
    });
  }

  /**
   * Compacta todos os vídeos processados em um arquivo ZIP padrão.
   * Aplica a nomenclatura padronizada com Lote + número sequencial + data (ex: Lote_01_23_09_2026.mp4).
   */
  static async createZipArchive(files: { name: string; blob: Blob }[]): Promise<Blob> {
    const dateStr = formatBatchDate();
    const zipInputs: ZipFileInput[] = files.map((f, idx) => {
      const isMp4 = f.blob.type.includes("mp4");
      const defaultExt = isMp4 ? ".mp4" : ".webm";
      const padIndex = String(idx + 1).padStart(2, "0");
      // Se o arquivo já tiver o formato Lote_..., mantém; senão cria o formato padrão
      const finalName = f.name && f.name.startsWith("Lote_")
        ? (f.name.endsWith(".mp4") || f.name.endsWith(".webm") ? f.name : `${f.name}${defaultExt}`)
        : `Lote_${padIndex}_${dateStr}${defaultExt}`;
      return {
        name: finalName,
        data: f.blob,
      };
    });

    return createZip(zipInputs);
  }
}
