import { useState } from "react";
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Loader2,
  Trash2,
  Edit3,
  Send,
  ExternalLink,
  Search,
  Filter,
  Image as ImageIcon,
  Video,
  Info,
  Calendar,
  Instagram,
} from "lucide-react";
import {
  type AgendamentoInstagram,
  type AgendamentoStatus,
  type MetaApiConfig,
} from "@/lib/types";
import {
  deleteAgendamentoApi,
  publishNowApi,
} from "@/lib/agendador-client";

interface AgendamentosQueueProps {
  items: AgendamentoInstagram[];
  metaConfig: MetaApiConfig | null;
  onEdit: (item: AgendamentoInstagram) => void;
  onRefresh: () => void;
}

export function AgendamentosQueue({
  items,
  metaConfig,
  onEdit,
  onRefresh,
}: AgendamentosQueueProps) {
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [selectedError, setSelectedError] = useState<{
    id: string;
    msg: string;
  } | null>(null);
  const [previewMediaUrl, setPreviewMediaUrl] = useState<string | null>(null);

  // Formatação de data amigável em PT-BR
  const formatScheduledDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;

      const now = new Date();
      const diffMs = d.getTime() - now.getTime();
      const diffMinutes = Math.round(diffMs / (1000 * 60));
      const diffHours = Math.round(diffMinutes / 60);

      const formatted = d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      if (diffMs > 0) {
        if (diffMinutes < 60) {
          return `${formatted} (em ${diffMinutes} min)`;
        } else if (diffHours < 24) {
          return `${formatted} (em ~${diffHours}h)`;
        }
      }

      return formatted;
    } catch {
      return isoStr;
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este agendamento?")) return;
    setActionLoadingId(id);
    try {
      await deleteAgendamentoApi(id);
      onRefresh();
    } catch (err: any) {
      alert(err.message || "Erro ao excluir agendamento.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleForcePublish = async (item: AgendamentoInstagram) => {
    if (!metaConfig?.accessToken) {
      alert("Configure o Access Token na barra superior antes de enviar.");
      return;
    }

    setActionLoadingId(item.id);
    try {
      await publishNowApi({
        id: item.id,
        destination_platform: item.destination_platform,
        instagram_account_id: item.instagram_account_id || undefined,
        facebook_page_id: item.facebook_page_id,
        facebook_page_name: item.facebook_page_name,
        connection_id: item.connection_id,
        metaConfig: {
          accessToken: metaConfig.accessToken,
          instagramAccountId: item.instagram_account_id || metaConfig.instagramAccountId || "",
        },
      });
      onRefresh();
    } catch (err: any) {
      alert(err.message || "Falha ao forçar envio via Meta API.");
      onRefresh();
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filtragem
  const filteredItems = items.filter((item) => {
    if (filterStatus !== "ALL" && item.status !== filterStatus) {
      return false;
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const inCaption = item.caption.toLowerCase().includes(query);
      const inId = item.id.toLowerCase().includes(query);
      const inPostId = item.post_id?.toLowerCase().includes(query);
      const inTarget = item.target_username?.toLowerCase().includes(query);
      if (!inCaption && !inId && !inPostId && !inTarget) return false;
    }
    return true;
  });

  const getStatusBadge = (status: AgendamentoStatus, errorMsg?: string | null) => {
    switch (status) {
      case "AGENDADO":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-400">
            <Clock className="size-3" />
            Agendado
          </span>
        );
      case "PUBLICANDO":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-xs font-semibold text-purple-300">
            <Loader2 className="size-3 animate-spin" />
            Publicando...
          </span>
        );
      case "PUBLICADO":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400">
            <CheckCircle2 className="size-3" />
            Publicado
          </span>
        );
      case "ERRO":
        return (
          <button
            onClick={() =>
              setSelectedError({
                id: "item",
                msg: errorMsg || "Erro desconhecido na Meta API.",
              })
            }
            className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 transition-colors"
          >
            <AlertTriangle className="size-3" />
            Erro na Publicação
          </button>
        );
      default:
        return null;
    }
  };

  const counts = {
    all: items.length,
    agendado: items.filter((i) => i.status === "AGENDADO").length,
    publicado: items.filter((i) => i.status === "PUBLICADO").length,
    erro: items.filter((i) => i.status === "ERRO").length,
  };

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-panel">
      {/* Cabeçalho da Fila */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            Fila de Agendamentos
          </h2>
          <p className="text-xs text-muted-foreground">
            Acompanhe o status e histórico de publicações programadas
          </p>
        </div>

        {/* Abas de Filtro de Status */}
        <div className="flex items-center gap-1 rounded-xl border border-border bg-secondary/40 p-1 text-xs">
          <button
            onClick={() => setFilterStatus("ALL")}
            className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
              filterStatus === "ALL"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Todos ({counts.all})
          </button>
          <button
            onClick={() => setFilterStatus("AGENDADO")}
            className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
              filterStatus === "AGENDADO"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Agendados ({counts.agendado})
          </button>
          <button
            onClick={() => setFilterStatus("PUBLICADO")}
            className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
              filterStatus === "PUBLICADO"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Publicados ({counts.publicado})
          </button>
          <button
            onClick={() => setFilterStatus("ERRO")}
            className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
              filterStatus === "ERRO"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Erros ({counts.erro})
          </button>
        </div>
      </div>

      {/* Barra de Pesquisa */}
      <div className="mt-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por texto na legenda, ID da postagem..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-input bg-secondary/30 pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {/* Lista de Itens */}
      <div className="mt-4 space-y-3">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary/10 py-12 text-center">
            <Calendar className="size-8 text-muted-foreground/50" />
            <p className="mt-2 text-xs font-medium text-foreground">
              Nenhum agendamento encontrado
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Utilize o formulário ao lado para programar novas publicações no Instagram.
            </p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isLoading = actionLoadingId === item.id;
            return (
              <div
                key={item.id}
                className="group relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4 rounded-xl border border-border bg-secondary/30 p-4 transition-all hover:border-primary/40 hover:bg-secondary/50"
              >
                {/* Lado Esquerdo: Miniatura e Info */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {/* Miniatura */}
                  <div
                    onClick={() => setPreviewMediaUrl(item.media_url)}
                    className="relative size-16 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-border bg-black/40 group-hover:scale-105 transition-transform"
                  >
                    {item.media_type === "IMAGE" ? (
                      <img
                        src={item.media_url}
                        alt="Miniatura"
                        className="size-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <video
                        src={item.media_url}
                        className="size-full object-cover"
                      />
                    )}
                    <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 text-[9px] font-bold text-white uppercase">
                      {item.media_type === "IMAGE" ? (
                        <ImageIcon className="size-2.5 inline mr-0.5" />
                      ) : (
                        <Video className="size-2.5 inline mr-0.5" />
                      )}
                      {item.media_type}
                    </span>
                  </div>

                  {/* Informações */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {getStatusBadge(item.status, item.error_message)}

                      {/* Destino: Instagram / Facebook / Ambos */}
                      {item.destination_platform === "BOTH" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/40 bg-purple-500/15 px-2 py-0.5 text-[10px] font-bold text-purple-300">
                          <div className="flex items-center -space-x-1">
                            <Instagram className="size-2.5 text-pink-400" />
                            <span className="size-2.5 rounded-full bg-blue-600 grid place-items-center text-[7px] text-white font-bold leading-none">
                              f
                            </span>
                          </div>
                          <span>
                            IG @{item.target_username || "Instagram"} & FB
                          </span>
                        </span>
                      ) : item.destination_platform === "FACEBOOK" ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/40 bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-300">
                          <span className="size-2.5 rounded-full bg-blue-600 grid place-items-center text-[7px] text-white font-bold leading-none">
                            f
                          </span>
                          <span>
                            {item.facebook_page_name || "Página Facebook"}
                          </span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-pink-500/40 bg-pink-500/15 px-2 py-0.5 text-[10px] font-bold text-pink-300">
                          <Instagram className="size-2.5" />
                          <span>
                            @{item.target_username || metaConfig?.accountUsername || "Instagram"}
                          </span>
                        </span>
                      )}

                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Clock className="size-3" />
                        {formatScheduledDate(item.scheduled_time)}
                      </span>
                    </div>

                    <p className="mt-1.5 text-xs text-foreground line-clamp-2 leading-relaxed">
                      {item.caption || (
                        <span className="italic text-muted-foreground">
                          Sem legenda
                        </span>
                      )}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 mt-1.5">
                      {item.post_id && (
                        <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                          <Instagram className="size-3 text-pink-400" />
                          <span>Post IG:</span>
                          <code className="rounded bg-secondary/80 px-1 font-mono text-emerald-300">
                            {item.post_id}
                          </code>
                        </div>
                      )}
                      {item.facebook_post_id && (
                        <div className="flex items-center gap-1 text-[11px] text-blue-400 font-medium">
                          <span className="size-3 rounded-full bg-blue-600 grid place-items-center text-[8px] text-white font-bold leading-none">
                            f
                          </span>
                          <span>Post FB:</span>
                          <code className="rounded bg-secondary/80 px-1 font-mono text-blue-300">
                            {item.facebook_post_id}
                          </code>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Lado Direito: Ações */}
                <div className="flex items-center gap-1.5 self-end md:self-center shrink-0">
                  {item.status !== "PUBLICADO" && (
                    <button
                      onClick={() => handleForcePublish(item)}
                      disabled={isLoading}
                      title="Forçar envio agora para a Meta Graph API"
                      className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                    >
                      <Send
                        className={`size-3.5 ${isLoading ? "animate-spin" : ""}`}
                      />
                      {isLoading ? "Enviando..." : "Forçar Envio Agora"}
                    </button>
                  )}

                  <button
                    onClick={() => onEdit(item)}
                    disabled={isLoading}
                    title="Editar agendamento"
                    className="rounded-lg border border-border bg-secondary/60 p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    <Edit3 className="size-3.5" />
                  </button>

                  <button
                    onClick={() => handleDelete(item.id)}
                    disabled={isLoading}
                    title="Excluir agendamento"
                    className="rounded-lg border border-border bg-secondary/60 p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal de Detalhes do Erro */}
      {selectedError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-destructive/30 bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="size-5" />
                <h3 className="text-base font-semibold">
                  Detalhes do Erro da Meta API
                </h3>
              </div>
              <button
                onClick={() => setSelectedError(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="mt-4">
              <p className="text-xs text-muted-foreground">
                A Meta Graph API rejeitou a publicação com a seguinte resposta:
              </p>
              <div className="mt-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 font-mono text-xs text-destructive-foreground break-words leading-relaxed">
                {selectedError.msg}
              </div>

              {selectedError.msg.includes("instagram_content_publish") && (
                <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200 space-y-2.5">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                    <AlertCircle className="size-4 shrink-0 text-amber-400" />
                    <span>Causa Identificada: Permissão Faltando no Token</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-100/90">
                    O Token da Meta configurado no app não possui a permissão de publicação <code className="bg-amber-950/80 px-1 py-0.5 rounded text-amber-300 font-mono">instagram_content_publish</code>.
                  </p>
                  <div className="rounded-lg bg-black/40 p-2.5 text-[11px] space-y-1 font-mono text-amber-200/90">
                    <p className="text-emerald-400 font-semibold font-sans">Passos para Corrigir:</p>
                    <p>1. Abra o Graph API Explorer do app <strong>Flash Dark</strong>.</p>
                    <p>2. Em Permissões, adicione: <strong className="text-amber-300">instagram_content_publish</strong>.</p>
                    <p>3. Gere o novo token e cole na barra de Credenciais do app.</p>
                  </div>
                  <div className="pt-1 flex flex-wrap gap-2">
                    <a
                      href="https://developers.facebook.com/tools/explorer/?app_id=1437178635181870"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-400 transition-colors shadow-sm"
                    >
                      <ExternalLink className="size-3.5" />
                      Abrir Graph API Explorer (App Flash Dark)
                    </a>
                  </div>
                </div>
              )}

              <p className="mt-3 text-[11px] text-muted-foreground">
                Dica: Certifique-se de que o token possui permissões ativas, a conta do
                Instagram está vinculada como Business Account e a URL da mídia é
                acessível publicamente.
              </p>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedError(null)}
                className="rounded-lg bg-secondary px-4 py-2 text-xs font-semibold text-foreground hover:bg-secondary/80"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Preview de Mídia Grande */}
      {previewMediaUrl && (
        <div
          onClick={() => setPreviewMediaUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[85vh] max-w-[85vw] overflow-hidden rounded-2xl border border-border bg-card p-2"
          >
            <button
              onClick={() => setPreviewMediaUrl(null)}
              className="absolute right-4 top-4 z-10 rounded-full bg-black/60 p-1.5 text-white hover:bg-black"
            >
              ✕
            </button>
            {previewMediaUrl.match(/\.(mp4|mov|webm)$/i) ? (
              <video
                src={previewMediaUrl}
                controls
                autoPlay
                className="max-h-[80vh] w-auto rounded-lg"
              />
            ) : (
              <img
                src={previewMediaUrl}
                alt="Preview Expandido"
                className="max-h-[80vh] w-auto object-contain rounded-lg"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
