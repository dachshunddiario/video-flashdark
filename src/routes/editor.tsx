import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useMemo, useEffect } from "react";
import {
  Layers,
  Sliders,
  Film,
  Sparkles,
  Play,
  Download,
  AlertCircle,
  HardDrive,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TemplatePanel } from "@/components/editor/TemplatePanel";
import { EditorTabPanel } from "@/components/editor/EditorTabPanel";
import { VideoCanvasPreview } from "@/components/editor/VideoCanvasPreview";
import { BatchProcessingModal } from "@/components/editor/BatchProcessingModal";
import { STORAGE_KEYS, useLocalState, uid } from "@/lib/local-store";
import {
  DEFAULT_ADJUSTMENT,
  DEFAULT_TEMPLATE_VISUAL,
  type Template,
  type TemplateVisual,
  type VideoAdjustment,
  type VideoQueueItem,
} from "@/lib/types";
import { VideoProcessor, getBatchFileName, type ProcessedVideoResult } from "@/lib/video-processor";
import { downloadBlob } from "@/lib/zip-utils";

export const Route = createFileRoute("/editor")({
  head: () => ({
    meta: [
      { title: "Video Flash · Vídeos em Massa com GPU · Studio Local" },
      {
        name: "description",
        content:
          "Video Flash: Crie templates visuais e processe em massa vídeos verticais (9:16) no seu computador com NVIDIA RTX 3090 NVENC acelerado e exportação ZIP.",
      },
      { property: "og:title", content: "Video Flash · Studio Local" },
      {
        property: "og:description",
        content: "Video Flash: Produção de vídeos em massa 100% local com GPU NVENC e exportação ZIP.",
      },
    ],
  }),
  component: EditorPage,
});

function EditorPage() {
  // Configuração global de Template e Ajustes
  const [globalTemplate, setGlobalTemplate] = useState<TemplateVisual>(DEFAULT_TEMPLATE_VISUAL);
  const [globalAdjustment, setGlobalAdjustment] = useState<VideoAdjustment>(DEFAULT_ADJUSTMENT);

  // Lista de templates salvos no armazenamento local
  const { value: savedTemplates, setValue: setSavedTemplates } = useLocalState<Template[]>(
    STORAGE_KEYS.templates,
    [],
  );

  // Fila de vídeos (até 100 vídeos)
  const [queue, setQueue] = useState<VideoQueueItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  // Status da aceleração por hardware nativa (RTX 3090)
  const [isNvencActive, setIsNvencActive] = useState<boolean>(false);

  useEffect(() => {
    VideoProcessor.isNativeNvencAvailable().then(setIsNvencActive);
  }, []);

  // Modo de aplicação: true = aplica a todos os vídeos; false = edita somente o selecionado
  const [applyToAll, setApplyToAll] = useState<boolean>(true);

  // Aba ativa na coluna esquerda: "template" ou "editor" (Fila + Ajustes)
  const [activeLeftTab, setActiveLeftTab] = useState<"template" | "editor">("template");

  // Elemento selecionado no canvas de preview
  const [selectedCanvasElement, setSelectedCanvasElement] = useState<
    | "profile"
    | "pageName"
    | "badge"
    | "headline"
    | "subHeadline"
    | "watermark"
    | "video"
    | "background"
    | null
  >("headline");

  const handleSelectCanvasElement = (
    el:
      | "profile"
      | "pageName"
      | "badge"
      | "headline"
      | "subHeadline"
      | "watermark"
      | "video"
      | "background"
      | null,
  ) => {
    setSelectedCanvasElement(el);
    if (el === "video") {
      setActiveLeftTab("editor");
    } else if (el && activeLeftTab === "template") {
      // Mantém na aba template se estiver liberada
    }
  };

  // Recorte Automático Inteligente: analisa cada vídeo individualmente para isolar estritamente a filmagem e cortar templates
  const handleAutoCropVideoLayer = async () => {
    if (applyToAll && queue.length > 1) {
      // MODO EM MASSA (TODOS): Analisa CADA VÍDEO DA FILA INDIVIDUALMENTE!
      // Cada vídeo tem sua própria detecção personalizada baseada no seu conteúdo real.
      const updatedQueue = [...queue];

      for (let i = 0; i < updatedQueue.length; i++) {
        const item = updatedQueue[i];
        if (!item) continue;

        let detected = { cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0 };
        // Se for o vídeo atualmente em exibição na tela, usa o elemento <video> direto (instantâneo e perfeito)
        if (i === selectedIndex) {
          const videoEl = document.querySelector("video");
          if (videoEl && videoEl.videoWidth > 0) {
            detected = await VideoProcessor.detectActiveFootage(videoEl);
          } else {
            detected = await VideoProcessor.detectActiveFootageFromFile(item.file);
          }
        } else {
          detected = await VideoProcessor.detectActiveFootageFromFile(item.file);
        }

        const baseAdj = item.customAdjustment || globalAdjustment;
        updatedQueue[i] = {
          ...item,
          customAdjustment: {
            ...baseAdj,
            cropTop: detected.cropTop,
            cropBottom: detected.cropBottom,
            cropLeft: detected.cropLeft,
            cropRight: detected.cropRight,
            cropMode: "auto",
            videoX: baseAdj.videoX ?? 50,
            videoY: baseAdj.videoY ?? 53,
            videoWidth: baseAdj.videoWidth ?? 96,
          },
        };
      }

      setQueue(updatedQueue);

      // Atualiza o globalAdjustment com os metadados do vídeo atual para sincronia
      const currentUpdated = updatedQueue[selectedIndex]?.customAdjustment;
      if (currentUpdated) {
        setGlobalAdjustment((prev) => ({
          ...prev,
          videoX: currentUpdated.videoX ?? prev.videoX ?? 50,
          videoY: currentUpdated.videoY ?? prev.videoY ?? 53,
          videoWidth: currentUpdated.videoWidth ?? prev.videoWidth ?? 96,
          cropMode: "auto",
        }));
      }
    } else {
      // MODO INDIVIDUAL: Analisa apenas o vídeo atualmente selecionado
      const video = document.querySelector("video");
      let detected = { cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0 };
      if (video && video.videoWidth > 0) {
        detected = await VideoProcessor.detectActiveFootage(video);
      } else if (currentVideo) {
        detected = await VideoProcessor.detectActiveFootageFromFile(currentVideo.file);
      }

      const updatedAdjustment: VideoAdjustment = {
        ...activeAdjustment,
        cropTop: detected.cropTop,
        cropBottom: detected.cropBottom,
        cropLeft: detected.cropLeft,
        cropRight: detected.cropRight,
        cropMode: "auto",
        videoX: activeAdjustment.videoX ?? 50,
        videoY: activeAdjustment.videoY ?? 53,
        videoWidth: activeAdjustment.videoWidth ?? 96,
        zoom: activeAdjustment.zoom || 1.0,
      };

      setQueue((prev) =>
        prev.map((item, idx) =>
          idx === selectedIndex
            ? { ...item, customAdjustment: { ...updatedAdjustment } }
            : item,
        ),
      );
    }
  };

  // Estados do Modal de Processamento
  const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);
  const [processStatus, setProcessStatus] = useState<
    "idle" | "confirming" | "processing" | "finished" | "cancelled"
  >("idle");

  const [batchStartTime, setBatchStartTime] = useState<Date | null>(null);
  const [batchEndTime, setBatchEndTime] = useState<Date | null>(null);
  const [batchConcurrency, setBatchConcurrency] = useState<number>(5);

  const [processedResults, setProcessedResults] = useState<ProcessedVideoResult[]>([]);
  const [currentProcessingName, setCurrentProcessingName] = useState<string>("");
  const [currentVideoProgress, setCurrentVideoProgress] = useState<number>(0);
  const [overallProgress, setOverallProgress] = useState<number>(0);
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleDownloadVideo = (item: VideoQueueItem) => {
    if (!item.processedBlob) return;
    const isMp4 = item.processedBlob.type.includes("mp4");
    const itemIndex = queue.findIndex((q) => q.id === item.id);
    const num = itemIndex >= 0 ? itemIndex + 1 : 1;
    downloadBlob(item.processedBlob, getBatchFileName(num, isMp4 ? "mp4" : "webm"));
  };

  // Vídeo atualmente selecionado
  const currentVideo = queue[selectedIndex] || null;

  // Template e Ajuste ativos para o vídeo selecionado (respeita modo individual ou global)
  const activeTemplate = useMemo(() => {
    if (!applyToAll && currentVideo?.customTemplate) {
      return currentVideo.customTemplate;
    }
    return globalTemplate;
  }, [applyToAll, currentVideo, globalTemplate]);

  const activeAdjustment = useMemo<VideoAdjustment>(() => {
    if (currentVideo?.customAdjustment) {
      if (applyToAll) {
        // No modo Todos, preserva os cortes de margem (cropTop, cropBottom, etc.) individuais de CADA vídeo
        const res: VideoAdjustment = {
          ...globalAdjustment,
          ...currentVideo.customAdjustment,
          cropTop: currentVideo.customAdjustment.cropTop ?? globalAdjustment.cropTop ?? 0,
          cropBottom: currentVideo.customAdjustment.cropBottom ?? globalAdjustment.cropBottom ?? 0,
          cropLeft: currentVideo.customAdjustment.cropLeft ?? globalAdjustment.cropLeft ?? 0,
          cropRight: currentVideo.customAdjustment.cropRight ?? globalAdjustment.cropRight ?? 0,
          cropMode: currentVideo.customAdjustment.cropMode ?? globalAdjustment.cropMode,
        };
        return res;
      }
      return currentVideo.customAdjustment;
    }
    return globalAdjustment;
  }, [applyToAll, currentVideo, globalAdjustment]);

  // Atualização de Template
  const handleUpdateTemplate = (updated: TemplateVisual) => {
    if (applyToAll || !currentVideo) {
      setGlobalTemplate(updated);
      setQueue((prev) =>
        prev.map((item) => ({ ...item, customTemplate: { ...updated } })),
      );
    } else {
      setQueue((prev) =>
        prev.map((item, idx) =>
          idx === selectedIndex ? { ...item, customTemplate: updated } : item,
        ),
      );
    }
  };

  // Atualização de Ajustes de Vídeo (Sincroniza em massa ou individual)
  const handleUpdateAdjustment = (updated: VideoAdjustment) => {
    if (applyToAll) {
      setGlobalAdjustment(updated);
      setQueue((prev) =>
        prev.map((item, idx) => {
          if (idx === selectedIndex) {
            return { ...item, customAdjustment: { ...updated } };
          }
          // Para outros vídeos na fila: sincroniza parâmetros globais, mas PRESERVA os cortes únicos já detectados!
          const existing = item.customAdjustment;
          const merged: VideoAdjustment = {
            ...updated,
            cropTop: existing?.cropTop ?? updated.cropTop ?? 0,
            cropBottom: existing?.cropBottom ?? updated.cropBottom ?? 0,
            cropLeft: existing?.cropLeft ?? updated.cropLeft ?? 0,
            cropRight: existing?.cropRight ?? updated.cropRight ?? 0,
            cropMode: existing?.cropMode ?? updated.cropMode,
          };
          return {
            ...item,
            customAdjustment: merged,
          };
        }),
      );
    } else {
      setQueue((prev) =>
        prev.map((item, idx) =>
          idx === selectedIndex ? { ...item, customAdjustment: updated } : item,
        ),
      );
    }
  };

  // Aplica os ajustes do vídeo atual para todos os outros na fila
  const handleApplyCurrentToAll = () => {
    setGlobalAdjustment(activeAdjustment);
    setQueue((prev) =>
      prev.map((item) => ({ ...item, customAdjustment: { ...activeAdjustment } })),
    );
    setApplyToAll(true);
  };

  // Gerenciamento da Fila de Vídeos
  const handleAddFiles = (newItems: VideoQueueItem[]) => {
    setQueue((prev) => {
      const remaining = 100 - prev.length;
      return [...prev, ...newItems.slice(0, remaining)];
    });
  };

  const handleRemoveItem = (id: string) => {
    setQueue((prev) => {
      const next = prev.filter((item) => item.id !== id);
      if (selectedIndex >= next.length) {
        setSelectedIndex(Math.max(0, next.length - 1));
      }
      return next;
    });
  };

  const handleClearQueue = () => {
    setQueue([]);
    setSelectedIndex(0);
  };

  const handleMoveItem = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= queue.length) return;
    setQueue((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      if (moved) {
        updated.splice(toIndex, 0, moved);
      }
      return updated;
    });
    setSelectedIndex(toIndex);
  };

  // Presets de Template
  const handleSavePreset = (name: string) => {
    const newTpl: Template = {
      id: uid(),
      name,
      createdAt: new Date().toISOString(),
      preset: {
        aspect: "9:16",
        speed: 1,
        zoom: 0,
        mirror: false,
        removeAudio: false,
        fps: 30,
        crf: 22,
        trimStart: 0,
        trimEnd: 0,
        brightness: 0,
        saturation: 1,
        watermarkText: "",
        outputFormat: "mp4",
        outputDir: "",
      },
      visual: globalTemplate,
    };
    setSavedTemplates([...savedTemplates, newTpl]);
    alert(`Template "${name}" salvo com sucesso!`);
  };

  const handleLoadPreset = (tpl: TemplateVisual) => {
    setGlobalTemplate(tpl);
  };

  // INÍCIO DO PROCESSAMENTO EM MASSA
  const openConfirmation = () => {
    if (queue.length === 0) {
      alert("Por favor, adicione pelo menos um vídeo na fila antes de processar.");
      return;
    }
    setProcessStatus("confirming");
    setIsProcessModalOpen(true);
  };

  const startProcessingQueue = async () => {
    setProcessStatus("processing");
    setZipBlob(null);

    const startTime = new Date();
    setBatchStartTime(startTime);
    setBatchEndTime(null);
    VideoProcessor.clearOverlayCache();

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const total = queue.length;
    if (total === 0) return;

    // Coleta vídeos que já foram previamente concluídos (NÃO serão reprocessados!)
    const results: ProcessedVideoResult[] = [];
    queue.forEach((it, idx) => {
      if (it.status === "concluido" && it.processedBlob) {
        const isMp4 = it.processedBlob.type.includes("mp4");
        results.push({
          id: it.id,
          name: getBatchFileName(idx + 1, isMp4 ? "mp4" : "webm"),
          blob: it.processedBlob,
          sizeMB: Number((it.processedBlob.size / (1024 * 1024)).toFixed(1)),
        });
      }
    });

    let completedCount = results.length;
    setOverallProgress(Math.round((completedCount / total) * 100));

    // Processamento Paralelo Otimizado na RTX 3090 (5 em 5 ou 10 em 10 simultâneos)
    const CONCURRENCY = Math.max(1, batchConcurrency);

    const pendingIndices: number[] = [];
    for (let i = 0; i < total; i++) {
      const it = queue[i];
      if (it && !(it.status === "concluido" && it.processedBlob)) {
        pendingIndices.push(i);
      }
    }

    const processItemIndex = async (i: number) => {
      if (signal.aborted) return;
      const item = queue[i];
      if (!item) return;

      setCurrentProcessingName(item.name);

      // Marca o item como processando
      setQueue((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: "processando", progress: 0 } : it))
      );

      const baseAdj = item.customAdjustment || globalAdjustment;
      const adjToUse: VideoAdjustment = {
        ...globalAdjustment,
        ...baseAdj,
        cropTop: item.customAdjustment?.cropTop ?? globalAdjustment.cropTop ?? 0,
        cropBottom: item.customAdjustment?.cropBottom ?? globalAdjustment.cropBottom ?? 0,
        cropLeft: item.customAdjustment?.cropLeft ?? globalAdjustment.cropLeft ?? 0,
        cropRight: item.customAdjustment?.cropRight ?? globalAdjustment.cropRight ?? 0,
        cropMode: item.customAdjustment?.cropMode ?? globalAdjustment.cropMode ?? "auto",
      };
      const tplToUse = item.customTemplate || globalTemplate;

      try {
        // Renderização ultra-rápida via GPU NVIDIA NVENC ou WebCodecs
        const blob = await VideoProcessor.processVideo(
          item.file,
          adjToUse,
          tplToUse,
          (progress) => {
            setCurrentVideoProgress(progress);
            setQueue((prev) => {
              const updated = prev.map((it) => (it.id === item.id ? { ...it, progress } : it));
              const totalSum = updated.reduce((acc, curr) => {
                if (curr.status === "concluido") return acc + 100;
                if (curr.status === "processando") return acc + (curr.progress || 0);
                return acc;
              }, 0);
              setOverallProgress(Math.round(totalSum / (total || 1)));
              return updated;
            });
          },
          signal,
        );

        const isMp4 = blob.type.includes("mp4");
        const itemNumber = i + 1;
        const filename = getBatchFileName(itemNumber, isMp4 ? "mp4" : "webm");
        const processedMB = Number((blob.size / (1024 * 1024)).toFixed(1));

        const resultItem: ProcessedVideoResult = {
          id: item.id,
          name: filename,
          blob,
          sizeMB: processedMB,
        };

        results.push(resultItem);
        completedCount++;

        // MARCA COMO CONCLUÍDO COM CHECK VERDE POSITIVO E SALVA O BLOB PARA DOWNLOAD IMEDIATO
        setQueue((prev) => {
          const updated: VideoQueueItem[] = prev.map((it) =>
            it.id === item.id
              ? { ...it, status: "concluido" as const, progress: 100, processedBlob: blob, sizeMB: processedMB }
              : it
          );
          const totalSum = updated.reduce((acc, curr) => {
            if (curr.status === "concluido") return acc + 100;
            if (curr.status === "processando") return acc + (curr.progress || 0);
            return acc;
          }, 0);
          setOverallProgress(Math.round(totalSum / (total || 1)));
          return updated;
        });
        setCurrentVideoProgress(100);
      } catch (err: any) {
        if (signal.aborted) return;
        console.error(`Erro ao processar vídeo ${item.name}:`, err);
        setQueue((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? { ...it, status: "erro", errorMessage: err?.message || "Falha na renderização" }
              : it
          )
        );
      }
    };

    let nextIdx = 0;
    const workerCount = Math.min(CONCURRENCY, pendingIndices.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (nextIdx < pendingIndices.length && !signal.aborted) {
        const idx = pendingIndices[nextIdx++];
        if (typeof idx === "number") {
          await processItemIndex(idx);
        }
      }
    });

    await Promise.all(workers);

    setProcessedResults(results);

    // Se houver vídeos concluídos (mesmo se cancelado o restante), gera o arquivo ZIP consolidado
    if (results.length > 0) {
      try {
        const zip = await VideoProcessor.createZipArchive(results);
        setZipBlob(zip);
      } catch (zipErr) {
        console.error("Erro ao gerar arquivo ZIP consolidado:", zipErr);
      }
    }

    const endTime = new Date();
    setBatchEndTime(endTime);

    if (signal.aborted) {
      setProcessStatus("cancelled");
    } else {
      setProcessStatus("finished");
    }
  };

  const handleCancelProcessing = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleRetryFailed = () => {
    // Filtra apenas os que estão com status erro e reinicia
    startProcessingQueue();
  };

  const handleClearTempFiles = () => {
    setProcessedResults([]);
    setZipBlob(null);
    setQueue((prev) =>
      prev.map((it) => ({ ...it, status: "pendente", progress: 0, processedBlob: undefined })),
    );
  };

  // Contadores de status
  const successCount = queue.filter((i) => i.status === "concluido").length;
  const errorCount = queue.filter((i) => i.status === "erro").length;

  return (
    <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8 space-y-4">
      {/* Topo do Video Flash */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Video Flash
            </h1>
            <span className="rounded-full bg-primary/10 border border-primary/30 px-2.5 py-0.5 text-[11px] font-mono text-primary font-semibold">
              9:16 Vertical
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Renderização em massa acelerada por hardware na GPU com templates e corte de alta precisão.
          </p>
        </div>

        {/* Botão Principal de Processamento */}
        <div className="flex items-center gap-3">
          {isNvencActive ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              NVIDIA RTX 3090 (NVENC 4x Ativo)
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-medium">
              GPU WebCodecs Ativa
            </div>
          )}
          <Button
            size="default"
            onClick={openConfirmation}
            disabled={queue.length === 0}
            className="font-semibold shadow-lg gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Sparkles className="size-4" />
            Processar Vídeos ({queue.length})
          </Button>
        </div>
      </div>

      {/* ESTRUTURA PRINCIPAL EM DUAS COLUNAS */}
      <div className="grid gap-6 lg:grid-cols-[28rem_minmax(0,1fr)] xl:grid-cols-[30rem_minmax(0,1fr)]">
        {/* COLUNA DA ESQUERDA: Painel de Configuração */}
        <div className="flex flex-col gap-4 rounded-xl border border-border/80 bg-card p-5 shadow-sm min-h-[640px]">
          {/* Navegação entre as 2 Abas: Template vs Editor */}
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-secondary/30 p-1">
            <button
              type="button"
              onClick={() => setActiveLeftTab("template")}
              className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition ${
                activeLeftTab === "template"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              }`}
            >
              <Layers className="size-3.5" /> Template
            </button>
            <button
              type="button"
              onClick={() => setActiveLeftTab("editor")}
              className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition ${
                activeLeftTab === "editor"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              }`}
            >
              <Sliders className="size-3.5" /> Editor ({queue.length})
            </button>
          </div>

          {/* Conteúdo da Aba Selecionada */}
          <div className="flex-1 overflow-y-auto scrollbar-slim pr-1 max-h-[620px]">
            {activeLeftTab === "template" && (
              <TemplatePanel
                template={activeTemplate}
                onChange={handleUpdateTemplate}
                onSavePreset={handleSavePreset}
                savedTemplates={savedTemplates}
                onLoadPreset={handleLoadPreset}
                activeSection={
                  selectedCanvasElement && selectedCanvasElement !== "video"
                    ? selectedCanvasElement
                    : "headline"
                }
                onSectionChange={(sec) => setSelectedCanvasElement(sec)}
                onProceedToEditor={() => setActiveLeftTab("editor")}
              />
            )}

            {activeLeftTab === "editor" && (
              <EditorTabPanel
                queue={queue}
                selectedIndex={selectedIndex}
                onSelectIndex={setSelectedIndex}
                onAddFiles={handleAddFiles}
                onRemoveItem={handleRemoveItem}
                onClearQueue={handleClearQueue}
                onMoveItem={handleMoveItem}
                disabled={processStatus === "processing"}
                adjustment={activeAdjustment}
                onUpdateAdjustment={handleUpdateAdjustment}
                template={activeTemplate}
                applyToAll={applyToAll}
                onToggleApplyToAll={setApplyToAll}
                onAutoCropToTemplate={handleAutoCropVideoLayer}
                onApplyCurrentToAll={handleApplyCurrentToAll}
                onUpdateQueue={setQueue}
                onDownloadVideo={handleDownloadVideo}
              />
            )}
          </div>

          {/* Rodapé da Coluna Esquerda com Botão de Ação Rápida */}
          <div className="border-t border-border/60 pt-4 mt-auto">
            <Button
              type="button"
              onClick={openConfirmation}
              disabled={queue.length === 0}
              className="w-full font-semibold shadow-md gap-2"
            >
              <Sparkles className="size-4" />
              Processar {queue.length} vídeo{queue.length === 1 ? "" : "s"} em lote
            </Button>
          </div>
        </div>

        {/* COLUNA DA DIREITA: Preview do Vídeo com Canvas 9:16 */}
        <div className="min-h-[640px]">
          <VideoCanvasPreview
            currentVideo={currentVideo}
            currentIndex={selectedIndex}
            totalVideos={queue.length}
            template={activeTemplate}
            adjustment={activeAdjustment}
            applyToAll={applyToAll}
            onToggleApplyToAll={setApplyToAll}
            onNavigate={setSelectedIndex}
            onUpdateTemplate={handleUpdateTemplate}
            onUpdateAdjustment={handleUpdateAdjustment}
            selectedElement={selectedCanvasElement}
            onSelectElement={handleSelectCanvasElement}
            isTemplateLocked={activeLeftTab === "editor"}
            onRequestEditTemplate={() => setActiveLeftTab("template")}
          />
        </div>
      </div>

      {/* MODAL DE PROCESSAMENTO EM MASSA */}
      <BatchProcessingModal
        open={isProcessModalOpen}
        onOpenChange={setIsProcessModalOpen}
        status={processStatus}
        totalVideos={queue.length}
        processedCount={successCount}
        errorCount={errorCount}
        currentVideoName={currentProcessingName}
        currentVideoProgress={currentVideoProgress}
        overallProgress={overallProgress}
        templateName={globalTemplate.name}
        zipBlob={zipBlob}
        queue={queue}
        startTime={batchStartTime}
        endTime={batchEndTime}
        concurrency={batchConcurrency}
        onConcurrencyChange={setBatchConcurrency}
        onDownloadVideo={handleDownloadVideo}
        onConfirmStart={startProcessingQueue}
        onCancelProcessing={handleCancelProcessing}
        onRetryFailed={handleRetryFailed}
        onClearTempFiles={handleClearTempFiles}
      />
    </div>
  );
}
