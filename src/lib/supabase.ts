import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import process from "node:process";
import { type HistoricoSeguidoresRecord, type ProfileType } from "./types";
import { safeCwd } from "./env-safe";

const DATA_DIR = path.resolve(safeCwd(), "data");
const CONFIG_FILE = path.join(DATA_DIR, "supabase_config.json");

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  configuredAt?: string;
}

// Armazena cliente em cache na memória
let cachedClient: SupabaseClient | null = null;
let cachedConfig: SupabaseConfig | null = null;

/**
 * Lê a configuração do Supabase das variáveis de ambiente ou do arquivo local
 */
export async function getSupabaseConfig(): Promise<SupabaseConfig | null> {
  if (cachedConfig) return cachedConfig;

  // 1. Tenta variáveis de ambiente do sistema/Node
  const envUrl = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
  const envKey = process.env["SUPABASE_ANON_KEY"] || process.env["VITE_SUPABASE_ANON_KEY"];

  if (envUrl && envKey) {
    cachedConfig = { url: envUrl.trim(), anonKey: envKey.trim() };
    return cachedConfig;
  }

  // 2. Tenta arquivo de configuração salvo data/supabase_config.json
  try {
    if (fsSync.existsSync(CONFIG_FILE)) {
      const raw = await fs.readFile(CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed.url && parsed.anonKey) {
        cachedConfig = { url: parsed.url.trim(), anonKey: parsed.anonKey.trim() };
        return cachedConfig;
      }
    }
  } catch {
    // segue
  }

  return null;
}

/**
 * Salva ou atualiza as credenciais do Supabase
 */
export async function saveSupabaseConfig(config: SupabaseConfig): Promise<boolean> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const dataToSave = {
    url: config.url.trim(),
    anonKey: config.anonKey.trim(),
    configuredAt: new Date().toISOString(),
  };
  await fs.writeFile(CONFIG_FILE, JSON.stringify(dataToSave, null, 2), "utf-8");
  cachedConfig = dataToSave;
  cachedClient = null; // reseta para recriar com novo token
  return true;
}

/**
 * Retorna uma instância ativa do SupabaseClient (se configurado)
 */
export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (cachedClient) return cachedClient;

  const config = await getSupabaseConfig();
  if (!config || !config.url || !config.anonKey) {
    return null;
  }

  try {
    cachedClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    return cachedClient;
  } catch (err) {
    console.error("[Supabase] Erro ao instanciar cliente:", err);
    return null;
  }
}

/**
 * Testa a conexão com o Supabase e verifica se a tabela historico_seguidores está acessível
 */
export async function testSupabaseConnection(configOverride?: SupabaseConfig): Promise<{
  connected: boolean;
  tableFound: boolean;
  count: number;
  message: string;
}> {
  try {
    let client: SupabaseClient | null = null;
    if (configOverride && configOverride.url && configOverride.anonKey) {
      client = createClient(configOverride.url.trim(), configOverride.anonKey.trim(), {
        auth: { persistSession: false },
      });
    } else {
      client = await getSupabaseClient();
    }

    if (!client) {
      return {
        connected: false,
        tableFound: false,
        count: 0,
        message: "Supabase não configurado. Forneça a URL e a Anon Key.",
      };
    }

    // Tenta consultar a tabela historico_seguidores
    const { data, count, error } = await client
      .from("historico_seguidores")
      .select("*", { count: "exact", head: true });

    if (error) {
      // Se o erro for de tabela inexistente (código 42P01 ou mensagem de relação inexistente)
      if (error.code === "42P01" || error.message.toLowerCase().includes("does not exist") || error.message.toLowerCase().includes("relation")) {
        return {
          connected: true,
          tableFound: false,
          count: 0,
          message: "Conexão com o Supabase estabelecida! Porém a tabela 'historico_seguidores' ainda não foi criada. Execute o script SQL no painel do Supabase.",
        };
      }

      return {
        connected: false,
        tableFound: false,
        count: 0,
        message: `Falha ao consultar tabela: ${error.message} (${error.code || "sem código"})`,
      };
    }

    return {
      connected: true,
      tableFound: true,
      count: count ?? 0,
      message: `Conectado com sucesso ao Supabase! Tabela 'historico_seguidores' ativa com ${count ?? 0} registros.`,
    };
  } catch (err: any) {
    return {
      connected: false,
      tableFound: false,
      count: 0,
      message: `Erro de conexão: ${err.message}`,
    };
  }
}

/**
 * Busca todos os registros da tabela historico_seguidores no Supabase
 */
export async function fetchHistoricoFromSupabase(): Promise<HistoricoSeguidoresRecord[] | null> {
  const client = await getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from("historico_seguidores")
      .select("*")
      .order("date", { ascending: true })
      .order("profile_handle", { ascending: true });

    if (error) {
      console.warn("[Supabase] Erro ao buscar registros:", error.message);
      return null;
    }

    if (!data) return [];

    return data.map((item: any) => ({
      id: item.id || `hs-sb-${item.profile_handle}-${item.date}`,
      profile_handle: item.profile_handle,
      profile_name: item.profile_name || item.profile_handle,
      date: item.date,
      followers_count: Number(item.followers_count),
      type: (item.type as ProfileType) || "Minha Página",
      page_id: item.page_id || undefined,
      created_at: item.created_at || new Date().toISOString(),
    }));
  } catch (err) {
    console.warn("[Supabase] Exceção ao buscar do banco:", err);
    return null;
  }
}

/**
 * Salva ou atualiza uma linha no Supabase (upsert com conflito em profile_handle, date)
 */
export async function upsertRecordToSupabase(record: HistoricoSeguidoresRecord): Promise<boolean> {
  const client = await getSupabaseClient();
  if (!client) return false;

  try {
    const payload = {
      profile_handle: record.profile_handle,
      profile_name: record.profile_name,
      date: record.date,
      followers_count: record.followers_count,
      type: record.type,
      page_id: record.page_id || null,
      created_at: record.created_at || new Date().toISOString(),
    };

    const { error } = await client
      .from("historico_seguidores")
      .upsert(payload, { onConflict: "profile_handle,date" });

    if (error) {
      console.error("[Supabase] Erro no upsert:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[Supabase] Exceção no upsert:", err);
    return false;
  }
}

/**
 * Salva lote de registros no Supabase
 */
export async function upsertBatchToSupabase(records: HistoricoSeguidoresRecord[]): Promise<{
  success: boolean;
  count: number;
}> {
  const client = await getSupabaseClient();
  if (!client || records.length === 0) return { success: false, count: 0 };

  try {
    const payload = records.map((r) => ({
      profile_handle: r.profile_handle,
      profile_name: r.profile_name,
      date: r.date,
      followers_count: r.followers_count,
      type: r.type,
      page_id: r.page_id || null,
      created_at: r.created_at || new Date().toISOString(),
    }));

    const { error } = await client
      .from("historico_seguidores")
      .upsert(payload, { onConflict: "profile_handle,date" });

    if (error) {
      console.error("[Supabase] Erro no lote:", error.message);
      return { success: false, count: 0 };
    }

    return { success: true, count: records.length };
  } catch (err) {
    console.error("[Supabase] Exceção no lote:", err);
    return { success: false, count: 0 };
  }
}
