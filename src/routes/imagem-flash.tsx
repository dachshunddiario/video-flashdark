import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  type ImageFlashAdjustment,
  type ImageQueueItem,
  type TemplateVisual,
  type ImageCropConfig,
  DEFAULT_IMAGE_ADJUSTMENT,
  DEFAULT_TEMPLATE_VISUAL,
} from "@/lib/types";
import { ImageProcessor } from "@/lib/image-processor";
import { downloadBlob } from "@/lib/zip-utils";
import { formatBatchDate } from "@/lib/video-processor";
import { STORAGE_KEYS, useLocalState, uid } from "@/lib/local-store";
import { ImageCanvasPreview } from "@/components/image-flash/ImageCanvasPreview";
import { ImageTemplatePanel } from "@/components/image-flash/ImageTemplatePanel";
import { ImageEditorPanel } from "@/components/image-flash/ImageEditorPanel";
import { ImageCropModal } from "@/components/image-flash/ImageCropModal";
import {
  Sparkles,
  Sliders,
  Palette,
  Download,
  CheckCircle2,
  HardDrive,
  Instagram,
} from "lucide-react";

export const Route = createFileRoute("/imagem-flash")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Imagem Flash · Modelagem de Imagens em Massa para Instagram" },
      {
        name: "description",
        content:
          "Crie e modele imagens em massa com molduras, títulos e cabeçalhos para o Instagram (4:5, 1:1 e 9:16) com download ultra-rápido.",
      },
    ],
  }),
  component: ImagemFlashPage,
});

function ImagemFlashPage() {
  // Estado persistido de template e ajustes
  const { value: template, setValue: setTemplate } = useLocalState<TemplateVisual>(
    STORAGE_KEYS.imageFlashTemplate,
    {
      ...DEFAULT_TEMPLATE_VISUAL,
      name: "Template Imagem Flash",
      headline: {
        ...DEFAULT_TEMPLATE_VISUAL.headline,
        fontSize: 32,
        text: "O que o seu cão faz quando você sai de casa?",
      },
      subHeadline: {
        ...DEFAULT_TEMPLATE_VISUAL.subHeadline,
        fontSize: 18,
        text: "Arraste para o lado e confira os detalhes...",
      },
      pageName: {
        ...DEFAULT_TEMPLATE_VISUAL.pageName,
        text: "@dachshunddiario",
        fontSize: 22,
      },
      background: {
        color: "#0D0E15",
        type: "solid",
      },
    },
  );

  const { value: adjustment, setValue: setAdjustment } = useLocalState<ImageFlashAdjustment>(
    STORAGE_KEYS.imageFlashPrefs,
    DEFAULT_IMAGE_ADJUSTMENT,
  );

  // Fila de imagens em memória local (não precisa recodificar em vídeo, processa direto em Blob)
  const [queue, setQueue] = useState<ImageQueueItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<"editor" | "template">("editor");
  const [cropModalOpen, setCropModalOpen] = useState(false);

  // Atualizar recorte manual (individual ou para toda a fila)
  const handleUpdateItemCrop = (crop: ImageCropConfig, applyToAll: boolean) => {
    if (applyToAll) {
      setQueue((prev) =>
        prev.map((item) => ({
          ...item,
          crop,
        })),
      );
      setAdjustment((prev) => ({
        ...prev,
        crop,
      }));
    } else {
      setQueue((prev) =>
        prev.map((item, idx) =>
          idx === selectedIndex
            ? {
                ...item,
                crop,
              }
            : item,
        ),
      );
      setAdjustment((prev) => ({
        ...prev,
        crop,
      }));
    }
    setCropModalOpen(false);
  };

  // Templates salvos no backend local
  const [savedTemplates, setSavedTemplates] = useState<{ name: string; template: TemplateVisual }[]>([]);

  // Estado de processamento em lote
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [lastExportCount, setLastExportCount] = useState<number | null>(null);

  // Carrega lista de templates salvos no backend
  const fetchSavedTemplates = async () => {
    try {
      const res = await fetch("/api/templates");
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.templates)) {
          const list = data.templates
            .map((t: any) => ({
              name: t.name || t.file?.replace(/\.json$/, "") || "Template",
              template: t.template || t,
            }))
            .filter((t: any) => t.template && typeof t.template === "object");
          setSavedTemplates(list);
        }
      }
    } catch {
      // Offline fallback
    }
  };

  useEffect(() => {
    fetchSavedTemplates();
  }, []);

  // Adicionar imagens em lote
  const handleAddImages = (files: File[]) => {
    const newItems: ImageQueueItem[] = files.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      return {
        id: uid(),
        file,
        name: file.name,
        sizeMB: Math.round((file.size / (1024 * 1024)) * 100) / 100,
        previewUrl,
        width: 1080,
        height: 1350,
        status: "idle",
      };
    });

    setQueue((prev) => [...prev, ...newItems]);
    if (queue.length === 0 && newItems.length > 0) {
      setSelectedIndex(0);
    }
  };

  const handleRemoveItem = (id: string) => {
    setQueue((prev) => {
      const filtered = prev.filter((item) => item.id !== id);
      if (selectedIndex >= filtered.length) {
        setSelectedIndex(Math.max(0, filtered.length - 1));
      }
      return filtered;
    });
  };

  const handleClearQueue = () => {
    queue.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setQueue([]);
    setSelectedIndex(0);
  };

  // Salvar template na pasta do projeto via /api/templates
  const handleSaveTemplate = async (name: string) => {
    const cleanName = name.trim();
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName,
          template: { ...template, name: cleanName },
        }),
      });
      if (res.ok) {
        await fetchSavedTemplates();
      }
    } catch (err) {
      console.error("Erro ao salvar template:", err);
    }
  };

  // Deletar template
  const handleDeleteTemplate = async (name: string) => {
    try {
      const res = await fetch(`/api/templates?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchSavedTemplates();
      }
    } catch (err) {
      console.error("Erro ao deletar template:", err);
    }
  };

  // Baixar imagem individual selecionada
  const handleExportCurrent = async () => {
    const current = queue[selectedIndex];
    if (!current) return;

    try {
      setIsProcessing(true);
      setProgressMessage("Renderizando imagem...");
      const blob = await ImageProcessor.renderImage(
        current.file,
        adjustment,
        template,
        undefined,
        undefined,
        current.crop,
      );
      const dateStr = formatBatchDate();
      downloadBlob(blob, `Imagem_${current.name.replace(/\.[^/.]+$/, "")}_${dateStr}.png`);
    } catch (err) {
      console.error("Erro ao exportar:", err);
    } finally {
      setIsProcessing(false);
      setProgressMessage("");
    }
  };

  // Exportar todas em ZIP
  const handleExportAll = async () => {
    if (queue.length === 0) return;

    setIsProcessing(true);
    setProgressCurrent(0);
    setProgressTotal(queue.length);
    setProgressMessage("Iniciando modelagem das imagens...");

    try {
      const results = await ImageProcessor.renderBatch(
        queue,
        adjustment,
        template,
        (curr, total, msg) => {
          setProgressCurrent(curr);
          setProgressTotal(total);
          setProgressMessage(msg);
        },
      );

      await ImageProcessor.downloadBatchAsZip(
        results,
        `Lote_Imagens_Instagram_${formatBatchDate()}.zip`,
      );

      setLastExportCount(results.length);
      setTimeout(() => setLastExportCount(null), 5000);
    } catch (err) {
      console.error("Erro no lote de imagens:", err);
    } finally {
      setIsProcessing(false);
      setProgressMessage("");
    }
  };

  const currentItem = queue[selectedIndex] ?? null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Topo do Imagem Flash */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/80 px-4 sm:px-6 bg-card/60 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
            <Instagram className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-tight text-foreground">
                Imagem Flash
              </h1>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                100% Local · Sem Limites
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground hidden sm:block">
              Modelagem em lote para Feed 4:5, 1:1 e Stories do Instagram
            </p>
          </div>
        </div>

        {/* Notificação de sucesso de download */}
        {lastExportCount !== null && (
          <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 text-xs text-emerald-300 animate-in fade-in">
            <CheckCircle2 className="size-3.5" />
            <span>{lastExportCount} imagens baixadas no arquivo ZIP!</span>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <HardDrive className="size-3.5" />
          <span className="hidden md:inline">Processamento no navegador</span>
        </div>
      </header>

      {/* Conteúdo Central Dividido */}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Lado Esquerdo (Controles e Abas) */}
        <div className="lg:col-span-6 xl:col-span-5 flex flex-col border-r border-border/80 bg-card/40 p-4 sm:p-5 overflow-hidden">
          {/* Navegação entre Abas Principais: Editor vs Template */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-secondary/40 rounded-xl border border-border/70 mb-4 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab("editor")}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition ${
                activeTab === "editor"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Sliders className="size-3.5" /> Editor & Fila ({queue.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("template")}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition ${
                activeTab === "template"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Palette className="size-3.5" /> Template do Post
            </button>
          </div>

          {/* Painel da Aba Selecionada */}
          <div className="flex-1 overflow-hidden">
            {activeTab === "editor" ? (
              <ImageEditorPanel
                queue={queue}
                selectedIndex={selectedIndex}
                onSelectIndex={setSelectedIndex}
                onAddImages={handleAddImages}
                onRemoveItem={handleRemoveItem}
                onClearQueue={handleClearQueue}
                adjustment={adjustment}
                onUpdateAdjustment={setAdjustment}
                onUpdateItemCrop={handleUpdateItemCrop}
                onOpenCropModal={() => setCropModalOpen(true)}
                onExportAll={handleExportAll}
                onExportCurrent={handleExportCurrent}
                isProcessing={isProcessing}
                progressCurrent={progressCurrent}
                progressTotal={progressTotal}
                progressMessage={progressMessage}
              />
            ) : (
              <ImageTemplatePanel
                template={template}
                onUpdateTemplate={setTemplate}
                onSaveTemplate={handleSaveTemplate}
                savedTemplates={savedTemplates}
                onDeleteTemplate={handleDeleteTemplate}
              />
            )}
          </div>
        </div>

        {/* Lado Direito: Preview em Tempo Real do Post no Instagram */}
        <div className="lg:col-span-6 xl:col-span-7 flex flex-col items-center justify-center bg-black/30 p-4 overflow-y-auto">
          <ImageCanvasPreview
            currentImage={currentItem}
            adjustment={adjustment}
            template={template}
            className="w-full max-w-[520px]"
          />
        </div>
      </div>

      {/* Modal Interativo de Recorte Manual da Imagem */}
      <ImageCropModal
        isOpen={cropModalOpen}
        onClose={() => setCropModalOpen(false)}
        imageItem={currentItem}
        initialCrop={currentItem?.crop ?? adjustment.crop}
        onApplyCrop={handleUpdateItemCrop}
        queueLength={queue.length}
      />
    </div>
  );
}
