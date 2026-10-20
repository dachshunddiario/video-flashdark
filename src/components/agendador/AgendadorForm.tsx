import { useState, useEffect, useRef } from "react";
import {
  Image as ImageIcon,
  Video,
  Upload,
  Calendar,
  Clock,
  Sparkles,
  Send,
  Save,
  AlertCircle,
  CheckCircle2,
  X,
  Link as LinkIcon,
  Instagram,
  Users,
} from "lucide-react";
import {
  type AgendamentoInstagram,
  type AgendamentoMediaType,
  type MetaApiConfig,
  type InstagramConnectedAccount,
  type DestinationPlatform,
} from "@/lib/types";
import {
  saveAgendamento,
  publishNowApi,
  uploadMediaFile,
} from "@/lib/agendador-client";

const MAX_CAPTION_LENGTH = 2200;
const QUICK_EMOJIS = ["✨", "🔥", "🐶", "🚀", "📌", "👇", "💬", "❤️", "🎬", "💡"];

interface AgendadorFormProps {
  metaConfig: MetaApiConfig | null;
  accounts: InstagramConnectedAccount[];
  selectedAccount: InstagramConnectedAccount | null;
  onSelectAccount: (account: InstagramConnectedAccount) => void;
  editingItem: AgendamentoInstagram | null;
  onSaved: (item: AgendamentoInstagram) => void;
  onCancelEdit: () => void;
}

export function AgendadorForm({
  metaConfig,
  accounts,
  selectedAccount,
  onSelectAccount,
  editingItem,
  onSaved,
  onCancelEdit,
}: AgendadorFormProps) {
  const [destinationPlatform, setDestinationPlatform] =
    useState<DestinationPlatform>("BOTH");
  const [mediaType, setMediaType] = useState<AgendamentoMediaType>("IMAGE");
  const [mediaUrl, setMediaUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [targetAccountId, setTargetAccountId] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPublishingNow, setIsPublishingNow] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);

  // Helper para formatar contagem de seguidores
  const formatFollowers = (count?: number | null) => {
    if (typeof count !== "number") return "0";
    if (count >= 1000000) return (count / 1000000).toFixed(1) + "M";
    if (count >= 1000) return (count / 1000).toFixed(1) + "k";
    return count.toString();
  };

  // Helper para obter data atual formatada para input datetime-local
  const getMinDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 1);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  };

  // Sincroniza conta de destino ao montar ou editar
  useEffect(() => {
    if (editingItem) {
      setDestinationPlatform(editingItem.destination_platform || "BOTH");
      setMediaType(editingItem.media_type);
      setMediaUrl(editingItem.media_url);
      setCaption(editingItem.caption);
      if (editingItem.instagram_account_id) {
        setTargetAccountId(editingItem.instagram_account_id);
      } else if (editingItem.facebook_page_id) {
        setTargetAccountId(`fb_${editingItem.facebook_page_id}`);
      } else if (selectedAccount?.id) {
        setTargetAccountId(selectedAccount.id);
      }
      if (editingItem.scheduled_time) {
        const d = new Date(editingItem.scheduled_time);
        if (!isNaN(d.getTime())) {
          const pad = (n: number) => String(n).padStart(2, "0");
          setScheduledTime(
            `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
          );
        }
      }
    } else {
      // Define conta inicial
      if (selectedAccount?.id) {
        setTargetAccountId(selectedAccount.id);
      } else if (metaConfig?.instagramAccountId) {
        setTargetAccountId(metaConfig.instagramAccountId);
      } else if (accounts.length > 0 && accounts[0]) {
        setTargetAccountId(accounts[0].id);
      }

      // Predefinição para 1 hora no futuro
      const defaultDate = new Date();
      defaultDate.setHours(defaultDate.getHours() + 1);
      const pad = (n: number) => String(n).padStart(2, "0");
      setScheduledTime(
        `${defaultDate.getFullYear()}-${pad(defaultDate.getMonth() + 1)}-${pad(defaultDate.getDate())}T${pad(defaultDate.getHours())}:${pad(defaultDate.getMinutes())}`,
      );
    }
  }, [editingItem, selectedAccount, metaConfig, accounts]);

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setErrorMessage(null);
    try {
      if (file.type.startsWith("video/")) {
        setMediaType("REELS");
      } else {
        setMediaType("IMAGE");
      }

      const res = await uploadMediaFile(file);
      const publicUrl = res.fullUrl.startsWith("http")
        ? res.fullUrl
        : `${window.location.origin}${res.url}`;
      setMediaUrl(publicUrl);
    } catch (err: any) {
      setErrorMessage(err.message || "Erro ao fazer upload da mídia.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const insertEmoji = (emoji: string) => {
    setCaption((prev) => {
      if (prev.length + emoji.length > MAX_CAPTION_LENGTH) return prev;
      return prev + emoji;
    });
    captionRef.current?.focus();
  };

  const applyTimePreset = (minutesToAdd: number, specificHour?: number) => {
    const d = new Date();
    if (specificHour !== undefined) {
      d.setHours(specificHour, 0, 0, 0);
      if (d <= new Date()) {
        d.setDate(d.getDate() + 1);
      }
    } else {
      d.setMinutes(d.getMinutes() + minutesToAdd);
    }
    const pad = (n: number) => String(n).padStart(2, "0");
    setScheduledTime(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
    );
  };

  const validateForm = (allowPastTime = false): boolean => {
    setErrorMessage(null);
    if (!mediaUrl.trim()) {
      setErrorMessage("Insira ou envie uma mídia (Imagem ou Reel).");
      return false;
    }

    if (!allowPastTime) {
      if (!scheduledTime) {
        setErrorMessage("Selecione a data e hora do agendamento.");
        return false;
      }
      const scheduledDate = new Date(scheduledTime);
      if (isNaN(scheduledDate.getTime())) {
        setErrorMessage("Data e hora inválidas.");
        return false;
      }
      if (scheduledDate.getTime() < Date.now()) {
        setErrorMessage("O horário do agendamento não pode ser no passado.");
        return false;
      }
    }

    return true;
  };

  const handleSave = async () => {
    if (!validateForm(false)) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const scheduledIso = new Date(scheduledTime).toISOString();
      const chosenAccount =
        accounts.find((a) => a.id === targetAccountId) || selectedAccount;

      const isFbOnly =
        targetAccountId.startsWith("fb_") || chosenAccount?.hasInstagram === false;
      const igId = isFbOnly
        ? null
        : chosenAccount?.id || metaConfig?.instagramAccountId || null;
      const fbPageId = chosenAccount?.pageId || null;
      const fbPageName = chosenAccount?.pageName || null;
      const effectiveDest: DestinationPlatform = isFbOnly
        ? "FACEBOOK"
        : destinationPlatform;

      const payload: any = {
        ...(editingItem?.id ? { id: editingItem.id } : {}),
        media_type: mediaType,
        media_url: mediaUrl.trim(),
        caption: caption.trim(),
        scheduled_time: scheduledIso,
        status: editingItem?.status === "PUBLICADO" ? "PUBLICADO" : "AGENDADO",
        destination_platform: effectiveDest,
        instagram_account_id: igId,
        target_username: isFbOnly
          ? null
          : chosenAccount?.username || metaConfig?.accountUsername || null,
        facebook_page_id: fbPageId,
        facebook_page_name: fbPageName,
        connection_id: chosenAccount?.connectionId || null,
      };

      const saved = await saveAgendamento(payload);
      const targetDisplay =
        effectiveDest === "BOTH"
          ? `@${saved.target_username || "IG"} + Página ${fbPageName || "Facebook"}`
          : effectiveDest === "FACEBOOK"
          ? `Página ${fbPageName || "Facebook"}`
          : `@${saved.target_username || "Instagram"}`;

      setSuccessMessage(
        editingItem
          ? "Agendamento atualizado com sucesso!"
          : `Publicação agendada com sucesso para ${targetDisplay}!`,
      );
      onSaved(saved);

      if (!editingItem) {
        setMediaUrl("");
        setCaption("");
      }

      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || "Erro ao salvar agendamento.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePublishNow = async () => {
    if (!validateForm(true)) return;

    const chosenAccount =
      accounts.find((a) => a.id === targetAccountId) || selectedAccount;
    const isFbOnly =
      targetAccountId.startsWith("fb_") || chosenAccount?.hasInstagram === false;
    const effectiveDest: DestinationPlatform = isFbOnly
      ? "FACEBOOK"
      : destinationPlatform;

    const targetAccountIdToUse = isFbOnly
      ? ""
      : chosenAccount?.id || metaConfig?.instagramAccountId || "";
    const fbPageId = chosenAccount?.pageId || null;
    const fbPageName = chosenAccount?.pageName || null;

    if (!metaConfig?.accessToken) {
      setErrorMessage(
        "Certifique-se de que o Token Meta está configurado no painel.",
      );
      return;
    }

    if (effectiveDest !== "FACEBOOK" && !targetAccountIdToUse) {
      setErrorMessage("Selecione uma conta que possua Instagram conectado.");
      return;
    }

    if (effectiveDest !== "INSTAGRAM" && !fbPageId) {
      setErrorMessage("Selecione uma conta com Página do Facebook associada.");
      return;
    }

    setIsPublishingNow(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const publishPayload: {
        id?: string;
        media_type: AgendamentoMediaType;
        media_url: string;
        caption: string;
        destination_platform: DestinationPlatform;
        instagram_account_id?: string;
        target_username?: string;
        facebook_page_id?: string | null;
        facebook_page_name?: string | null;
        connection_id?: string | null;
        metaConfig: { accessToken: string; instagramAccountId: string };
      } = {
        media_type: mediaType,
        media_url: mediaUrl.trim(),
        caption: caption.trim(),
        destination_platform: effectiveDest,
        instagram_account_id: targetAccountIdToUse || undefined,
        facebook_page_id: fbPageId,
        facebook_page_name: fbPageName,
        connection_id: chosenAccount?.connectionId || null,
        metaConfig: {
          accessToken: metaConfig.accessToken,
          instagramAccountId: targetAccountIdToUse,
        },
      };

      if (chosenAccount?.username && !isFbOnly) {
        publishPayload.target_username = chosenAccount.username;
      }

      if (editingItem?.id) {
        publishPayload.id = editingItem.id;
      }

      const res = await publishNowApi(publishPayload);

      if (res.success) {
        const destDesc =
          effectiveDest === "BOTH"
            ? `Instagram (@${chosenAccount?.username || "IG"}) e Facebook (${fbPageName || "Página"})`
            : effectiveDest === "FACEBOOK"
            ? `Página do Facebook (${fbPageName || "Página"})`
            : `@${chosenAccount?.username || "Instagram"}`;

        setSuccessMessage(`Publicação disparada com sucesso para ${destDesc}!`);
        if (res.item) {
          onSaved(res.item);
        }
        if (!editingItem) {
          setMediaUrl("");
          setCaption("");
        }
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        setErrorMessage(
          res.result?.errorMessage || "A Meta API retornou falha na publicação.",
        );
      }
    } catch (err: any) {
      setErrorMessage(
        err.message || "Falha na comunicação com a Meta Graph API.",
      );
    } finally {
      setIsPublishingNow(false);
    }
  };

  const remainingChars = MAX_CAPTION_LENGTH - caption.length;
  const isCaptionNearLimit = remainingChars <= 100;
  const isCaptionOverLimit = remainingChars < 0;

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-panel">
      {/* Cabeçalho do Formulário */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {editingItem ? "Editar Agendamento" : "Novo Agendamento Flash"}
          </h2>
          <p className="text-xs text-muted-foreground">
            Poste ou programe posts simultâneos no Instagram e no Facebook
          </p>
        </div>

        {editingItem && (
          <button
            onClick={onCancelEdit}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-3.5" />
            Cancelar Edição
          </button>
        )}
      </div>

      {/* Alertas */}
      {errorMessage && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div className="flex-1 font-medium">{errorMessage}</div>
        </div>
      )}

      {successMessage && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <div className="flex-1 font-medium">{successMessage}</div>
        </div>
      )}

      <div className="mt-5 space-y-5">
        {/* SELEÇÃO DO CANAL DE DESTINO: INSTAGRAM / FACEBOOK / AMBOS */}
        <div className="rounded-xl border border-border/80 bg-secondary/20 p-3">
          <div className="flex items-center justify-between pb-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-primary" />
              Onde Publicar?
            </label>
            <span className="text-[11px] font-semibold text-primary">
              {destinationPlatform === "ALL"
                ? "Todos os Canais (IG, FB & TikTok)"
                : destinationPlatform === "BOTH"
                ? "Instagram & Facebook"
                : destinationPlatform === "INSTAGRAM"
                ? "Apenas Instagram"
                : destinationPlatform === "FACEBOOK"
                ? "Apenas Facebook"
                : "Apenas TikTok"}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setDestinationPlatform("ALL")}
              className={`flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-all ${
                destinationPlatform === "ALL"
                  ? "border-primary bg-primary/20 text-primary ring-2 ring-primary/40 shadow-sm"
                  : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Sparkles className="size-3.5 text-primary" />
              <span>Todos</span>
            </button>

            <button
              type="button"
              onClick={() => setDestinationPlatform("INSTAGRAM")}
              className={`flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-all ${
                destinationPlatform === "INSTAGRAM"
                  ? "border-pink-500 bg-pink-500/20 text-pink-300 ring-2 ring-pink-500/40 shadow-sm"
                  : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Instagram className="size-3.5 text-pink-400" />
              <span>Instagram</span>
            </button>

            <button
              type="button"
              onClick={() => setDestinationPlatform("FACEBOOK")}
              className={`flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-all ${
                destinationPlatform === "FACEBOOK"
                  ? "border-blue-500 bg-blue-500/20 text-blue-300 ring-2 ring-blue-500/40 shadow-sm"
                  : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <span className="size-3.5 rounded-full bg-blue-600 grid place-items-center text-[9px] text-white font-bold leading-none">
                f
              </span>
              <span>Facebook</span>
            </button>

            <button
              type="button"
              onClick={() => setDestinationPlatform("TIKTOK")}
              className={`flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-all ${
                destinationPlatform === "TIKTOK"
                  ? "border-cyan-500 bg-cyan-500/20 text-cyan-300 ring-2 ring-cyan-500/40 shadow-sm"
                  : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <span className="size-3.5 rounded-full bg-black border border-cyan-400/50 grid place-items-center text-[9px] text-cyan-400 font-bold leading-none">
                🎵
              </span>
              <span>TikTok</span>
            </button>
          </div>
        </div>

        {/* 0. SELEÇÃO DA CONTA / PÁGINA */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Users className="size-3.5 text-primary" />
              Selecione a Página / Perfil Vinculado
            </label>
            {accounts.length > 0 && (
              <span className="text-[11px] font-medium text-primary">
                {accounts.length} disponíveis
              </span>
            )}
          </div>

          <div className="mt-2 space-y-2">
            {accounts.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {accounts.map((acc) => {
                  const isSelected = acc.id === targetAccountId;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        setTargetAccountId(acc.id);
                        onSelectAccount(acc);
                      }}
                      className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
                        isSelected
                          ? "border-primary bg-primary/15 ring-2 ring-primary/40 shadow-sm"
                          : "border-border bg-secondary/30 hover:border-primary/40 hover:bg-secondary/60"
                      }`}
                    >
                      {acc.profilePictureUrl ? (
                        <img
                          src={acc.profilePictureUrl}
                          alt={acc.username}
                          className="size-8 rounded-full object-cover shrink-0 ring-1 ring-border"
                        />
                      ) : (
                        <div className="grid size-8 place-items-center rounded-full bg-secondary text-primary font-bold text-xs shrink-0">
                          {acc.hasInstagram !== false ? "@" : "f"}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-xs font-bold text-foreground truncate">
                            {acc.hasInstagram !== false
                              ? `@${acc.username}`
                              : acc.pageName || acc.name}
                          </p>
                          {isSelected && (
                            <CheckCircle2 className="size-3.5 text-primary shrink-0" />
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {acc.name}
                        </p>
                        <div className="flex flex-wrap items-center gap-1 mt-0.5">
                          {acc.hasInstagram !== false && (
                            <span className="rounded bg-pink-500/15 border border-pink-500/30 px-1 text-[9px] font-semibold text-pink-300">
                              Instagram
                            </span>
                          )}
                          {acc.pageName && (
                            <span className="rounded bg-blue-500/15 border border-blue-500/30 px-1 text-[9px] font-semibold text-blue-300">
                              FB: {acc.pageName}
                            </span>
                          )}
                          {typeof acc.followersCount === "number" && (
                            <span className="text-[10px] font-semibold text-primary/90">
                              {formatFollowers(acc.followersCount)} seg.
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-secondary/20 p-3 text-xs text-muted-foreground flex items-center justify-between">
                <span>
                  {metaConfig?.accountUsername
                    ? `Publicando na conta padrão: @${metaConfig.accountUsername}`
                    : "Carregando contas conectadas..."}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 1. Seletor de Formato: Imagem Única vs Reel */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Formato de Publicação
          </label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMediaType("IMAGE")}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                mediaType === "IMAGE"
                  ? "border-primary bg-primary/10 ring-1 ring-primary/40 shadow-sm"
                  : "border-border bg-secondary/40 hover:bg-secondary/70"
              }`}
            >
              <div
                className={`grid size-9 place-items-center rounded-lg ${
                  mediaType === "IMAGE"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                <ImageIcon className="size-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Imagem Única
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Feed (1:1 ou 4:5 retrato)
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMediaType("REELS")}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                mediaType === "REELS"
                  ? "border-primary bg-primary/10 ring-1 ring-primary/40 shadow-sm"
                  : "border-border bg-secondary/40 hover:bg-secondary/70"
              }`}
            >
              <div
                className={`grid size-9 place-items-center rounded-lg ${
                  mediaType === "REELS"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                <Video className="size-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Reel / Vídeo
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Vertical (9:16 até 60s/90s)
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* 2. Upload de Mídia e Preview em Tempo Real */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Arquivo de Mídia ({mediaType === "IMAGE" ? "Imagem" : "Vídeo/Reel"})
            </label>
            {mediaUrl && (
              <button
                type="button"
                onClick={() => setMediaUrl("")}
                className="text-[11px] text-destructive hover:underline"
              >
                Remover Mídia
              </button>
            )}
          </div>

          {!mediaUrl ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-secondary/20 p-6 text-center transition-all hover:border-primary/50 hover:bg-secondary/40"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={mediaType === "IMAGE" ? "image/jpeg,image/png,image/webp" : "video/mp4,video/quicktime"}
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
                {isUploading ? (
                  <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                ) : (
                  <Upload className="size-5" />
                )}
              </div>
              <p className="mt-3 text-xs font-medium text-foreground">
                {isUploading ? "Fazendo upload..." : "Clique para selecionar ou arraste o arquivo"}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {mediaType === "IMAGE"
                  ? "Suporta JPG, PNG e WebP (Recomendado: 1080x1350 ou 1080x1080)"
                  : "Suporta MP4 e MOV (Recomendado: 1080x1920 vertical)"}
              </p>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <div className="relative overflow-hidden rounded-xl border border-border bg-secondary/30 p-2">
                {mediaType === "IMAGE" ? (
                  <div className="relative flex max-h-72 items-center justify-center overflow-hidden rounded-lg bg-black/40">
                    <img
                      src={mediaUrl}
                      alt="Preview do post"
                      className="max-h-72 w-auto object-contain"
                      onError={() =>
                        setErrorMessage(
                          "Falha ao carregar preview da imagem. Verifique a URL.",
                        )
                      }
                    />
                  </div>
                ) : (
                  <div className="relative flex max-h-80 items-center justify-center overflow-hidden rounded-lg bg-black/50">
                    <video
                      src={mediaUrl}
                      controls
                      className="max-h-80 w-auto rounded-lg"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-xs">
                <LinkIcon className="size-3.5 text-muted-foreground shrink-0" />
                <input
                  type="url"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="URL pública do arquivo (ex: https://.../midia.mp4)"
                  className="w-full bg-transparent font-mono text-[11px] text-foreground focus:outline-none"
                />
              </div>
            </div>
          )}

          {!mediaUrl && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">ou cole uma URL pública:</span>
              <input
                type="url"
                placeholder="https://meuservidor.com/post.jpg"
                onBlur={(e) => {
                  if (e.target.value.trim()) setMediaUrl(e.target.value.trim());
                }}
                className="flex-1 rounded-lg border border-input bg-secondary/30 px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* 3. Textarea de Legenda com Contador Regressivo */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Legenda do Post
            </label>
            <span
              className={`font-mono text-xs font-medium ${
                isCaptionOverLimit
                  ? "text-destructive font-bold"
                  : isCaptionNearLimit
                    ? "text-amber-400"
                    : "text-muted-foreground"
              }`}
            >
              {remainingChars} restantes
            </span>
          </div>

          <div className="mt-2 relative">
            <textarea
              ref={captionRef}
              rows={4}
              maxLength={MAX_CAPTION_LENGTH}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Escreva a legenda aqui... Suporta quebras de linha, hashtags e emojis!"
              className="w-full resize-y rounded-xl border border-input bg-secondary/40 p-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
            />
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground mr-1">Inserir:</span>
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => insertEmoji(emoji)}
                className="rounded-md border border-border bg-secondary/40 px-2 py-0.5 text-xs transition-colors hover:bg-secondary hover:scale-105"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Seletor de Data e Hora com Validação */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Data e Hora do Agendamento
            </label>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="size-3" /> Fuso Local
            </span>
          </div>

          <div className="mt-2">
            <input
              type="datetime-local"
              min={getMinDateTime()}
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className="w-full rounded-xl border border-input bg-secondary/40 px-3 py-2.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => applyTimePreset(15)}
              className="rounded-lg border border-border bg-secondary/40 px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              +15 min
            </button>
            <button
              type="button"
              onClick={() => applyTimePreset(60)}
              className="rounded-lg border border-border bg-secondary/40 px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              +1 hora
            </button>
            <button
              type="button"
              onClick={() => applyTimePreset(180)}
              className="rounded-lg border border-border bg-secondary/40 px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              +3 horas
            </button>
            <button
              type="button"
              onClick={() => applyTimePreset(0, 19)}
              className="rounded-lg border border-border bg-secondary/40 px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              Hoje 19:00
            </button>
            <button
              type="button"
              onClick={() => applyTimePreset(0, 10)}
              className="rounded-lg border border-border bg-secondary/40 px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              Amanhã 10:00
            </button>
          </div>
        </div>

        {/* 5. Botões de Ação */}
        <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-border">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSubmitting || isPublishingNow || isCaptionOverLimit}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-md transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="size-4" />
            {isSubmitting
              ? "Salvando..."
              : editingItem
                ? "Atualizar Agendamento"
                : "Salvar Agendamento"}
          </button>

          <button
            type="button"
            onClick={handlePublishNow}
            disabled={isSubmitting || isPublishingNow || isCaptionOverLimit}
            title="Ignora o horário agendado e dispara imediatamente na Meta Graph API para a conta selecionada"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-xs font-semibold text-primary shadow-sm transition-all hover:bg-primary/20 disabled:opacity-50"
          >
            <Send className={`size-4 ${isPublishingNow ? "animate-pulse" : ""}`} />
            {isPublishingNow ? "Publicando na Meta..." : "Publicar Imediatamente"}
          </button>
        </div>
      </div>
    </div>
  );
}
