import { useState, useRef } from "react";
import {
  Crop,
  Film,
  Sliders,
  Upload,
  Trash2,
  ArrowUp,
  ArrowDown,
  Sparkles,
  ZoomIn,
  Gauge,
  Volume2,
  FlipHorizontal,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Check,
  Users,
  User,
  Move,
  Maximize2,
  Copy,
  Scissors,
  RotateCw,
  Eye,
  EyeOff,
  Paintbrush,
  Plus,
  Minus,
  Grid,
  RefreshCw,
  Loader2,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  type FilterType,
  type VideoAdjustment,
  type VideoQueueItem,
  type TemplateVisual,
  type LayerId,
  DEFAULT_BG_REMOVAL,
} from "@/lib/types";
import { VideoProcessor } from "@/lib/video-processor";
import { VideoMattingEngine } from "@/lib/video-matting-engine";
import { LayerStackManager } from "./LayerStackManager";
import { uid } from "@/lib/local-store";
import { downloadBlob } from "@/lib/zip-utils";
import { getBatchFileName } from "@/lib/video-processor";

interface EditorTabPanelProps {
  queue: VideoQueueItem[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onAddFiles: (newItems: VideoQueueItem[]) => void;
  onRemoveItem: (id: string) => void;
  onClearQueue: () => void;
  onMoveItem: (fromIndex: number, toIndex: number) => void;
  disabled?: boolean;
  adjustment: VideoAdjustment;
  onUpdateAdjustment: (updated: VideoAdjustment) => void;
  template: TemplateVisual;
  applyToAll: boolean;
  onToggleApplyToAll: (applyAll: boolean) => void;
  onAutoCropToTemplate: () => void;
  onApplyCurrentToAll?: () => void;
  selectedCanvasElement?: string | null;
  onSelectCanvasElement?: (element: any) => void;
  onUpdateQueue?: (updater: (prev: VideoQueueItem[]) => VideoQueueItem[]) => void;
  onDownloadVideo?: (item: VideoQueueItem) => void;
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

const ZOOM_PRESETS = [1, 1.1, 1.25, 1.5];
const WIDTH_PRESETS = [50, 75, 90, 96, 100];
const RADIUS_PRESETS = [0, 8, 14, 20, 28];
const ROTATION_PRESETS = [0, 90, -90, 180];

export function EditorTabPanel({
  queue,
  selectedIndex,
  onSelectIndex,
  onAddFiles,
  onRemoveItem,
  onClearQueue,
  onMoveItem,
  disabled = false,
  adjustment,
  onUpdateAdjustment,
  template,
  applyToAll,
  onToggleApplyToAll,
  onAutoCropToTemplate,
  onApplyCurrentToAll,
  selectedCanvasElement,
  onSelectCanvasElement,
  onUpdateQueue,
  onDownloadVideo,
}: EditorTabPanelProps) {
  // Sub-aba interna: "adjustments" (Ajustes de vídeo) ou "queue" (Fila de vídeos)
  const [activeSubTab, setActiveSubTab] = useState<"adjustments" | "queue">("adjustments");
  const [autoCropSuccess, setAutoCropSuccess] = useState(false);
  const [isAutoCropping, setIsAutoCropping] = useState(false);
  const [isBatchAutoCropping, setIsBatchAutoCropping] = useState(false);
  const [batchCropProgress, setBatchCropProgress] = useState<{ current: number; total: number } | null>(null);
  const [autoCropFeedback, setAutoCropFeedback] = useState<string | null>(null);
  const [copyAllSuccess, setCopyAllSuccess] = useState(false);
  const [isProcessingMatting, setIsProcessingMatting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const bgRemoval = adjustment.bgRemoval || DEFAULT_BG_REMOVAL;

  // Adição de até 100 vídeos
  const handleFileSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = 100 - queue.length;
    if (remainingSlots <= 0) {
      alert("Limite de 100 vídeos atingido.");
      return;
    }

    const filesArray = Array.from(files).slice(0, remainingSlots);

    const newItems: VideoQueueItem[] = filesArray.map((file) => ({
      id: uid(),
      file,
      name: file.name,
      sizeMB: Number((file.size / (1024 * 1024)).toFixed(1)),
      durationSec: 0,
      thumbnailUrl: "",
      status: "pendente",
      progress: 0,
    }));

    onAddFiles(newItems);

    for (const item of newItems) {
      try {
        const meta = await VideoProcessor.extractMetadata(item.file);
        item.thumbnailUrl = meta.thumbnailUrl;
        item.durationSec = meta.durationSec;
      } catch (err) {
        console.warn("Falha ao extrair metadados para:", item.name, err);
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleTriggerAutoCrop = () => {
    onAutoCropToTemplate();
    setAutoCropSuccess(true);
    setTimeout(() => setAutoCropSuccess(false), 3000);
  };

  const handleCopyCurrentToAll = () => {
    if (onApplyCurrentToAll) {
      onApplyCurrentToAll();
      setCopyAllSuccess(true);
      setTimeout(() => setCopyAllSuccess(false), 2500);
    }
  };

  // DETECÇÃO AUTOMÁTICA DE FILMAGEM E RECORTE DE TEMPLATE ESTÁTICO (INDIVIDUAL OU EM MASSA)
  const handleAutoCropMargins = async () => {
    // Se o usuário estiver no modo "Todos" (em massa) e tiver múltiplos vídeos,
    // analisa e recorta cada um dos vídeos da fila individualmente!
    if (applyToAll && queue.length > 1) {
      await handleAutoCropAllQueue();
      return;
    }

    setIsAutoCropping(true);
    setAutoCropFeedback(null);

    try {
      const video = document.querySelector("video");
      if (!video || video.videoWidth === 0) {
        onUpdateAdjustment({
          ...adjustment,
          cropTop: 13,
          cropBottom: 13,
          cropLeft: 0,
          cropRight: 0,
          cropMode: "auto",
          videoX: 50,
          videoY: 53,
          videoWidth: adjustment.videoWidth ?? 96,
        });
        setAutoCropFeedback("Recorte padrão aplicado (13% topo/base)");
        return;
      }

      // Analisa variação temporal de movimento e cores para isolar LITERALMENTE a filmagem
      const detected = await VideoProcessor.detectActiveFootage(video);

      if (detected.cropTop > 0 || detected.cropBottom > 0 || detected.cropLeft > 0 || detected.cropRight > 0) {
        onUpdateAdjustment({
          ...adjustment,
          cropTop: detected.cropTop,
          cropBottom: detected.cropBottom,
          cropLeft: detected.cropLeft,
          cropRight: detected.cropRight,
          cropMode: "auto",
          videoX: adjustment.videoX ?? 50,
          videoY: adjustment.videoY ?? 53,
          videoWidth: adjustment.videoWidth ?? 96,
        });
        setAutoCropFeedback(
          `✓ Filmagem detectada! Template estático recortado: Topo ${detected.cropTop}%, Base ${detected.cropBottom}%${
            detected.cropLeft > 0 || detected.cropRight > 0 ? `, Laterais ${detected.cropLeft}%/${detected.cropRight}%` : ""
          }`
        );
      } else {
        onUpdateAdjustment({
          ...adjustment,
          cropTop: 0,
          cropBottom: 0,
          cropLeft: 0,
          cropRight: 0,
          cropMode: "auto",
          videoX: 50,
          videoY: 53,
          videoWidth: adjustment.videoWidth ?? 96,
        });
        setAutoCropFeedback("✓ Filmagem limpa em tela cheia (sem template ou barras estáticas)");
      }
    } catch (err) {
      console.error("Erro no recorte automático:", err);
    } finally {
      setIsAutoCropping(false);
      setTimeout(() => setAutoCropFeedback(null), 5000);
    }
  };

  // DETECÇÃO E RECORTE AUTOMÁTICO DE TEMPLATE EM TODOS OS VÍDEOS DA FILA (EM MASSA)
  const handleAutoCropAllQueue = async () => {
    if (queue.length === 0) return;
    setIsBatchAutoCropping(true);
    setAutoCropFeedback(null);
    setBatchCropProgress({ current: 0, total: queue.length });

    try {
      const results: { id: string; detected: { cropTop: number; cropBottom: number; cropLeft: number; cropRight: number } }[] = [];

      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        if (!item) continue;
        setBatchCropProgress({ current: i + 1, total: queue.length });

        try {
          let detected = { cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0 };
          // Para o vídeo atualmente carregado no player do preview, usa a amostragem direta do elemento <video>
          if (i === selectedIndex) {
            const video = document.querySelector("video");
            if (video && video.videoWidth > 0) {
              detected = await VideoProcessor.detectActiveFootage(video);
            } else {
              detected = await VideoProcessor.detectActiveFootageFromFile(item.file);
            }
          } else {
            detected = await VideoProcessor.detectActiveFootageFromFile(item.file);
          }

          results.push({ id: item.id, detected });
        } catch (err) {
          console.warn(`Erro ao analisar vídeo ${item.name}:`, err);
          results.push({ id: item.id, detected: { cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0 } });
        }
      }

      // Atualiza atomicamente a fila de vídeos para que CADA item possua seus recortes individuais
      if (onUpdateQueue) {
        onUpdateQueue((prevQueue) =>
          prevQueue.map((item) => {
            const found = results.find((r) => r.id === item.id);
            if (!found) return item;
            const baseAdj = item.customAdjustment || adjustment;
            return {
              ...item,
              customAdjustment: {
                ...baseAdj,
                cropTop: found.detected.cropTop,
                cropBottom: found.detected.cropBottom,
                cropLeft: found.detected.cropLeft,
                cropRight: found.detected.cropRight,
                cropMode: "auto",
                videoX: baseAdj.videoX ?? 50,
                videoY: baseAdj.videoY ?? 53,
                videoWidth: baseAdj.videoWidth ?? 96,
              },
            };
          }),
        );
      }

      // Sincroniza o ajuste ativo do vídeo atual no preview
      const currentRes = results.find((r) => r.id === queue[selectedIndex]?.id);
      if (currentRes) {
        onUpdateAdjustment({
          ...adjustment,
          cropTop: currentRes.detected.cropTop,
          cropBottom: currentRes.detected.cropBottom,
          cropLeft: currentRes.detected.cropLeft,
          cropRight: currentRes.detected.cropRight,
          cropMode: "auto",
        });
      }

      setAutoCropFeedback(`✓ Sucesso! Todos os ${queue.length} vídeos foram analisados individualmente e cada um recebeu seu recorte exato.`);
    } catch (err) {
      console.error("Erro no processamento em massa:", err);
      setAutoCropFeedback("Houve um erro no processamento em massa.");
    } finally {
      setIsBatchAutoCropping(false);
      setBatchCropProgress(null);
      setTimeout(() => setAutoCropFeedback(null), 5000);
    }
  };

  // LIMPAR CORREÇÕES MANUAIS
  const handleClearManualStrokes = () => {
    onUpdateAdjustment({
      ...adjustment,
      bgRemoval: {
        ...bgRemoval,
        manualStrokes: [],
      },
    });
  };

  const formatDuration = (sec: number) => {
    if (!sec) return "--:--";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const currentVideo = queue[selectedIndex] || null;

  return (
    <div className="space-y-4">
      {/* 1. SELETOR DE MODO: EM MASSA (TODOS) vs INDIVIDUAL */}
      <div className="rounded-xl border border-border/80 bg-secondary/30 p-2.5 space-y-2 shadow-xs">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <Sliders className="size-3.5 text-primary" />
            Modo de Aplicação:
          </span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              applyToAll
                ? "bg-primary/20 text-primary border-primary/40"
                : "bg-amber-500/20 text-amber-300 border-amber-500/40"
            }`}
          >
            {applyToAll
              ? `Em Massa (${queue.length} vídeo${queue.length === 1 ? "" : "s"})`
              : `Individual (#${selectedIndex + 1})`}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onToggleApplyToAll(true)}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition ${
              applyToAll
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-secondary/40 text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
            }`}
            title="Aplica recorte de margens, tamanho e filtros em todos os vídeos simultaneamente"
          >
            <Users className="size-3.5" />
            Todos os Vídeos ({queue.length})
          </button>

          <button
            type="button"
            onClick={() => onToggleApplyToAll(false)}
            disabled={queue.length === 0}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition disabled:opacity-50 ${
              !applyToAll
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-secondary/40 text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
            }`}
            title="Aplica alterações de recorte de margens e ajustes exclusivamente ao vídeo selecionado"
          >
            <User className="size-3.5" />
            Só Este Vídeo
          </button>
        </div>

        <p className="text-[10px] text-muted-foreground leading-tight">
          {applyToAll
            ? "✓ Alterações de recorte de margens, tamanho, posição e camadas serão aplicadas em massa ao lote inteiro."
            : `✎ Editando apenas o vídeo #${selectedIndex + 1} (${currentVideo?.name || "nenhum"}). Os outros vídeos permanecem intactos.`}
        </p>
      </div>

      {/* 2. RECORTE DA CAMADA DE VÍDEO (INDEPENDENTE DO TEMPLATE) */}
      <div className="rounded-xl border border-primary/50 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-3.5 space-y-3 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-6 rounded-md bg-primary/20 flex items-center justify-center text-primary">
              <Crop className="size-3.5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-foreground">RECORTE DA CAMADA DE VÍDEO</h4>
              <p className="text-[10px] text-muted-foreground">
                Camada 100% independente (o crop opera só no vídeo original, ignorando o template)
              </p>
            </div>
          </div>

          {(adjustment.cropTop || adjustment.cropBottom || adjustment.cropLeft || adjustment.cropRight) ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 text-emerald-300 px-2 py-0.5 text-[9px] font-semibold border border-emerald-500/40">
              <Check className="size-2.5" />
              Recorte ativo
            </span>
          ) : (
            <span className="rounded-full bg-secondary/80 text-muted-foreground px-2 py-0.5 text-[9px] font-medium border border-border">
              Sem corte
            </span>
          )}
        </div>

        {/* Seletor de Modo: Automático vs Manual */}
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-border/80 bg-secondary/40 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => {
              onUpdateAdjustment({ ...adjustment, cropMode: "auto" });
              if (onSelectCanvasElement) onSelectCanvasElement("video");
            }}
            className={`py-1 rounded-md text-[11px] font-semibold transition flex items-center justify-center gap-1.5 ${
              (adjustment.cropMode ?? "auto") === "auto"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="size-3" />
            Recorte Automático
          </button>
          <button
            type="button"
            onClick={() => {
              onUpdateAdjustment({ ...adjustment, cropMode: "manual" });
              if (onSelectCanvasElement) onSelectCanvasElement("video");
            }}
            className={`py-1 rounded-md text-[11px] font-semibold transition flex items-center justify-center gap-1.5 ${
              adjustment.cropMode === "manual"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sliders className="size-3" />
            Recorte Manual
          </button>
        </div>

        {/* CONTEÚDO DO MODO AUTOMÁTICO */}
        {(adjustment.cropMode ?? "auto") === "auto" ? (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Analisa o movimento temporal e as cores do arquivo para isolar <strong>LITERALMENTE apenas a filmagem</strong>, recortando fora qualquer template estático (fundo branco, headlines, bordas ou barras).
            </p>

            <div className="flex flex-col gap-1.5">
              <Button
                type="button"
                size="sm"
                onClick={handleAutoCropMargins}
                disabled={disabled || isAutoCropping || isBatchAutoCropping}
                className="w-full h-8 text-xs font-semibold gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
              >
                {isAutoCropping ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Detectando filmagem e isolando vídeo...
                  </>
                ) : (
                  <>
                    <Crop className="size-3.5" />
                    Detectar filmagem e recortar template
                  </>
                )}
              </Button>

              {queue.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAutoCropAllQueue}
                  disabled={disabled || isAutoCropping || isBatchAutoCropping}
                  className="w-full h-7 text-[11px] font-medium gap-1.5 border-primary/40 hover:bg-primary/10 text-foreground shadow-xs"
                >
                  {isBatchAutoCropping ? (
                    <>
                      <Loader2 className="size-3 animate-spin text-primary" />
                      Recortando {batchCropProgress?.current} de {batchCropProgress?.total} vídeos...
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-3 text-primary" />
                      Recortar template de TODOS ({queue.length}) em lote
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Toggle para exportar apenas a filmagem pura */}
            <div className="flex items-center justify-between rounded-lg border border-border/70 bg-secondary/30 p-2 text-xs">
              <div className="space-y-0.5">
                <Label htmlFor="exportOnlyVideo" className="text-xs font-semibold cursor-pointer text-foreground">
                  Exportar apenas a filmagem
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  Exporta a cena limpa sem cabeçalhos ou template
                </p>
              </div>
              <Switch
                id="exportOnlyVideo"
                checked={!!adjustment.exportOnlyVideoFootage}
                onCheckedChange={(checked) =>
                  onUpdateAdjustment({ ...adjustment, exportOnlyVideoFootage: checked })
                }
              />
            </div>

            {autoCropFeedback && (
              <div className="rounded-md bg-emerald-500/15 border border-emerald-500/30 p-2 text-center text-xs font-medium text-emerald-400 animate-in fade-in duration-200">
                {autoCropFeedback}
              </div>
            )}

            {/* Presets Rápidos de Recorte */}
            <div className="grid grid-cols-3 gap-1 pt-0.5">
              <button
                type="button"
                onClick={() =>
                  onUpdateAdjustment({
                    ...adjustment,
                    cropTop: 0,
                    cropBottom: 0,
                    cropLeft: 0,
                    cropRight: 0,
                  })
                }
                className="py-1 px-1.5 rounded-md text-[10px] font-medium border border-border/60 bg-secondary/40 text-muted-foreground hover:bg-secondary/70 hover:text-foreground text-center transition"
              >
                Sem corte (0%)
              </button>

              <button
                type="button"
                onClick={() =>
                  onUpdateAdjustment({
                    ...adjustment,
                    cropTop: 13,
                    cropBottom: 13,
                    cropLeft: 0,
                    cropRight: 0,
                    videoX: 50,
                    videoY: 53,
                  })
                }
                className="py-1 px-1.5 rounded-md text-[10px] font-medium border border-border/60 bg-secondary/40 text-muted-foreground hover:bg-secondary/70 hover:text-foreground text-center transition"
                title="Corta 13% no topo e base do vídeo (faixas pretas típicas de widescreen)"
              >
                Cinemascope (21:9)
              </button>

              <button
                type="button"
                onClick={() =>
                  onUpdateAdjustment({
                    ...adjustment,
                    cropTop: 0,
                    cropBottom: 0,
                    cropLeft: 12,
                    cropRight: 12,
                    videoX: 50,
                    videoY: 53,
                  })
                }
                className="py-1 px-1.5 rounded-md text-[10px] font-medium border border-border/60 bg-secondary/40 text-muted-foreground hover:bg-secondary/70 hover:text-foreground text-center transition"
                title="Corta 12% nas laterais do vídeo para 4:5"
              >
                16:9 → 4:5
              </button>
            </div>
          </div>
        ) : (
          /* CONTEÚDO DO MODO MANUAL */
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Defina o recorte milimétrico das margens e manipule a camada de vídeo (zoom, pan, tamanho e posição) independentemente do template.
            </p>

            {/* Controles de Margem Superior, Inferior, Esquerda, Direita */}
            <div className="rounded-lg border border-border/70 bg-secondary/20 p-2.5 space-y-2.5">
              <div className="flex items-center justify-between border-b border-border/40 pb-1">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Sliders className="size-3 text-primary" />
                  Margens de Corte do Vídeo
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateAdjustment({
                      ...adjustment,
                      cropTop: 0,
                      cropBottom: 0,
                      cropLeft: 0,
                      cropRight: 0,
                    })
                  }
                  className="text-[10px] text-primary hover:underline"
                >
                  Zerar margens
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px]">
                {/* Margem Superior (Topo) */}
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Margem Superior (Topo)</span>
                    <span className="font-mono font-semibold text-foreground">{adjustment.cropTop ?? 0}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="45"
                    value={adjustment.cropTop ?? 0}
                    onChange={(e) =>
                      onUpdateAdjustment({
                        ...adjustment,
                        cropTop: Number(e.target.value),
                      })
                    }
                    className="w-full accent-primary"
                  />
                </div>

                {/* Margem Inferior (Base) */}
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Margem Inferior (Base)</span>
                    <span className="font-mono font-semibold text-foreground">{adjustment.cropBottom ?? 0}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="45"
                    value={adjustment.cropBottom ?? 0}
                    onChange={(e) =>
                      onUpdateAdjustment({
                        ...adjustment,
                        cropBottom: Number(e.target.value),
                      })
                    }
                    className="w-full accent-primary"
                  />
                </div>

                {/* Margem Esquerda */}
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Margem Esquerda</span>
                    <span className="font-mono font-semibold text-foreground">{adjustment.cropLeft ?? 0}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="45"
                    value={adjustment.cropLeft ?? 0}
                    onChange={(e) =>
                      onUpdateAdjustment({
                        ...adjustment,
                        cropLeft: Number(e.target.value),
                      })
                    }
                    className="w-full accent-primary"
                  />
                </div>

                {/* Margem Direita */}
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Margem Direita</span>
                    <span className="font-mono font-semibold text-foreground">{adjustment.cropRight ?? 0}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="45"
                    value={adjustment.cropRight ?? 0}
                    onChange={(e) =>
                      onUpdateAdjustment({
                        ...adjustment,
                        cropRight: Number(e.target.value),
                      })
                    }
                    className="w-full accent-primary"
                  />
                </div>
              </div>
            </div>

            {/* Ajustes de Pan e Zoom da Camada */}
            <div className="rounded-lg border border-border/70 bg-secondary/20 p-2.5 space-y-2">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Move className="size-3 text-primary" />
                Deslocamento (Pan) e Zoom do Vídeo
              </span>

              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pan Horizontal (X)</span>
                    <span className="font-mono font-semibold text-foreground">{adjustment.cropPanX ?? 0}%</span>
                  </div>
                  <input
                    type="range"
                    min="-40"
                    max="40"
                    value={adjustment.cropPanX ?? 0}
                    onChange={(e) =>
                      onUpdateAdjustment({ ...adjustment, cropPanX: Number(e.target.value) })
                    }
                    className="w-full accent-primary"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pan Vertical (Y)</span>
                    <span className="font-mono font-semibold text-foreground">{adjustment.cropPanY ?? 0}%</span>
                  </div>
                  <input
                    type="range"
                    min="-40"
                    max="40"
                    value={adjustment.cropPanY ?? 0}
                    onChange={(e) =>
                      onUpdateAdjustment({ ...adjustment, cropPanY: Number(e.target.value) })
                    }
                    className="w-full accent-primary"
                  />
                </div>
              </div>

              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Zoom Interno do Vídeo</span>
                  <span className="font-mono font-semibold text-foreground">{adjustment.zoom.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.6"
                  max="2.5"
                  step="0.05"
                  value={adjustment.zoom}
                  onChange={(e) =>
                    onUpdateAdjustment({ ...adjustment, zoom: Number(e.target.value) })
                  }
                  className="w-full accent-primary"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. SUB-NAVEGAÇÃO: AJUSTES DE VÍDEO vs FILA DE VÍDEOS */}
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-secondary/30 p-1">
        <button
          type="button"
          onClick={() => setActiveSubTab("adjustments")}
          className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition ${
            activeSubTab === "adjustments"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          }`}
        >
          <Sliders className="size-3.5" />
          Ajustes de Vídeo
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("queue")}
          className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition ${
            activeSubTab === "queue"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          }`}
        >
          <Film className="size-3.5" />
          Fila ({queue.length}/100)
        </button>
      </div>

      {/* 4. CONTEÚDO DA SUB-ABA AJUSTES DE VÍDEO */}
      {activeSubTab === "adjustments" && (
        <div className="space-y-3.5">
          {/* SEÇÃO: GERENCIADOR DE CAMADAS VISUAIS (STACK) */}
          <LayerStackManager
            layerOrder={adjustment.layerOrder || ["template", "video", "headline", "subHeadline", "watermark"]}
            hiddenLayers={adjustment.hiddenLayers || []}
            selectedLayer={selectedCanvasElement || "video"}
            onSelectLayer={(id) => {
              if (onSelectCanvasElement) onSelectCanvasElement(id);
            }}
            onReorderLayers={(newOrder) =>
              onUpdateAdjustment({ ...adjustment, layerOrder: newOrder })
            }
            onToggleLayerVisibility={(layerId) => {
              const current = adjustment.hiddenLayers || [];
              const next = current.includes(layerId)
                ? current.filter((id) => id !== layerId)
                : [...current, layerId];
              onUpdateAdjustment({ ...adjustment, hiddenLayers: next });
            }}
          />

          {/* SEÇÃO: TAMANHO, POSIÇÃO E ROTAÇÃO DO VÍDEO RECORTADO */}
          <div className="rounded-xl border border-primary/30 bg-secondary/25 p-3 space-y-3">
            <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
              <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Maximize2 className="size-3.5 text-primary" />
                Posicionamento e Dimensões da Camada
              </Label>
              <span className="text-[10px] text-muted-foreground">
                {applyToAll ? "Em Massa" : "Individual"}
              </span>
            </div>

            {/* A. TAMANHO DO VÍDEO (LARGURA %) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-foreground flex items-center gap-1">
                  Largura / Tamanho ({adjustment.videoWidth ?? 96}%)
                </span>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min="30"
                    max="140"
                    step="1"
                    value={adjustment.videoWidth ?? 96}
                    onChange={(e) =>
                      onUpdateAdjustment({
                        ...adjustment,
                        videoWidth: Math.min(140, Math.max(30, Number(e.target.value) || 96)),
                      })
                    }
                    className="h-6 w-14 text-center text-xs font-mono"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>

              <input
                type="range"
                min="30"
                max="140"
                step="1"
                value={adjustment.videoWidth ?? 96}
                onChange={(e) =>
                  onUpdateAdjustment({
                    ...adjustment,
                    videoWidth: Number(e.target.value),
                  })
                }
                className="w-full accent-primary"
              />

              <div className="flex justify-between gap-1 text-[10px]">
                {WIDTH_PRESETS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() =>
                      onUpdateAdjustment({
                        ...adjustment,
                        videoWidth: w,
                      })
                    }
                    className={`rounded px-1.5 py-0.5 font-mono transition ${
                      (adjustment.videoWidth ?? 96) === w
                        ? "bg-primary text-primary-foreground font-bold"
                        : "bg-secondary/40 text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                    }`}
                  >
                    {w}%
                  </button>
                ))}
              </div>
            </div>

            {/* B. POSIÇÃO HORIZONTAL E VERTICAL */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              {/* Posição X */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground font-medium">Posição X</span>
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {Math.round(adjustment.videoX ?? 50)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={adjustment.videoX ?? 50}
                  onChange={(e) =>
                    onUpdateAdjustment({
                      ...adjustment,
                      videoX: Number(e.target.value),
                    })
                  }
                  className="w-full accent-primary"
                />
                <button
                  type="button"
                  onClick={() =>
                    onUpdateAdjustment({ ...adjustment, videoX: 50 })
                  }
                  className="text-[9px] text-primary hover:underline block"
                >
                  Centralizar X (50%)
                </button>
              </div>

              {/* Posição Y */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground font-medium">Posição Y</span>
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {Math.round(adjustment.videoY ?? 53)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="90"
                  step="1"
                  value={adjustment.videoY ?? 53}
                  onChange={(e) =>
                    onUpdateAdjustment({
                      ...adjustment,
                      videoY: Number(e.target.value),
                    })
                  }
                  className="w-full accent-primary"
                />
                <button
                  type="button"
                  onClick={() =>
                    onUpdateAdjustment({ ...adjustment, videoY: 53 })
                  }
                  className="text-[9px] text-primary hover:underline block"
                >
                  Centralizar Y (53%)
                </button>
              </div>
            </div>

            {/* C. ROTAÇÃO DA CAMADA (-180° a 180°) */}
            <div className="space-y-1.5 pt-1 border-t border-border/40">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-foreground font-semibold flex items-center gap-1">
                  <RotateCw className="size-3 text-primary" />
                  Rotação ({adjustment.rotation ?? 0}°)
                </span>
                <button
                  type="button"
                  onClick={() => onUpdateAdjustment({ ...adjustment, rotation: 0 })}
                  className="text-[10px] text-primary hover:underline"
                >
                  Zerar (0°)
                </button>
              </div>

              <input
                type="range"
                min="-180"
                max="180"
                step="5"
                value={adjustment.rotation ?? 0}
                onChange={(e) =>
                  onUpdateAdjustment({
                    ...adjustment,
                    rotation: Number(e.target.value),
                  })
                }
                className="w-full accent-primary"
              />

              <div className="flex justify-between gap-1 text-[10px]">
                {ROTATION_PRESETS.map((deg) => (
                  <button
                    key={deg}
                    type="button"
                    onClick={() => onUpdateAdjustment({ ...adjustment, rotation: deg })}
                    className={`rounded px-2 py-0.5 font-mono text-[10px] transition ${
                      (adjustment.rotation ?? 0) === deg
                        ? "bg-primary text-primary-foreground font-bold"
                        : "bg-secondary/40 text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                    }`}
                  >
                    {deg}°
                  </button>
                ))}
              </div>
            </div>

            {/* D. MODO DE ENCAIXE & BORDAS */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40">
              <div>
                <span className="text-[10px] text-muted-foreground block mb-1">
                  Ajuste de Proporção
                </span>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateAdjustment({ ...adjustment, videoFit: "contain" })
                    }
                    className={`rounded py-1 text-[10px] font-medium transition ${
                      (adjustment.videoFit ?? "contain") === "contain"
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "bg-secondary/40 text-muted-foreground hover:bg-secondary/70"
                    }`}
                  >
                    Natural
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateAdjustment({ ...adjustment, videoFit: "cover" })
                    }
                    className={`rounded py-1 text-[10px] font-medium transition ${
                      adjustment.videoFit === "cover"
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "bg-secondary/40 text-muted-foreground hover:bg-secondary/70"
                    }`}
                  >
                    Preencher
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    Cantos do Vídeo
                  </span>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={48}
                      step={1}
                      value={adjustment.borderRadius ?? 8}
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

                <div className="flex items-center gap-2">
                  <Slider
                    min={0}
                    max={48}
                    step={1}
                    value={[adjustment.borderRadius ?? 8]}
                    onValueChange={([val]) =>
                      onUpdateAdjustment({ ...adjustment, borderRadius: val ?? 8 })
                    }
                    className="flex-1"
                  />
                </div>

                <div className="grid grid-cols-5 gap-1 pt-0.5">
                  {RADIUS_PRESETS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() =>
                        onUpdateAdjustment({ ...adjustment, borderRadius: r })
                      }
                      className={`rounded py-1 text-[10px] font-mono transition ${
                        (adjustment.borderRadius ?? 8) === r
                          ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                          : "bg-secondary/40 text-muted-foreground hover:bg-secondary/70"
                      }`}
                    >
                      {r === 0 ? "0" : `${r}px`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* SEÇÃO: ZOOM / ESCALA INTERNA */}
          <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <ZoomIn className="size-3.5 text-muted-foreground" />
                Zoom / Escala Interna ({adjustment.zoom.toFixed(2)}x)
              </Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  step="0.05"
                  min="0.5"
                  max="3.0"
                  value={adjustment.zoom}
                  onChange={(e) =>
                    onUpdateAdjustment({
                      ...adjustment,
                      zoom: Math.min(3, Math.max(0.5, Number(e.target.value) || 1)),
                    })
                  }
                  className="h-6 w-14 text-center text-xs font-mono"
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
                onUpdateAdjustment({ ...adjustment, zoom: Number(e.target.value) })
              }
              className="w-full accent-primary"
            />

            <div className="flex justify-between text-[10px] text-muted-foreground">
              <button type="button" onClick={() => onUpdateAdjustment({ ...adjustment, zoom: 0.5 })}>
                0.5x
              </button>
              <button type="button" onClick={() => onUpdateAdjustment({ ...adjustment, zoom: 1 })}>
                1.0x (Padrão)
              </button>
              <button type="button" onClick={() => onUpdateAdjustment({ ...adjustment, zoom: 1.5 })}>
                1.5x
              </button>
              <button type="button" onClick={() => onUpdateAdjustment({ ...adjustment, zoom: 2 })}>
                2.0x
              </button>
            </div>
          </div>

          {/* SEÇÃO: VELOCIDADE */}
          <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Gauge className="size-3.5 text-muted-foreground" />
                Velocidade de Reprodução ({adjustment.speed.toFixed(2)}x)
              </Label>
              <Input
                type="number"
                step="0.05"
                min="0.25"
                max="3.0"
                value={adjustment.speed}
                onChange={(e) =>
                  onUpdateAdjustment({
                    ...adjustment,
                    speed: Math.min(3, Math.max(0.25, Number(e.target.value) || 1)),
                  })
                }
                className="h-6 w-14 text-center text-xs font-mono"
              />
            </div>

            <div className="grid grid-cols-6 gap-1">
              {SPEED_PRESETS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onUpdateAdjustment({ ...adjustment, speed: s })}
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

          {/* SEÇÃO: FILTROS VISUAIS */}
          <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-muted-foreground" />
              Filtros Visuais
            </Label>

            <div className="grid grid-cols-4 gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onUpdateAdjustment({ ...adjustment, filter: f.id })}
                  className={`rounded py-1 px-1.5 text-[10px] font-medium transition ${
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
              <div className="pt-1.5 space-y-1">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Intensidade do Filtro</span>
                  <span>{adjustment.filterIntensity}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={adjustment.filterIntensity}
                  onChange={(e) =>
                    onUpdateAdjustment({
                      ...adjustment,
                      filterIntensity: Number(e.target.value),
                    })
                  }
                  className="w-full accent-primary"
                />
              </div>
            )}
          </div>

          {/* SEÇÃO: ÁUDIO E ESPELHAMENTO */}
          <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Volume2 className="size-3.5 text-muted-foreground" />
                <Label className="text-xs font-medium">Manter áudio original</Label>
              </div>
              <Switch
                checked={adjustment.keepAudio}
                onCheckedChange={(val) =>
                  onUpdateAdjustment({ ...adjustment, keepAudio: val })
                }
              />
            </div>

            <div className="flex items-center justify-between border-t border-border/40 pt-2">
              <div className="flex items-center gap-2">
                <FlipHorizontal className="size-3.5 text-muted-foreground" />
                <Label className="text-xs font-medium">Espelhar vídeo horizontalmente</Label>
              </div>
              <Switch
                checked={adjustment.mirror}
                onCheckedChange={(val) =>
                  onUpdateAdjustment({ ...adjustment, mirror: val })
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* 5. CONTEÚDO DA SUB-ABA FILA DE VÍDEOS */}
      {activeSubTab === "queue" && (
        <div className="space-y-3">
          {/* Header da Fila */}
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <span className="text-[11px] text-muted-foreground">
              {queue.length === 0
                ? "Nenhum vídeo adicionado ainda."
                : `Vídeo ${selectedIndex + 1} selecionado de ${queue.length}`}
            </span>

            <div className="flex items-center gap-2">
              {queue.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Deseja realmente remover todos os vídeos da fila?")) {
                      onClearQueue();
                    }
                  }}
                  disabled={disabled}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  Limpar
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".mp4,.mov,.webm,.m4v,video/mp4,video/quicktime,video/webm,video/x-m4v"
                multiple
                onChange={handleFileSelection}
                disabled={disabled || queue.length >= 100}
                className="hidden"
              />

              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || queue.length >= 100}
                className="h-7 text-xs font-semibold gap-1.5 border-dashed"
              >
                <Upload className="size-3 text-primary" /> Adicionar vídeos
              </Button>
            </div>
          </div>

          {/* Lista de Vídeos */}
          {queue.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/80 p-8 text-center cursor-pointer hover:border-primary/60 hover:bg-secondary/30 transition-all"
            >
              <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
                <Upload className="size-5" />
              </div>
              <p className="text-xs font-semibold text-foreground">Clique para selecionar até 100 vídeos</p>
              <p className="text-[10px] text-muted-foreground mt-1 max-w-[240px]">
                Formatos suportados: MP4, MOV, WEBM. Processamento 100% local e privado.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[380px] overflow-y-auto scrollbar-slim pr-1">
              {queue.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                const hasCustom = !!item.customAdjustment;
                return (
                  <div
                    key={item.id}
                    onClick={() => onSelectIndex(idx)}
                    className={`group flex items-center justify-between gap-2.5 rounded-lg border p-2 text-xs transition cursor-pointer ${
                      isSelected
                        ? "border-primary bg-primary/10 shadow-xs"
                        : "border-border/60 bg-secondary/20 hover:bg-secondary/50"
                    }`}
                  >
                    {/* Thumbnail & Número */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="relative size-10 rounded overflow-hidden bg-black shrink-0 border border-border">
                        {item.thumbnailUrl ? (
                          <img
                            src={item.thumbnailUrl}
                            alt={item.name}
                            className="size-full object-cover"
                          />
                        ) : (
                          <div className="size-full flex items-center justify-center text-muted-foreground">
                            <Film className="size-4" />
                          </div>
                        )}
                        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/80 px-1 text-[8px] font-mono text-white">
                          #{idx + 1}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p
                            className={`font-semibold truncate max-w-[130px] sm:max-w-[150px] ${
                              isSelected ? "text-primary" : "text-foreground"
                            }`}
                          >
                            {item.name}
                          </p>
                          {hasCustom && !applyToAll && (
                            <span className="rounded bg-amber-500/20 text-amber-300 text-[8px] px-1 py-0.2 border border-amber-500/30">
                              custom
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-0.5">
                            <Clock className="size-2.5" />
                            {formatDuration(item.durationSec)}
                          </span>
                          <span>{item.sizeMB} MB</span>
                        </div>
                      </div>
                    </div>

                    {/* Status e Ações: Mover, Baixar e Remover */}
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {/* Check Verde Positivo e Botão de Download se concluído */}
                      {item.status === "concluido" && (
                        <div className="flex items-center gap-1">
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold shadow-xs"
                            title="Vídeo renderizado com sucesso!"
                          >
                            <CheckCircle2 className="size-3 text-emerald-400 shrink-0" />
                            <span>Pronto</span>
                          </span>

                          {item.processedBlob && (
                            <button
                              type="button"
                              onClick={() => {
                                if (onDownloadVideo) {
                                  onDownloadVideo(item);
                                } else if (item.processedBlob) {
                                  const isMp4 = item.processedBlob.type.includes("mp4");
                                  downloadBlob(item.processedBlob, getBatchFileName(idx + 1, isMp4 ? "mp4" : "webm"));
                                }
                              }}
                              className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-semibold flex items-center gap-1 transition-colors shadow-xs"
                              title="Baixar este vídeo editado"
                            >
                              <Download className="size-3" />
                              <span>Baixar</span>
                            </button>
                          )}
                        </div>
                      )}

                      {/* Status Processando */}
                      {item.status === "processando" && (
                        <span className="flex items-center gap-1 text-[10px] font-mono text-primary font-semibold">
                          <Loader2 className="size-3 animate-spin" />
                          <span>{item.progress}%</span>
                        </span>
                      )}

                      {/* Status de Erro */}
                      {item.status === "erro" && (
                        <span
                          className="flex items-center gap-1 text-[10px] text-rose-400 font-semibold"
                          title={item.errorMessage || "Erro na renderização"}
                        >
                          <AlertCircle className="size-3" />
                          <span>Erro</span>
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMoveItem(idx, idx - 1);
                        }}
                        disabled={idx === 0 || disabled}
                        className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-20"
                        title="Mover para cima"
                      >
                        <ArrowUp className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMoveItem(idx, idx + 1);
                        }}
                        disabled={idx === queue.length - 1 || disabled}
                        className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-20"
                        title="Mover para baixo"
                      >
                        <ArrowDown className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveItem(item.id);
                        }}
                        disabled={disabled}
                        className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                        title="Remover vídeo da fila"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
