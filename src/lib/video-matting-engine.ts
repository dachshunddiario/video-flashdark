import type { SelfieSegmentation, Results } from "@mediapipe/selfie_segmentation";
import type {
  BackgroundRemovalSettings,
  ContentBoundingBox,
  ManualMaskStroke,
} from "./types";

export interface MattingFrameResult {
  cutoutCanvas: HTMLCanvasElement;
  maskCanvas: HTMLCanvasElement;
  boundingBox?: ContentBoundingBox | undefined;
}

function loadLocalScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if ((window as any).SelfieSegmentation) return resolve();

    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", (e) => reject(e));
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });
}

export class VideoMattingEngine {
  private static instance: VideoMattingEngine | null = null;
  private segmenter: SelfieSegmentation | null = null;
  private isModelLoaded = false;
  private modelLoadPromise: Promise<void> | null = null;

  // Buffer temporal recorrente para estabilidade temporal e remoção de flickering
  private prevAlphaBuffer: Float32Array | null = null;
  private bufferWidth = 0;
  private bufferHeight = 0;

  // Canvases intermediários reutilizáveis para alta performance (zero garbage collection)
  private rawMaskCanvas: HTMLCanvasElement;
  private rawMaskCtx: CanvasRenderingContext2D;
  private refinedMaskCanvas: HTMLCanvasElement;
  private refinedMaskCtx: CanvasRenderingContext2D;
  private outputCanvas: HTMLCanvasElement;
  private outputCtx: CanvasRenderingContext2D;

  private currentMaskResult: HTMLCanvasElement | null = null;
  private resolveSegmentation: ((res: HTMLCanvasElement) => void) | null = null;

  private constructor() {
    this.rawMaskCanvas = document.createElement("canvas");
    this.rawMaskCtx = this.rawMaskCanvas.getContext("2d", { willReadFrequently: true })!;

    this.refinedMaskCanvas = document.createElement("canvas");
    this.refinedMaskCtx = this.refinedMaskCanvas.getContext("2d", { willReadFrequently: true })!;

    this.outputCanvas = document.createElement("canvas");
    this.outputCtx = this.outputCanvas.getContext("2d", { willReadFrequently: true })!;
  }

  public static getInstance(): VideoMattingEngine {
    if (!VideoMattingEngine.instance) {
      VideoMattingEngine.instance = new VideoMattingEngine();
    }
    return VideoMattingEngine.instance;
  }

  /**
   * Inicializa o modelo de segmentação 100% OFFLINE a partir dos arquivos locais em public/models/selfie_segmentation
   */
  public async loadModel(): Promise<void> {
    if (this.isModelLoaded) return;
    if (this.modelLoadPromise) return this.modelLoadPromise;

    this.modelLoadPromise = new Promise(async (resolve, reject) => {
      try {
        await loadLocalScript("/models/selfie_segmentation/selfie_segmentation.js");

        const SelfieSegmentationClass = (window as any).SelfieSegmentation;
        if (!SelfieSegmentationClass) {
          throw new Error("Não foi possível carregar a classe SelfieSegmentation do script local.");
        }

        const segmenter: SelfieSegmentation = new SelfieSegmentationClass({
          locateFile: (file: string) => {
            // Garante carregamento estritamente local e offline a partir do servidor local
            return `/models/selfie_segmentation/${file}`;
          },
        });

        segmenter.setOptions({
          modelSelection: 1, // 1: Landscape/Portrait de maior precisão para vídeos
          selfieMode: false,
        });

        segmenter.onResults((results: Results) => {
          if (results.segmentationMask) {
            this.currentMaskResult = results.segmentationMask as HTMLCanvasElement;
            if (this.resolveSegmentation) {
              this.resolveSegmentation(this.currentMaskResult);
              this.resolveSegmentation = null;
            }
          }
        });

        // Teste de inicialização rápida
        await segmenter.initialize();
        this.segmenter = segmenter;
        this.isModelLoaded = true;
        resolve();
      } catch (err) {
        console.error("Falha ao inicializar modelo local de matting:", err);
        reject(err);
      }
    });

    return this.modelLoadPromise;
  }

  /**
   * Reseta o histórico temporal (útil ao mudar de vídeo ou reiniciar reprodução)
   */
  public resetTemporalState(): void {
    this.prevAlphaBuffer = null;
    this.bufferWidth = 0;
    this.bufferHeight = 0;
  }

  /**
   * Processa a segmentação de um frame do vídeo com consistência temporal,
   * refinamento morfológico, correção por pincel e recorte opcional.
   */
  public async processFrame(
    sourceVideoOrCanvas: HTMLVideoElement | HTMLCanvasElement,
    settings: BackgroundRemovalSettings,
    targetWidth?: number,
    targetHeight?: number,
  ): Promise<MattingFrameResult> {
    await this.loadModel();

    if (!this.segmenter) {
      throw new Error("Modelo de segmentação não inicializado.");
    }

    const sWidth =
      "videoWidth" in sourceVideoOrCanvas
        ? sourceVideoOrCanvas.videoWidth || 720
        : sourceVideoOrCanvas.width || 720;
    const sHeight =
      "videoHeight" in sourceVideoOrCanvas
        ? sourceVideoOrCanvas.videoHeight || 1280
        : sourceVideoOrCanvas.height || 1280;

    const width = targetWidth || sWidth;
    const height = targetHeight || sHeight;

    // Ajusta dimensões dos canvases
    if (this.rawMaskCanvas.width !== width || this.rawMaskCanvas.height !== height) {
      this.rawMaskCanvas.width = width;
      this.rawMaskCanvas.height = height;
      this.refinedMaskCanvas.width = width;
      this.refinedMaskCanvas.height = height;
      this.outputCanvas.width = width;
      this.outputCanvas.height = height;
    }

    // 1. Envia frame para o modelo de segmentação neural
    const segmentationPromise = new Promise<HTMLCanvasElement>((resolve) => {
      this.resolveSegmentation = resolve;
    });

    await this.segmenter.send({ image: sourceVideoOrCanvas });
    const rawMask = await segmentationPromise;

    // 2. Desenha máscara bruta no canvas intermediário
    this.rawMaskCtx.clearRect(0, 0, width, height);
    this.rawMaskCtx.drawImage(rawMask, 0, 0, width, height);

    // 3. Aplica Consistência Temporal (Filtro Anti-flickering Adaptativo)
    this.applyTemporalSmoothing(width, height, settings.edgeSoftness);

    // 4. Aplica Refinamentos da Máscara (Expansão/Redução, Feather, Opacidade)
    this.applyMaskRefinements(width, height, settings);

    // 5. Aplica Correções Manuais Persistentes (Pintura de Adição/Remoção)
    if (settings.manualStrokes && settings.manualStrokes.length > 0) {
      this.applyManualStrokes(this.refinedMaskCtx, width, height, settings.manualStrokes);
    }

    // 6. Detecta Bounding Box do Conteúdo Real (se habilitado)
    let boundingBox: ContentBoundingBox | undefined;
    if (settings.cropToContent) {
      boundingBox = this.detectContentBoundingBox(width, height, settings.cropMargin);
    }

    // 7. Renderiza o Primeiro Plano com Transparência Real (Alpha Compositing)
    this.outputCtx.clearRect(0, 0, width, height);
    this.outputCtx.save();

    // Desenha o vídeo original mascarado pelo canal alpha refinado
    this.outputCtx.drawImage(this.refinedMaskCanvas, 0, 0);
    this.outputCtx.globalCompositeOperation = "source-in";
    this.outputCtx.drawImage(sourceVideoOrCanvas, 0, 0, width, height);

    this.outputCtx.restore();

    return {
      cutoutCanvas: this.outputCanvas,
      maskCanvas: this.refinedMaskCanvas,
      boundingBox,
    };
  }

  /**
   * Consistência Temporal: Compara com o frame anterior e aplica histerese adaptativa.
   * Elimina completamente o ruído e piscar de bordas em áreas estáticas mantendo a resposta rápida em movimentos.
   */
  private applyTemporalSmoothing(
    width: number,
    height: number,
    edgeSoftness: number,
  ): void {
    const rawImgData = this.rawMaskCtx.getImageData(0, 0, width, height);
    const rawData = rawImgData.data;
    const numPixels = width * height;

    if (!this.prevAlphaBuffer || this.bufferWidth !== width || this.bufferHeight !== height) {
      this.prevAlphaBuffer = new Float32Array(numPixels);
      this.bufferWidth = width;
      this.bufferHeight = height;

      // Inicializa com o primeiro frame
      for (let i = 0; i < numPixels; i++) {
        const alpha = (rawData[i * 4 + 3] ?? 255) / 255;
        this.prevAlphaBuffer[i] = alpha;
      }
      return;
    }

    // Itera pixels aplicando histerese com amortecimento temporal
    for (let i = 0; i < numPixels; i++) {
      const targetAlpha = (rawData[i * 4 + 3] ?? 255) / 255;
      const prevAlpha = this.prevAlphaBuffer[i] ?? targetAlpha;

      // Histerese adaptativa: 75% memória para estabilidade extrema em áreas estáticas
      const alphaDiff = Math.abs(targetAlpha - prevAlpha);
      const temporalWeight = alphaDiff > 0.4 ? 0.35 : 0.72; // se movimento brusco, atualiza mais rápido

      const smoothedAlpha = prevAlpha * temporalWeight + targetAlpha * (1 - temporalWeight);
      this.prevAlphaBuffer[i] = smoothedAlpha;

      // Atualiza o canal alfa
      const finalByte = Math.round(smoothedAlpha * 255);
      rawData[i * 4] = finalByte;
      rawData[i * 4 + 1] = finalByte;
      rawData[i * 4 + 2] = finalByte;
      rawData[i * 4 + 3] = finalByte;
    }

    this.rawMaskCtx.putImageData(rawImgData, 0, 0);
  }

  /**
   * Refinamento morfológico: expansão/redução, feather e opacidade
   */
  private applyMaskRefinements(
    width: number,
    height: number,
    settings: BackgroundRemovalSettings,
  ): void {
    this.refinedMaskCtx.clearRect(0, 0, width, height);
    this.refinedMaskCtx.save();

    // Aplica opacidade configurada
    this.refinedMaskCtx.globalAlpha = Math.max(0, Math.min(1, settings.opacity / 100));

    // Feathering (suavização gaussiana na borda)
    if (settings.feather > 0) {
      const blurRadius = Math.max(1, Math.min(25, settings.feather * 0.5));
      this.refinedMaskCtx.filter = `blur(${blurRadius}px)`;
    } else {
      this.refinedMaskCtx.filter = "none";
    }

    // Expansão / Redução morfológica da máscara (-20 a +20 px)
    const expansion = settings.maskExpansion;
    if (expansion !== 0) {
      const scaleX = (width + expansion * 2) / width;
      const scaleY = (height + expansion * 2) / height;
      this.refinedMaskCtx.translate(width / 2, height / 2);
      this.refinedMaskCtx.scale(scaleX, scaleY);
      this.refinedMaskCtx.translate(-width / 2, -height / 2);
    }

    this.refinedMaskCtx.drawImage(this.rawMaskCanvas, 0, 0);
    this.refinedMaskCtx.restore();
  }

  /**
   * Aplica correções manuais de pincel persistentes desenhadas pelo usuário
   */
  private applyManualStrokes(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    strokes: ManualMaskStroke[],
  ): void {
    ctx.save();

    for (const stroke of strokes) {
      if (!stroke.points || stroke.points.length === 0) continue;

      ctx.beginPath();
      ctx.lineWidth = stroke.brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (stroke.type === "add") {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = `rgba(255, 255, 255, ${stroke.brushSoftness > 50 ? 0.9 : 1.0})`;
      } else {
        // Remover área do recorte
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0, 0, 0, 1.0)";
      }

      const p0 = stroke.points[0];
      if (!p0) continue;
      ctx.moveTo((p0.x / 100) * width, (p0.y / 100) * height);

      for (let i = 1; i < stroke.points.length; i++) {
        const pt = stroke.points[i];
        if (!pt) continue;
        ctx.lineTo((pt.x / 100) * width, (pt.y / 100) * height);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * "Recortar ao Conteúdo": detecta automaticamente o bounding box ocupado pelo primeiro plano
   * a partir da máscara de transparência real, adicionando a margem configurável em pixels.
   */
  public detectContentBoundingBox(
    width: number,
    height: number,
    marginPx = 16,
  ): ContentBoundingBox {
    const imgData = this.refinedMaskCtx.getImageData(0, 0, width, height);
    const data = imgData.data;

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let foundPixel = false;

    // Escaneia a cada 4 pixels para alto desempenho
    const step = 4;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const idx = (y * width + x) * 4;
        const alpha = data[idx + 3] ?? 0;
        if (alpha > 20) {
          // Pixel perceptível do primeiro plano
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          foundPixel = true;
        }
      }
    }

    if (!foundPixel) {
      // Se não encontrou nada, retorna centro padrão
      return { x: 20, y: 20, width: 60, height: 60 };
    }

    // Aplica margem configurável
    minX = Math.max(0, minX - marginPx);
    minY = Math.max(0, minY - marginPx);
    maxX = Math.min(width, maxX + marginPx);
    maxY = Math.min(height, maxY + marginPx);

    const boxWidth = Math.max(10, maxX - minX);
    const boxHeight = Math.max(10, maxY - minY);

    return {
      x: Number(((minX / width) * 100).toFixed(1)),
      y: Number(((minY / height) * 100).toFixed(1)),
      width: Number(((boxWidth / width) * 100).toFixed(1)),
      height: Number(((boxHeight / height) * 100).toFixed(1)),
    };
  }
}
