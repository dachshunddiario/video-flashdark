import {
  type AgendamentoInstagram,
  type WorkerRunResult,
  type InstagramConnectedAccount,
} from "./types";
import { type StoredMetaConfig } from "./meta-config-store";

export async function fetchInstagramAccounts(
  accessToken?: string,
): Promise<InstagramConnectedAccount[]> {
  const url = accessToken
    ? `/api/agendamentos/accounts?accessToken=${encodeURIComponent(accessToken)}`
    : "/api/agendamentos/accounts";
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Erro ao carregar contas do Instagram.");
  }
  return (data.accounts || []) as InstagramConnectedAccount[];
}

export async function fetchAgendamentos(): Promise<AgendamentoInstagram[]> {
  const res = await fetch("/api/agendamentos");
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Erro ao carregar agendamentos.");
  }
  return data.data as AgendamentoInstagram[];
}

export async function saveAgendamento(
  item: Partial<AgendamentoInstagram> & {
    media_type: "IMAGE" | "REELS";
    media_url: string;
    scheduled_time: string;
  },
): Promise<AgendamentoInstagram> {
  const res = await fetch("/api/agendamentos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Erro ao salvar agendamento.");
  }
  return data.data as AgendamentoInstagram;
}

export async function deleteAgendamentoApi(id: string): Promise<boolean> {
  const res = await fetch(`/api/agendamentos?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Erro ao excluir agendamento.");
  }
  return true;
}

export async function publishNowApi(params: {
  id?: string;
  media_type?: "IMAGE" | "REELS";
  media_url?: string;
  caption?: string;
  destination_platform?: import("./types").DestinationPlatform;
  instagram_account_id?: string;
  target_username?: string;
  facebook_page_id?: string | null;
  facebook_page_name?: string | null;
  page_access_token?: string | null;
  connection_id?: string | null;
  metaConfig?: { accessToken: string; instagramAccountId: string };
}): Promise<{
  success: boolean;
  result?: { creationId?: string; postId?: string; facebookPostId?: string; errorMessage?: string };
  item?: AgendamentoInstagram;
}> {
  const res = await fetch("/api/agendamentos/publish-now", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok && !data.success) {
    throw new Error(
      data.message ||
        data.result?.errorMessage ||
        "Falha ao executar publicação imediata na Meta Graph API.",
    );
  }
  return data;
}

export async function triggerCronWorkerApi(): Promise<WorkerRunResult> {
  const res = await fetch("/api/agendamentos/cron-run", {
    method: "POST",
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Erro ao executar Worker.");
  }
  return data.result as WorkerRunResult;
}

export async function uploadMediaFile(
  file: File,
): Promise<{ url: string; fullUrl: string; fileName: string; size: number }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/agendamentos/upload", {
    method: "POST",
    body: formData,
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Falha no upload do arquivo de mídia.");
  }

  return data;
}

export async function fetchSupabaseSql(): Promise<string> {
  const res = await fetch("/api/agendamentos/sql");
  const data = await res.json();
  return data.sql || "";
}

export async function fetchServerMetaConfig(): Promise<StoredMetaConfig | null> {
  const res = await fetch("/api/agendamentos/meta-config");
  const data = await res.json();
  return data.config || null;
}

export async function saveServerMetaConfig(
  config: Partial<StoredMetaConfig>,
): Promise<StoredMetaConfig> {
  const res = await fetch("/api/agendamentos/meta-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Erro ao salvar credenciais Meta.");
  }
  return data.config;
}

export async function validateMetaTokenApi(
  accessToken?: string,
): Promise<import("./types").MetaTokenValidation> {
  const url = accessToken
    ? `/api/agendamentos/meta-permissions?accessToken=${encodeURIComponent(accessToken)}`
    : "/api/agendamentos/meta-permissions";
  const res = await fetch(url);
  const data = await res.json();
  return data;
}

export async function fetchMetaConnections(): Promise<import("./types").MetaConnection[]> {
  const res = await fetch("/api/agendamentos/meta-connections");
  const data = await res.json();
  return (data.connections || []) as import("./types").MetaConnection[];
}

export async function saveMetaConnectionApi(
  conn: Partial<import("./types").MetaConnection> & { accessToken: string; label: string },
): Promise<{ success: boolean; connections: import("./types").MetaConnection[] }> {
  const res = await fetch("/api/agendamentos/meta-connections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(conn),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Erro ao salvar conexão Meta.");
  }
  return data;
}

export async function deleteMetaConnectionApi(
  id: string,
): Promise<{ success: boolean; connections: import("./types").MetaConnection[] }> {
  const res = await fetch(`/api/agendamentos/meta-connections?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Erro ao remover conexão Meta.");
  }
  return data;
}

export interface TikTokStatusResponse {
  success: boolean;
  connected: boolean;
  clientKey: string | null;
  hasSecret: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  openId: string | null;
  expiresAt: number | null;
}

export async function fetchTikTokStatusApi(profileId?: string): Promise<TikTokStatusResponse> {
  const query = profileId ? `?profileId=${encodeURIComponent(profileId)}` : "";
  const res = await fetch(`/api/tiktok/status${query}`);
  const data = await res.json();
  return data as TikTokStatusResponse;
}

export async function getTikTokAuthUrlApi(
  clientKey?: string,
  profileId?: string,
): Promise<{ success: boolean; authUrl?: string; redirectUri?: string; message?: string }> {
  const params = new URLSearchParams();
  if (clientKey) params.set("clientKey", clientKey);
  if (profileId) params.set("profileId", profileId);
  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`/api/tiktok/auth-url${query}`);
  const data = await res.json();
  return data;
}

export async function saveTikTokConfigApi(credentials: {
  clientKey: string;
  clientSecret: string;
}): Promise<{ success: boolean; message?: string }> {
  const res = await fetch("/api/tiktok/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Erro ao salvar credenciais do TikTok.");
  }
  return data;
}

export async function disconnectTikTokApi(profileId?: string): Promise<{ success: boolean }> {
  const res = await fetch("/api/tiktok/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileId }),
  });
  const data = await res.json();
  return data;
}



