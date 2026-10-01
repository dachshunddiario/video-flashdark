import {
  type ConnectedProfileData,
  type FollowerSnapshot,
  type InstagramProfileLookupResult,
  type MetaApiConfig,
  type Platform,
  type SocialPage,
  type HistoricoSeguidoresRecord,
  type GrowthCalculationResult,
  type CronRunResult,
  type ProfileType,
} from "./types";

/**
 * Consulta perfil do Instagram (seguidores, posts, foto e bio)
 * Utiliza o backend do app, que consome a Meta Graph API (Business Discovery) quando configurada.
 */
export async function lookupInstagramProfile(
  handle: string,
  metaConfig?: MetaApiConfig | null,
): Promise<InstagramProfileLookupResult> {
  const cleanHandle = handle.trim().replace(/^@/, "").replace(/\/.*$/, "");
  if (!cleanHandle) {
    throw new Error("Informe o @handle do usuário.");
  }

  const params = new URLSearchParams({ handle: cleanHandle });
  if (metaConfig?.accessToken && metaConfig?.instagramAccountId) {
    params.set("accessToken", metaConfig.accessToken);
    params.set("instagramAccountId", metaConfig.instagramAccountId);
  }

  const res = await fetch(`/api/social/instagram-lookup?${params.toString()}`);
  const data = (await res.json()) as InstagramProfileLookupResult;

  if (!res.ok && !data.success) {
    throw new Error(data.message || "Erro ao consultar perfil.");
  }

  return data;
}

export interface MetaConnectionResult {
  success: boolean;
  discovered?: boolean | undefined;
  instagramAccountId?: string | undefined;
  username?: string | undefined;
  name?: string | undefined;
  pageName?: string | undefined;
  platform?: Platform | undefined;
  avatarUrl?: string | undefined;
  followers?: number | undefined;
  posts?: number | undefined;
  biography?: string | undefined;
  accounts?: ConnectedProfileData[] | undefined;
  message: string;
}

/**
 * Testa a conexão com as credenciais da Meta Graph API (Instagram Business)
 * Se instagramAccountId não for fornecido, tenta detectá-lo automaticamente a partir do token.
 */
export async function testMetaConnection(config: {
  accessToken: string;
  instagramAccountId?: string | undefined;
}): Promise<MetaConnectionResult> {
  const res = await fetch("/api/social/meta-test-connection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });

  const data = (await res.json()) as MetaConnectionResult;
  return data;
}

/**
 * Interface de adaptação para sincronização com redes sociais.
 */
export interface SocialPlatformAdapter {
  platform: Platform;
  isConfigured(): boolean;
  fetchProfile?(handle: string): Promise<Partial<SocialPage>>;
  fetchLatestFollowers?(page: SocialPage): Promise<number>;
  syncSnapshot?(page: SocialPage): Promise<FollowerSnapshot>;
}

/**
 * Provedor Local / Offline Manual.
 */
export class LocalManualAdapter implements SocialPlatformAdapter {
  constructor(public platform: Platform) {}

  isConfigured(): boolean {
    return true;
  }

  async fetchProfile(handle: string): Promise<Partial<SocialPage>> {
    return {
      handle: handle.replace(/^@/, "").trim(),
      platform: this.platform,
    };
  }

  async fetchLatestFollowers(): Promise<number> {
    throw new Error("Atualização automática não configurada.");
  }
}

/**
 * Adaptador oficial do Instagram (Meta Graph API / Business Discovery)
 */
export class InstagramGraphApiAdapter implements SocialPlatformAdapter {
  platform: Platform = "instagram";

  constructor(
    private accessToken?: string,
    private instagramAccountId?: string,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.accessToken && this.instagramAccountId);
  }

  async fetchProfile(handle: string): Promise<Partial<SocialPage>> {
    const lookup = await lookupInstagramProfile(handle, {
      accessToken: this.accessToken || "",
      instagramAccountId: this.instagramAccountId || "",
    });

    return {
      handle: lookup.handle,
      name: lookup.name,
      platform: "instagram",
      avatarUrl: lookup.avatarUrl,
      biography: lookup.biography,
      postsCount: lookup.posts,
      followersCount: lookup.followers,
      verified: lookup.verified,
    };
  }

  async fetchLatestFollowers(page: SocialPage): Promise<number> {
    const lookup = await lookupInstagramProfile(page.handle, {
      accessToken: this.accessToken || "",
      instagramAccountId: this.instagramAccountId || "",
    });
    return lookup.followers;
  }
}

/**
 * Fábrica de adaptadores.
 */
export function getSocialAdapter(
  platform: Platform,
  metaConfig?: MetaApiConfig | null,
): SocialPlatformAdapter {
  switch (platform) {
    case "instagram":
      return new InstagramGraphApiAdapter(metaConfig?.accessToken, metaConfig?.instagramAccountId);
    default:
      return new LocalManualAdapter(platform);
  }
}

/**
 * Passo 1 & 4: Consulta a tabela Historico_Seguidores no banco de dados
 * com filtros opcionais de data inicial, data final, handle e tipo.
 * Retorna também o cálculo de crescimento (Passo 4) para cada perfil no período.
 */
export async function fetchHistoricoSeguidores(filters?: {
  startDate?: string;
  endDate?: string;
  handle?: string;
  type?: string;
}): Promise<{
  success: boolean;
  totalRecords: number;
  records: HistoricoSeguidoresRecord[];
  calculations: GrowthCalculationResult[];
  filter: { startDate: string; endDate: string; handle: string; type: string };
}> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.set("startDate", filters.startDate);
  if (filters?.endDate) params.set("endDate", filters.endDate);
  if (filters?.handle) params.set("handle", filters.handle);
  if (filters?.type) params.set("type", filters.type);

  const res = await fetch(`/api/social/historico-seguidores?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Erro ao buscar Historico_Seguidores: ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Passo 1: Salva ou atualiza uma linha na tabela Historico_Seguidores
 */
export async function saveHistoricoRecord(record: {
  profile_handle: string;
  profile_name?: string;
  date?: string;
  followers_count: number;
  type?: ProfileType;
  page_id?: string;
}): Promise<{ success: boolean; record: HistoricoSeguidoresRecord }> {
  const res = await fetch("/api/social/historico-seguidores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || "Erro ao salvar na tabela Historico_Seguidores");
  }
  return await res.json();
}

/**
 * Passo 1: Salva um lote de registros na tabela Historico_Seguidores
 */
export async function saveHistoricoBatch(
  batch: Array<{
    profile_handle: string;
    profile_name?: string;
    date: string;
    followers_count: number;
    type: ProfileType;
    page_id?: string;
  }>,
): Promise<{ success: boolean; inserted: number; updated: number; total: number }> {
  const res = await fetch("/api/social/historico-seguidores/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ batch }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || "Erro ao salvar lote na tabela Historico_Seguidores");
  }
  return await res.json();
}

/**
 * Passo 2: Dispara a Rotina Automatizada (Cron Job diário das 23:59) sob demanda
 * para fotografar todos os perfis e gravar o snapshot na tabela Historico_Seguidores.
 */
export async function runDailyCronNow(params?: {
  accessToken?: string | undefined;
  pages?: Array<{
    id: string;
    handle: string;
    name: string;
    platform: string;
    isCompetitor: boolean;
    followersCount?: number | undefined;
  }> | undefined;
}): Promise<{ success: boolean; cronResult: CronRunResult }> {
  const res = await fetch("/api/social/historico-seguidores/cron-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params || {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || "Erro ao disparar rotina automatizada");
  }
  return await res.json();
}

/**
 * Passo 2: Obtém o status do agendador automático / Cron Job diário
 */
export async function fetchCronStatus(): Promise<{
  success: boolean;
  status: {
    active: boolean;
    schedule: string;
    targetTime: string;
    lastExecution?: string;
    totalRecordsInDb: number;
  };
}> {
  const res = await fetch("/api/social/historico-seguidores/cron-status");
  if (!res.ok) {
    throw new Error(`Erro ao obter status do Cron: ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Consulta o status da conexão e configuração do Supabase
 */
export async function fetchSupabaseStatus(): Promise<{
  success: boolean;
  connected: boolean;
  tableFound: boolean;
  count: number;
  message: string;
  config: {
    url: string;
    hasKey: boolean;
    maskedKey?: string;
    configuredAt?: string;
  } | null;
}> {
  const res = await fetch("/api/supabase/status");
  if (!res.ok) {
    throw new Error(`Erro ao consultar status do Supabase: ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Salva as credenciais do Supabase e testa a conexão
 */
export async function saveSupabaseConfigApi(config: {
  url: string;
  anonKey: string;
}): Promise<{
  success: boolean;
  connected: boolean;
  tableFound: boolean;
  count: number;
  message: string;
}> {
  const res = await fetch("/api/supabase/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || "Erro ao salvar configuração do Supabase");
  }
  return data;
}

/**
 * Dispara a sincronização manual completa de todos os dados locais para a tabela do Supabase
 */
export async function triggerSupabaseSync(): Promise<{
  success: boolean;
  totalSynced: number;
  message: string;
}> {
  const res = await fetch("/api/supabase/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || "Erro ao sincronizar com o Supabase");
  }
  return data;
}

