import { useState, useEffect } from "react";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  XCircle,
  RotateCcw,
  Sparkles,
  FileArchive,
  Trash2,
  HardDrive,
  Zap,
  Clock,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/zip-utils";
import { type VideoQueueItem } from "@/lib/types";
import { getBatchFileName, formatBatchDate } from "@/lib/video-processor";

function formatTimeHHMMSS(date: Date | null | undefined): string {
  if (!date) return "--:--:--";
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDurationSeconds(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

interface BatchProcessingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: "idle" | "confirming" | "processing" | "finished" | "cancelled";
  totalVideos: number;
  processedCount: number;
  errorCount: number;
  currentVideoName: string;
  currentVideoProgress: number;
  overallProgress: number;
  templateName: string;
  zipBlob: Blob | null;
  queue: VideoQueueItem[];
  startTime?: Date | null;
  endTime?: Date | null;
  concurrency?: number;
  onConcurrencyChange?: (concurrency: number) => void;
  onDownloadVideo?: (item: VideoQueueItem) => void;
  onConfirmStart: () => void;
  onCancelProcessing: () => void;
  onRetryFailed: () => void;
  onClearTempFiles: () => void;
}

export function BatchProcessingModal({
  open,
  onOpenChange,
  status,
  totalVideos,
  processedCount,
  errorCount,
  currentVideoName,
  currentVideoProgress,
  overallProgress,
  templateName,
  zipBlob,
  queue,
  startTime,
  endTime,
  concurrency = 5,
  onConcurrencyChange,
  onDownloadVideo,
  onConfirmStart,
  onCancelProcessing,
  onRetryFailed,
  onClearTempFiles,
}: BatchProcessingModalProps) {
  const [liveElapsedSeconds, setLiveElapsedSeconds] = useState(0);

  useEffect(() => {
    if (status !== "processing" || !startTime) {
      return undefined;
    }
    const updateTimer = () => {
      const diff = Math.max(0, Math.floor((Date.now() - startTime.getTime()) / 1000));
      setLiveElapsedSeconds(diff);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [status, startTime]);

  const handleDownloadZip = () => {
    if (!zipBlob) return;
    const dateStr = formatBatchDate();
    downloadBlob(zipBlob, `Lote_${dateStr}.zip`);
  };

  const handleDownloadSingle = (item: VideoQueueItem) => {
    if (onDownloadVideo) {
      onDownloadVideo(item);
    } else if (item.processedBlob) {
      const isMp4 = item.processedBlob.type.includes("mp4");
      const itemIndex = queue.findIndex((q) => q.id === item.id);
      const num = itemIndex >= 0 ? itemIndex + 1 : 1;
      downloadBlob(item.processedBlob, getBatchFileName(num, isMp4 ? "mp4" : "webm"));
    }
  };

  // Contagem de vídeos que possuem blob pronto para download
  const readyToDownloadCount = queue.filter((i) => i.status === "concluido" && i.processedBlob).length;
  const remainingCount = totalVideos - readyToDownloadCount;
  const activeProcessingCount = queue.filter((i) => i.status === "processando").length;

  const totalDurationSeconds = startTime && endTime
    ? Math.max(1, Math.round((endTime.getTime() - startTime.getTime()) / 1000))
    : liveElapsedSeconds > 0
    ? liveElapsedSeconds
    : 0;

  const avgSecondsPerVideo = readyToDownloadCount > 0 && totalDurationSeconds > 0
    ? (totalDurationSeconds / readyToDownloadCount).toFixed(1)
    : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        // Impede fechar clicando fora durante o processamento ativo
        if (status === "processing") return;
        onOpenChange(val);
      }}
    >
      <DialogContent className="sm:max-w-[600px] max-h-[88vh] flex flex-col p-6 overflow-hidden">
        {/* ETAPA 1: CONFIRMAÇÃO ANTES DE INICIAR */}
        {status === "confirming" && (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Sparkles className="size-5 text-primary" />
                Renderização Paralela em Massa (RTX 3090)
              </DialogTitle>
              <DialogDescription className="text-xs">
                Processamento simultâneo na GPU com aceleração NVIDIA NVENC e 96GB de RAM.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-3 text-xs">
              <div className="flex justify-between border-b border-border/40 pb-2">
                <span className="text-muted-foreground">Total de vídeos na fila:</span>
                <span className="font-semibold text-foreground font-mono">{totalVideos} vídeos</span>
              </div>

              {readyToDownloadCount > 0 && (
                <div className="flex justify-between border-b border-border/40 pb-2 bg-emerald-500/10 p-2 rounded-md border border-emerald-500/20 text-emerald-400">
                  <span>Já concluídos anteriormente:</span>
                  <span className="font-bold font-mono">{readyToDownloadCount} prontos (não serão reprocessados)</span>
                </div>
              )}

              <div className="flex justify-between border-b border-border/40 pb-2">
                <span className="text-muted-foreground">Restantes a processar agora:</span>
                <span className="font-semibold text-primary font-mono">{remainingCount} vídeos</span>
              </div>

              {/* Seletor de Concorrência: 5 em 5 ou 10 em 10 */}
              <div className="flex items-center justify-between border-b border-border/40 pb-2">
                <div>
                  <span className="font-semibold text-foreground block">Vídeos de uma só vez:</span>
                  <span className="text-[10px] text-muted-foreground">Quantos renderizar ao mesmo tempo</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onConcurrencyChange?.(5)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                      concurrency === 5
                        ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/40"
                        : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                  >
                    <Zap className="size-3 text-amber-300" /> 5 em 5
                  </button>
                  <button
                    type="button"
                    onClick={() => onConcurrencyChange?.(10)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                      concurrency === 10
                        ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/40"
                        : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                  >
                    <Sparkles className="size-3 text-amber-300" /> 10 em 10
                  </button>
                </div>
              </div>

              <div className="flex justify-between border-b border-border/40 pb-2">
                <span className="text-muted-foreground">Formato final:</span>
                <span className="font-semibold text-foreground">9:16 Vertical (Reels / Shorts / TikTok)</span>
              </div>

              <div className="flex justify-between border-b border-border/40 pb-2">
                <span className="text-muted-foreground">Template selecionado:</span>
                <span className="font-semibold text-foreground truncate max-w-[240px]">{templateName}</span>
              </div>

              {/* Informação de Aceleração Paralela GPU + RAM */}
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center gap-2 text-primary font-semibold text-xs">
                  <Zap className="size-4 text-amber-400" />
                  <span>Potência Máxima: {concurrency} Vídeos Simultâneos (RTX 3090 + RAM 96GB)</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Os vídeos são codificados em paralelo através dos canais de hardware NVENC da NVIDIA RTX 3090, explorando a força máxima dos 96GB de RAM para entregar o lote completo na maior velocidade possível.
                </p>
                <div className="flex items-center gap-2 pt-0.5 text-[11px] text-emerald-400">
                  <HardDrive className="size-3.5 shrink-0" />
                  <span>Download liberado individualmente conforme cada vídeo finaliza.</span>
                </div>
              </div>
            </div>

            <DialogFooter className="mt-4 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Voltar
              </Button>
              <Button
                type="button"
                onClick={onConfirmStart}
                className="font-semibold shadow-md gap-1.5"
              >
                <Zap className="size-4 text-amber-300" />
                {readyToDownloadCount > 0 ? `Continuar (${concurrency} em paralelo)` : `Iniciar Renderização (${concurrency} de uma vez)`}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ETAPA 2: PROCESSANDO EM TEMPO REAL */}
        {status === "processing" && (
          <div className="space-y-4 flex flex-col flex-1 overflow-hidden">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Loader2 className="size-5 animate-spin text-primary" />
                  Renderizando {activeProcessingCount > 0 ? `${activeProcessingCount} vídeos` : "em lote"} simultaneamente
                </DialogTitle>
                <span className="flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-mono text-amber-300 font-semibold">
                  <Zap className="size-3" /> {concurrency}x Paralelo GPU
                </span>
              </div>
              <DialogDescription className="text-xs">
                Múltiplos vídeos estão sendo processados em paralelo. Conforme cada um finaliza, o botão de download é liberado imediatamente.
              </DialogDescription>
            </DialogHeader>

            {/* Barra de Progresso Geral */}
            <div className="rounded-xl border border-border bg-secondary/30 p-3.5 space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-foreground">
                  Progresso Geral do Lote
                </span>
                <span className="font-mono text-primary font-bold">{overallProgress}%</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden border border-border">
                <div
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                <span>
                  Concluídos: <strong className="text-emerald-400 font-mono">{readyToDownloadCount}</strong> de {totalVideos}
                </span>
                <span className="text-primary font-medium">
                  {activeProcessingCount} em execução paralela
                </span>
              </div>
            </div>

            {/* Cronômetro e Horário de Início em Tempo Real */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-border/60 bg-secondary/20 px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                  <Clock className="size-3.5 text-primary" />
                  <span>Início:</span>
                </div>
                <span className="font-mono font-bold text-foreground text-xs">{formatTimeHHMMSS(startTime)}</span>
              </div>
              <div className="rounded-lg border border-border/60 bg-secondary/20 px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                  <Zap className="size-3.5 text-amber-400" />
                  <span>Tempo Decorrido:</span>
                </div>
                <span className="font-mono font-bold text-amber-300 text-xs">{formatDurationSeconds(liveElapsedSeconds)}</span>
              </div>
            </div>

            {/* Lista dos Vídeos com Contador de % e Botão de Download ao lado */}
            <div className="flex-1 overflow-hidden flex flex-col border border-border/80 rounded-xl bg-secondary/10">
              <div className="px-3 py-2 border-b border-border/60 bg-secondary/20 flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <span>Vídeos da Fila ({queue.length})</span>
                <span>% e Download</span>
              </div>

              <div className="overflow-y-auto max-h-[220px] p-2 space-y-1.5 scrollbar-slim">
                {queue.map((item, idx) => {
                  const isDone = item.status === "concluido" && !!item.processedBlob;
                  const isRunning = item.status === "processando";
                  const isError = item.status === "erro";
                  const indexPadded = String(idx + 1).padStart(2, "0");
                  const isMp4 = item.processedBlob?.type.includes("mp4") ?? true;
                  const displayName = isDone ? getBatchFileName(idx + 1, isMp4 ? "mp4" : "webm") : item.name;

                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg border text-xs transition-colors ${
                        isDone
                          ? "bg-emerald-500/10 border-emerald-500/30"
                          : isRunning
                          ? "bg-sky-500/10 border-sky-500/30"
                          : isError
                          ? "bg-rose-500/10 border-rose-500/30"
                          : "bg-secondary/20 border-border/40 text-muted-foreground"
                      }`}
                    >
                      {/* Lado Esquerdo: Número e Nome */}
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="font-mono text-[11px] font-bold text-muted-foreground w-5 text-center">
                          {indexPadded}
                        </span>
                        <div className="min-w-0">
                          <p
                            className={`truncate font-medium text-xs ${
                              isDone
                                ? "text-emerald-300 font-semibold"
                                : isRunning
                                ? "text-sky-300 font-semibold"
                                : "text-foreground"
                            }`}
                            title={displayName}
                          >
                            {displayName}
                          </p>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <span>{item.sizeMB} MB</span>
                            {isDone && (
                              <span className="text-emerald-400/80 font-medium">
                                • Concluído
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Lado Direito: Contador de % e Botão de Download Imediato ao lado */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isDone && (
                          <>
                            {/* Contador de % Concluído com Check Verde Positivo */}
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[11px] font-bold shadow-xs">
                              <CheckCircle2 className="size-3.5 text-emerald-400" />
                              <span>100%</span>
                            </span>

                            {/* Botão de Download ao lado do contador */}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownloadSingle(item)}
                              className="h-7 px-2.5 text-xs bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 font-semibold gap-1 transition-colors"
                              title="Baixar este vídeo concluído"
                            >
                              <Download className="size-3" />
                              <span>Baixar</span>
                            </Button>
                          </>
                        )}

                        {isRunning && (
                          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-sky-500/20 text-sky-300 text-[11px] font-mono font-medium border border-sky-500/30">
                            <Loader2 className="size-3 animate-spin text-sky-400" />
                            <span>{item.progress}%</span>
                          </div>
                        )}

                        {isError && (
                          <span
                            className="inline-flex items-center gap-1 text-rose-400 text-[11px] font-medium"
                            title={item.errorMessage || "Erro ao renderizar"}
                          >
                            <AlertCircle className="size-3.5" />
                            <span>Falha</span>
                          </span>
                        )}

                        {item.status === "pendente" && (
                          <span className="inline-flex items-center gap-1 text-muted-foreground text-[10px]">
                            <Clock className="size-3" />
                            <span>Na fila</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rodapé com Botão de Cancelar seguro */}
            <DialogFooter className="mt-2 pt-2 border-t border-border/40">
              <Button
                type="button"
                variant="destructive"
                onClick={onCancelProcessing}
                className="w-full flex items-center justify-center gap-2 font-semibold"
              >
                <XCircle className="size-4" /> Cancelar Processamento
                <span className="text-[11px] font-normal opacity-90">
                  (vídeos concluídos permanecem salvos para download)
                </span>
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ETAPA 3: PROCESSAMENTO FINALIZADO OU CANCELADO */}
        {(status === "finished" || status === "cancelled") && (
          <div className="space-y-4 flex flex-col flex-1 overflow-hidden">
            <DialogHeader>
              <div className="flex items-center gap-2">
                {status === "finished" && errorCount === 0 ? (
                  <CheckCircle2 className="size-6 text-emerald-400" />
                ) : status === "cancelled" ? (
                  <XCircle className="size-6 text-amber-400" />
                ) : (
                  <AlertCircle className="size-6 text-amber-400" />
                )}
                <div>
                  <DialogTitle className="text-base sm:text-lg">
                    {status === "cancelled"
                      ? "Processamento Cancelado"
                      : "Processamento Concluído com Sucesso"}
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    {status === "cancelled"
                      ? "O processo foi interrompido. Todos os vídeos com check positivo verde abaixo foram renderizados e estão disponíveis para download individual ou em massa (.ZIP)."
                      : "Todos os vídeos solicitados foram processados com sucesso via aceleração de hardware."}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {/* Painel com Resumo Numérico */}
            <div className="rounded-xl border border-border bg-secondary/30 p-3.5 flex items-center justify-around text-xs">
              <div className="text-center">
                <span className="text-muted-foreground text-[11px] block">Total</span>
                <span className="font-semibold text-foreground font-mono text-sm">{totalVideos}</span>
              </div>
              <div className="h-6 w-px bg-border/60" />
              <div className="text-center">
                <span className="text-muted-foreground text-[11px] block">Concluídos (100%)</span>
                <span className="font-bold text-emerald-400 font-mono text-sm">{readyToDownloadCount}</span>
              </div>
              {errorCount > 0 && (
                <>
                  <div className="h-6 w-px bg-border/60" />
                  <div className="text-center">
                    <span className="text-muted-foreground text-[11px] block">Com Erro</span>
                    <span className="font-bold text-rose-400 font-mono text-sm">{errorCount}</span>
                  </div>
                </>
              )}
            </div>

            {/* Registro de Tempo e Métricas de Conclusão */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-semibold text-primary">
                <span className="flex items-center gap-1.5">
                  <Clock className="size-4 text-primary" />
                  Registro de Tempo da Renderização
                </span>
                <span className="font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full text-[10px]">
                  {formatDurationSeconds(totalDurationSeconds)} total
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="rounded-lg bg-secondary/40 border border-border/50 p-2 text-center">
                  <span className="text-[10px] text-muted-foreground block">Hora de Início</span>
                  <span className="font-mono font-bold text-foreground text-xs">{formatTimeHHMMSS(startTime)}</span>
                </div>

                <div className="rounded-lg bg-secondary/40 border border-border/50 p-2 text-center">
                  <span className="text-[10px] text-muted-foreground block">Hora de Término</span>
                  <span className="font-mono font-bold text-foreground text-xs">{formatTimeHHMMSS(endTime)}</span>
                </div>

                <div className="rounded-lg bg-secondary/40 border border-border/50 p-2 text-center">
                  <span className="text-[10px] text-muted-foreground block">Tempo Total</span>
                  <span className="font-mono font-bold text-primary text-xs">{formatDurationSeconds(totalDurationSeconds)}</span>
                </div>

                <div className="rounded-lg bg-secondary/40 border border-border/50 p-2 text-center">
                  <span className="text-[10px] text-muted-foreground block">Média / Vídeo</span>
                  <span className="font-mono font-bold text-amber-400 text-xs">
                    {avgSecondsPerVideo ? `~${avgSecondsPerVideo}s` : "--"}
                  </span>
                </div>
              </div>
            </div>

            {/* Lista dos Vídeos com Check Verde Positivo e Botão de Download ao lado do contador */}
            <div className="flex-1 overflow-hidden flex flex-col border border-border/80 rounded-xl bg-secondary/10">
              <div className="px-3 py-2 border-b border-border/60 bg-secondary/20 flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <span>Vídeos do Lote</span>
                <span>% e Downloads</span>
              </div>

              <div className="overflow-y-auto max-h-[220px] p-2 space-y-1.5 scrollbar-slim">
                {queue.map((item, idx) => {
                  const isDone = item.status === "concluido" && !!item.processedBlob;
                  const isError = item.status === "erro";
                  const indexPadded = String(idx + 1).padStart(2, "0");
                  const isMp4 = item.processedBlob?.type.includes("mp4") ?? true;
                  const displayName = isDone ? getBatchFileName(idx + 1, isMp4 ? "mp4" : "webm") : item.name;

                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg border text-xs transition-colors ${
                        isDone
                          ? "bg-emerald-500/10 border-emerald-500/30"
                          : isError
                          ? "bg-rose-500/10 border-rose-500/30"
                          : "bg-secondary/20 border-border/40 text-muted-foreground opacity-70"
                      }`}
                    >
                      {/* Lado Esquerdo: Número e Nome */}
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="font-mono text-[11px] font-bold text-muted-foreground w-5 text-center">
                          {indexPadded}
                        </span>
                        <div className="min-w-0">
                          <p
                            className={`truncate font-medium text-xs ${
                              isDone ? "text-emerald-300 font-semibold" : "text-foreground"
                            }`}
                            title={displayName}
                          >
                            {displayName}
                          </p>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <span>{item.sizeMB} MB</span>
                            {isDone && (
                              <span className="text-emerald-400/80 font-medium">
                                • Concluído
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Lado Direito: Check Verde Positivo com % e Botão de Download */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isDone ? (
                          <>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[11px] font-bold">
                              <CheckCircle2 className="size-3.5 text-emerald-400" />
                              <span>100%</span>
                            </span>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownloadSingle(item)}
                              className="h-7 px-2.5 text-xs bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 font-semibold gap-1 transition-colors"
                              title="Baixar este vídeo"
                            >
                              <Download className="size-3" />
                              <span>Baixar</span>
                            </Button>
                          </>
                        ) : isError ? (
                          <span className="inline-flex items-center gap-1 text-rose-400 text-[11px] font-medium">
                            <AlertCircle className="size-3.5" />
                            <span>Erro</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground text-[10px]">
                            <span>Não processado</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ações Finais: Download em Massa de Tudo (.ZIP) e Botões de Controle */}
            <div className="space-y-2 pt-2 border-t border-border/40">
              {readyToDownloadCount > 0 && (
                <Button
                  type="button"
                  onClick={handleDownloadZip}
                  className="w-full py-4 text-xs sm:text-sm font-semibold shadow-md flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  <FileArchive className="size-4" />
                  Baixar Tudo em Massa (.ZIP) — {readyToDownloadCount} vídeos concluídos
                </Button>
              )}

              {errorCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onRetryFailed}
                  className="w-full text-xs text-amber-400 border-amber-500/30 hover:bg-amber-500/10 flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="size-3.5" />
                  Tentar novamente os {errorCount} vídeos que falharam
                </Button>
              )}

              <div className="flex items-center justify-between pt-1 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    onClearTempFiles();
                    onOpenChange(false);
                  }}
                  className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 text-[11px]"
                >
                  <Trash2 className="size-3" /> Limpar arquivos temporários
                </button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                >
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
