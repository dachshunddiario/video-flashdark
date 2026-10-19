import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import process from "node:process";
import { safeCwd } from "./env-safe";
import {
  type AgendamentoInstagram,
  type AgendamentoStatus,
  type WorkerRunResult,
} from "./types";
import {
  getPendingAgendamentos,
  updateAgendamentoStatus,
  getAgendamentoById,
} from "./agendamentos-db";
import { getMetaConnectionById } from "./meta-config-store";

const META_GRAPH_VERSION = "v22.0";
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export interface MetaPublishCredentials {
  accessToken: string;
  instagramAccountId: string;
}

export interface PublishResult {
  success: boolean;
  creationId?: string;
  postId?: string;
  facebookPostId?: string;
  errorMessage?: string;
}

/**
 * Publica uma mídia diretamente em uma Página do Facebook via Meta Graph API v22.0.
 * Suporta fotos/imagens (/{PAGE_ID}/photos) e vídeos/reels (/{PAGE_ID}/videos).
 */
export async function publishToFacebookPage(params: {
  pageId: string;
  pageAccessToken?: string | null;
  userAccessToken?: string;
  mediaType: "IMAGE" | "REELS";
  mediaUrl: string;
  caption?: string;
}): Promise<{ id: string; postId: string }> {
  const { pageId, pageAccessToken, userAccessToken, mediaType, mediaUrl, caption } = params;
  const tokenToUse = pageAccessToken || userAccessToken;

  if (!pageId || !tokenToUse) {
    throw new Error(
      "ID da Página do Facebook ou Token de Acesso não fornecidos para publicação no Facebook.",
    );
  }

  const publicMediaUrl = await ensurePublicMediaUrl(mediaUrl);

  if (mediaType === "IMAGE") {
    const endpoint = `${META_GRAPH_BASE}/${pageId}/photos`;
    const bodyParams = new URLSearchParams();
    bodyParams.append("url", publicMediaUrl);
    bodyParams.append("access_token", tokenToUse);
    if (caption && caption.trim()) {
      bodyParams.append("caption", caption.trim());
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: bodyParams.toString(),
    });

    const data = (await res.json()) as any;
    if (!res.ok || (!data.id && !data.post_id)) {
      const errorMsg = parseMetaError(
        data,
        "Falha ao publicar foto na Página do Facebook (verifique a permissão pages_manage_posts).",
      );
      throw new Error(errorMsg);
    }

    return {
      id: data.id,
      postId: data.post_id || data.id,
    };
  } else {
    // REELS / Vídeo
    const endpoint = `${META_GRAPH_BASE}/${pageId}/videos`;
    const bodyParams = new URLSearchParams();
    bodyParams.append("file_url", publicMediaUrl);
    bodyParams.append("access_token", tokenToUse);
    if (caption && caption.trim()) {
      bodyParams.append("description", caption.trim());
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: bodyParams.toString(),
    });

    const data = (await res.json()) as any;
    if (!res.ok || !data.id) {
      const errorMsg = parseMetaError(
        data,
        "Falha ao publicar vídeo na Página do Facebook (verifique a permissão pages_manage_posts).",
      );
      throw new Error(errorMsg);
    }

    return {
      id: data.id,
      postId: data.id,
    };
  }
}

/**
 * Converte URLs locais (localhost / 127.0.0.1) para uma URL pública na CDN
 * para que os servidores da Meta Graph API possam baixar a imagem/vídeo sem erro.
 */
export async function ensurePublicMediaUrl(mediaUrl: string): Promise<string> {
  if (!mediaUrl.includes("localhost") && !mediaUrl.includes("127.0.0.1")) {
    return mediaUrl;
  }

  try {
    const urlObj = new URL(mediaUrl);
    const fileName = path.basename(urlObj.pathname);
    const localFilePath = path.resolve(safeCwd(), "public", "uploads", fileName);

    if (fsSync.existsSync(localFilePath)) {
      const fileBuffer = await fs.readFile(localFilePath);
      const ext = path.extname(fileName).toLowerCase();
      const mimeType = ext === ".mp4" ? "video/mp4" : "image/jpeg";
      const blob = new Blob([fileBuffer], { type: mimeType });
      const fd = new FormData();
      fd.append("reqtype", "fileupload");
      fd.append("fileToUpload", blob, fileName);

      const res = await fetch("https://catbox.moe/user/api.php", {
        method: "POST",
        body: fd,
      });

      if (res.ok) {
        const publicUrl = (await res.text()).trim();
        if (publicUrl.startsWith("http")) {
          console.log(`[AgendadorFlash] Mídia local espelhada para CDN pública: ${publicUrl}`);
          return publicUrl;
        }
      }
    }
  } catch (err) {
    console.warn("[AgendadorFlash] Falha ao espelhar mídia local para CDN pública:", err);
  }

  return mediaUrl;
}

/**
 * Helper para extrair mensagem limpa de erro da Meta Graph API.
 */
function parseMetaError(errorData: any, fallbackMessage: string): string {
  if (!errorData) return fallbackMessage;
  if (typeof errorData === "string") return errorData;

  const err = errorData.error;
  if (err) {
    const code = err.code ? `[Código ${err.code}] ` : "";
    const subcode = err.error_subcode ? `(Subcódigo ${err.error_subcode}) ` : "";
    const msg = err.message || err.error_user_msg || fallbackMessage;
    const type = err.type ? ` (${err.type})` : "";
    return `${code}${subcode}${msg}${type}`;
  }

  return errorData.message || fallbackMessage;
}

/**
 * Etapa 1: Criação do Container de Mídia na Meta Graph API v22.0
 * Endpoint: POST https://graph.facebook.com/v22.0/{IG_USER_ID}/media
 */
export async function createMediaContainer(
  credentials: MetaPublishCredentials,
  mediaType: "IMAGE" | "REELS",
  mediaUrl: string,
  caption: string,
): Promise<string> {
  const { accessToken, instagramAccountId } = credentials;

  if (!accessToken || !instagramAccountId) {
    throw new Error(
      "Credenciais da Meta incompletas. Verifique o Access Token e o Instagram Business Account ID.",
    );
  }

  const endpoint = `${META_GRAPH_BASE}/${instagramAccountId}/media`;

  const bodyParams = new URLSearchParams();
  bodyParams.append("access_token", accessToken);

  if (caption && caption.trim()) {
    bodyParams.append("caption", caption.trim());
  }

  // Garante que a URL seja pública e acessível pelos servidores em nuvem da Meta
  const publicMediaUrl = await ensurePublicMediaUrl(mediaUrl);

  if (mediaType === "IMAGE") {
    bodyParams.append("image_url", publicMediaUrl);
  } else {
    // REELS / Vídeo
    bodyParams.append("media_type", "REELS");
    bodyParams.append("video_url", publicMediaUrl);
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: bodyParams.toString(),
  });

  const data = (await res.json()) as any;

  if (!res.ok || !data.id) {
    const errorMsg = parseMetaError(
      data,
      `Falha na Etapa 1 (Criar Container de ${mediaType})`,
    );
    throw new Error(errorMsg);
  }

  return data.id as string;
}

/**
 * Aguarda o processamento do container de mídia pela Meta.
 * Essencial para REELS/vídeos antes de invocar media_publish.
 */
export async function waitForContainerReady(
  credentials: MetaPublishCredentials,
  creationId: string,
  maxAttempts = 20,
  intervalMs = 3000,
): Promise<void> {
  const { accessToken } = credentials;
  const statusEndpoint = `${META_GRAPH_BASE}/${creationId}?fields=status_code,status&access_token=${accessToken}`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(statusEndpoint);
      const data = (await res.json()) as any;

      if (res.ok && data.status_code) {
        const statusCode = String(data.status_code).toUpperCase();

        if (statusCode === "FINISHED") {
          return; // Container pronto para publicação
        }

        if (statusCode === "ERROR" || statusCode === "EXPIRED") {
          const errMsg = parseMetaError(
            data,
            `Container de mídia falhou durante processamento (${statusCode}).`,
          );
          throw new Error(errMsg);
        }

        // Status "IN_PROGRESS" ou aguardando codificação do vídeo
      }
    } catch (checkErr: any) {
      if (checkErr.message && checkErr.message.includes("Container de mídia")) {
        throw checkErr;
      }
      // Se for erro passageiro de rede, continua tentando
    }

    // Aguarda o próximo ciclo
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  // Se atingiu o tempo limite, tenta prosseguir (algumas contas não reportam status_code para imagens)
}

/**
 * Etapa 2: Publicação do Container na Meta Graph API v22.0
 * Endpoint: POST https://graph.facebook.com/v22.0/{IG_USER_ID}/media_publish
 */
export async function publishMediaContainer(
  credentials: MetaPublishCredentials,
  creationId: string,
): Promise<string> {
  const { accessToken, instagramAccountId } = credentials;

  const endpoint = `${META_GRAPH_BASE}/${instagramAccountId}/media_publish`;

  const bodyParams = new URLSearchParams();
  bodyParams.append("creation_id", creationId);
  bodyParams.append("access_token", accessToken);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: bodyParams.toString(),
  });

  const data = (await res.json()) as any;

  if (!res.ok || !data.id) {
    const errorMsg = parseMetaError(
      data,
      "Falha na Etapa 2 (Publicar Container de Mídia)",
    );
    throw new Error(errorMsg);
  }

  return data.id as string;
}

/**
 * Executa o fluxo completo de publicação de um agendamento individual.
 * Atualiza os status no banco de dados:
 * AGENDADO -> PUBLICANDO -> PUBLICADO (com post_id) ou ERRO (com error_message).
 */
export async function publishSingleAgendamento(
  agendamentoId: string,
  credentials: MetaPublishCredentials,
): Promise<PublishResult> {
  const item = await getAgendamentoById(agendamentoId);
  if (!item) {
    return { success: false, errorMessage: "Agendamento não encontrado." };
  }

  // Marca status inicial como PUBLICANDO
  await updateAgendamentoStatus(item.id, "PUBLICANDO", { error_message: null });

  // Prioriza o token correspondente à conexão deste agendamento / conta
  let accessTokenToUse = credentials.accessToken;
  if (item.connection_id) {
    const conn = await getMetaConnectionById(item.connection_id);
    if (conn?.accessToken) {
      accessTokenToUse = conn.accessToken;
    }
  }

  // Prioriza a conta de destino escolhida no agendamento, se configurada
  const effectiveCredentials: MetaPublishCredentials = {
    accessToken: accessTokenToUse,
    instagramAccountId: item.instagram_account_id || credentials.instagramAccountId,
  };

  const destination = item.destination_platform || "INSTAGRAM";
  let creationId = item.creation_id || "";

  try {
    // CASO 1: Publicação EXCLUSIVA no Facebook
    if (destination === "FACEBOOK") {
      if (!item.facebook_page_id) {
        throw new Error(
          "ID da Página do Facebook não selecionado para este agendamento.",
        );
      }

      const fbRes = await publishToFacebookPage({
        pageId: item.facebook_page_id,
        userAccessToken: accessTokenToUse,
        mediaType: item.media_type,
        mediaUrl: item.media_url,
        caption: item.caption,
      });

      await updateAgendamentoStatus(item.id, "PUBLICADO", {
        facebook_post_id: fbRes.postId,
        error_message: null,
      });

      return {
        success: true,
        facebookPostId: fbRes.postId,
      };
    }

    // CASO 2: Publicação DUAL (Instagram E Facebook simultaneamente)
    if (destination === "BOTH") {
      let instagramPostId: string | undefined;
      let instagramError: string | null = null;
      let fbPostId: string | undefined;
      let fbError: string | null = null;

      // 1. Instagram
      try {
        if (!creationId) {
          creationId = await createMediaContainer(
            effectiveCredentials,
            item.media_type,
            item.media_url,
            item.caption,
          );
          await updateAgendamentoStatus(item.id, "PUBLICANDO", { creation_id: creationId });
        }
        if (item.media_type === "REELS") {
          await waitForContainerReady(effectiveCredentials, creationId);
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        instagramPostId = await publishMediaContainer(effectiveCredentials, creationId);
      } catch (igErr: any) {
        instagramError = igErr.message || "Falha no Instagram";
      }

      // 2. Facebook
      if (item.facebook_page_id) {
        try {
          const fbRes = await publishToFacebookPage({
            pageId: item.facebook_page_id,
            userAccessToken: accessTokenToUse,
            mediaType: item.media_type,
            mediaUrl: item.media_url,
            caption: item.caption,
          });
          fbPostId = fbRes.postId;
        } catch (fbErr: any) {
          fbError = fbErr.message || "Falha no Facebook";
        }
      } else {
        fbError = "Página do Facebook não vinculada";
      }

      if (instagramPostId && fbPostId) {
        await updateAgendamentoStatus(item.id, "PUBLICADO", {
          creation_id: creationId,
          post_id: instagramPostId,
          facebook_post_id: fbPostId,
          error_message: null,
        });
        return {
          success: true,
          creationId,
          postId: instagramPostId,
          facebookPostId: fbPostId,
        };
      } else if (instagramPostId || fbPostId) {
        const partialNotice = instagramPostId
          ? `Publicado no Instagram (@${item.target_username || "IG"}). Aviso no Facebook: ${fbError}`
          : `Publicado no Facebook (${item.facebook_page_name || "Página"}). Aviso no Instagram: ${instagramError}`;

        await updateAgendamentoStatus(item.id, "PUBLICADO", {
          creation_id: creationId,
          post_id: instagramPostId || null,
          facebook_post_id: fbPostId || null,
          error_message: partialNotice,
        });
        return {
          success: true,
          creationId,
          postId: instagramPostId,
          facebookPostId: fbPostId,
          errorMessage: partialNotice,
        };
      } else {
        const combinedError = `Falha no Instagram: ${instagramError} | Falha no Facebook: ${fbError}`;
        await updateAgendamentoStatus(item.id, "ERRO", {
          creation_id: creationId || null,
          error_message: combinedError,
        });
        return {
          success: false,
          creationId,
          errorMessage: combinedError,
        };
      }
    }

    // CASO 3: Publicação Padrão no Instagram
    if (!creationId) {
      creationId = await createMediaContainer(
        effectiveCredentials,
        item.media_type,
        item.media_url,
        item.caption,
      );

      // Salva o creation_id imediatamente para rastreabilidade
      await updateAgendamentoStatus(item.id, "PUBLICANDO", {
        creation_id: creationId,
      });
    }

    // Se for Reel ou vídeo, aguarda processamento assíncrono pela Meta
    if (item.media_type === "REELS") {
      await waitForContainerReady(effectiveCredentials, creationId);
    } else {
      // Breve pausa para propagação de imagem
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    // Etapa 2: Publicar Container
    const postId = await publishMediaContainer(effectiveCredentials, creationId);

    // Sucesso! Atualiza o registro no banco
    await updateAgendamentoStatus(item.id, "PUBLICADO", {
      creation_id: creationId,
      post_id: postId,
      error_message: null,
    });

    return {
      success: true,
      creationId,
      postId,
    };
  } catch (err: any) {
    const detailedMessage =
      err?.message || "Erro desconhecido ao publicar via Meta API.";

    console.error(`[AgendadorFlash] Erro ao publicar post #${item.id}:`, detailedMessage);

    // Marca como ERRO com mensagem detalhada
    await updateAgendamentoStatus(item.id, "ERRO", {
      creation_id: creationId || item.creation_id || null,
      error_message: detailedMessage,
    });

    return {
      success: false,
      creationId,
      errorMessage: detailedMessage,
    };
  }
}

/**
 * Rotina Worker / Cron:
 * Verifica registros onde status == 'AGENDADO' e scheduled_time <= agora.
 * Dispara a publicação para cada um.
 */
export async function runAgendamentosWorker(
  credentials: MetaPublishCredentials,
  nowIso = new Date().toISOString(),
): Promise<WorkerRunResult> {
  const pending = await getPendingAgendamentos(nowIso);

  const result: WorkerRunResult = {
    executedAt: new Date().toISOString(),
    checkedCount: pending.length,
    publishedCount: 0,
    failedCount: 0,
    items: [],
  };

  if (pending.length === 0) {
    return result;
  }

  console.log(
    `[AgendadorFlash Worker] Encontrados ${pending.length} agendamento(s) prontos para disparo.`,
  );

  for (const item of pending) {
    const res = await publishSingleAgendamento(item.id, credentials);

    if (res.success) {
      result.publishedCount++;
      result.items.push({
        id: item.id,
        mediaType: item.media_type,
        status: "PUBLICADO",
        postId: res.postId ?? null,
        facebookPostId: res.facebookPostId ?? null,
        error: null,
      });
    } else {
      result.failedCount++;
      result.items.push({
        id: item.id,
        mediaType: item.media_type,
        status: "ERRO",
        postId: null,
        facebookPostId: null,
        error: res.errorMessage ?? null,
      });
    }
  }

  return result;
}
