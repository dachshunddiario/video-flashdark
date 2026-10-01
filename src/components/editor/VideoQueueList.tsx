import { useRef } from "react";
import {
  Upload,
  Trash2,
  ArrowUp,
  ArrowDown,
  Film,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  HardDrive,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { type VideoQueueItem } from "@/lib/types";
import { VideoProcessor, getBatchFileName } from "@/lib/video-processor";
import { uid } from "@/lib/local-store";
import { downloadBlob } from "@/lib/zip-utils";

interface VideoQueueListProps {
  queue: VideoQueueItem[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onAddFiles: (newItems: VideoQueueItem[]) => void;
  onRemoveItem: (id: string) => void;
  onClearQueue: () => void;
  onMoveItem: (fromIndex: number, toIndex: number) => void;
  disabled?: boolean;
  onDownloadVideo?: (item: VideoQueueItem) => void;
}

export function VideoQueueList({
  queue,
  selectedIndex,
  onSelectIndex,
  onAddFiles,
  onRemoveItem,
  onClearQueue,
  onMoveItem,
  disabled = false,
  onDownloadVideo,
}: VideoQueueListProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Limite máximo de até 100 vídeos
    const remainingSlots = 100 - queue.length;
    if (remainingSlots <= 0) {
      alert("Limite de 100 vídeos atingido.");
      return;
    }

    const filesArray = Array.from(files).slice(0, remainingSlots);

    // Converte para QueueItems imediatos
    const newItems: VideoQueueItem[] = filesArray.map((file, idx) => ({
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

    // Extrai miniaturas e durações em segundo plano sem travar a interface
    for (const item of newItems) {
      try {
        const meta = await VideoProcessor.extractMetadata(item.file);
        item.thumbnailUrl = meta.thumbnailUrl;
        item.durationSec = meta.durationSec;
      } catch (err) {
        console.warn("Falha ao extrair metadados para:", item.name, err);
      }
    }

    // Limpa o valor do input para permitir selecionar os mesmos arquivos novamente se necessário
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatDuration = (sec: number) => {
    if (!sec) return "--:--";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-3">
      {/* Topo da Lista com Contador e Botões */}
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <Film className="size-4 text-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Fila de Vídeos
          </h3>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-mono font-medium ${
              queue.length >= 100
                ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                : "bg-secondary text-muted-foreground border border-border"
            }`}
          >
            {queue.length}/100 vídeos
          </span>
        </div>

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
              Limpar todos
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
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || queue.length >= 100}
            className="h-7 text-xs font-semibold gap-1.5"
          >
            <Upload className="size-3" /> Adicionar vídeos
          </Button>
        </div>
      </div>

      {/* Lista de Vídeos na Fila */}
      {queue.length === 0 ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="rounded-xl border border-dashed border-border/80 bg-secondary/10 p-8 text-center cursor-pointer hover:bg-secondary/20 transition"
        >
          <Film className="mx-auto size-8 text-muted-foreground/60 mb-2" />
          <p className="text-xs font-medium text-foreground">Nenhum vídeo adicionado</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Clique aqui ou no botão acima para selecionar até 100 vídeos (MP4, MOV, WEBM).
          </p>
        </div>
      ) : (
        <div className="max-h-[320px] overflow-y-auto scrollbar-slim space-y-2 pr-1">
          {queue.map((item, index) => {
            const isSelected = selectedIndex === index;
            const indexPadded = String(index + 1).padStart(2, "0");

            return (
              <div
                key={item.id}
                onClick={() => onSelectIndex(index)}
                className={`group flex items-center justify-between gap-3 rounded-lg border p-2 text-xs transition cursor-pointer ${
                  isSelected
                    ? "border-primary/60 bg-primary/10 shadow-sm"
                    : "border-border bg-secondary/20 hover:bg-secondary/40"
                }`}
              >
                {/* Lado Esquerdo: Número, Miniatura e Informações */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {/* Número */}
                  <span className="font-mono text-[11px] font-bold text-muted-foreground w-5 text-center">
                    {indexPadded}
                  </span>

                  {/* Thumbnail */}
                  <div className="size-10 rounded overflow-hidden bg-black/60 border border-border/80 shrink-0 flex items-center justify-center">
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt="Thumb"
                        className="size-full object-cover"
                      />
                    ) : (
                      <Film className="size-4 text-muted-foreground/40" />
                    )}
                  </div>

                  {/* Nome e Metadados */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground text-xs" title={item.name}>
                      {indexPadded} — {item.name}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <Clock className="size-2.5" />
                        {formatDuration(item.durationSec)}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <HardDrive className="size-2.5" />
                        {item.sizeMB} MB
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status e Ações */}
                <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {/* Status do Vídeo */}
                  {item.status === "processando" && (
                    <span className="flex items-center gap-1 text-[11px] font-mono text-primary font-medium">
                      <Loader2 className="size-3 animate-spin" />
                      {item.progress}%
                    </span>
                  )}
                  {item.status === "concluido" && (
                    <div className="flex items-center gap-1">
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold shadow-xs"
                        title="Processado com sucesso"
                      >
                        <CheckCircle2 className="size-3 text-emerald-400" />
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
                              downloadBlob(item.processedBlob, getBatchFileName(index + 1, isMp4 ? "mp4" : "webm"));
                            }
                          }}
                          className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-semibold flex items-center gap-1 transition-colors shadow-xs"
                          title="Baixar este vídeo"
                        >
                          <Download className="size-3" />
                          <span>Baixar</span>
                        </button>
                      )}
                    </div>
                  )}
                  {item.status === "erro" && (
                    <span title={item.errorMessage || "Erro"}>
                      <AlertCircle className="size-4 text-rose-400" />
                    </span>
                  )}

                  {/* Botões Reordenar e Excluir */}
                  {!disabled && (
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                      <button
                        type="button"
                        onClick={() => onMoveItem(index, index - 1)}
                        disabled={index === 0}
                        className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-20"
                        title="Mover para cima"
                      >
                        <ArrowUp className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onMoveItem(index, index + 1)}
                        disabled={index === queue.length - 1}
                        className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-20"
                        title="Mover para baixo"
                      >
                        <ArrowDown className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveItem(item.id)}
                        className="p-1 text-muted-foreground hover:text-destructive"
                        title="Remover vídeo"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
