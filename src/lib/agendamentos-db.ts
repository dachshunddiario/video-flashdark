import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  type AgendamentoInstagram,
  type AgendamentoStatus,
} from "./types";
import { getSupabaseClient } from "./supabase";
import { safeCwd } from "./env-safe";

const DATA_DIR = path.resolve(safeCwd(), "data");
const DB_FILE = path.join(DATA_DIR, "agendamentos_instagram.json");

let memoryAgendamentos: AgendamentoInstagram[] = [];

// Garante que o diretório data/ exista
async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // Ambiente somente-leitura ou cloud (ex: Lovable preview)
  }
}

/**
 * Definição SQL para criação da tabela no Supabase.
 */
export const AGENDAMENTOS_SUPABASE_SQL = `-- Tabela de Agendamento de Publicações para Instagram
CREATE TABLE IF NOT EXISTS "Agendamentos_Instagram" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_type TEXT NOT NULL CHECK (media_type IN ('IMAGE', 'REELS')),
  media_url TEXT NOT NULL,
  caption TEXT,
  scheduled_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'AGENDADO' CHECK (status IN ('AGENDADO', 'PUBLICANDO', 'PUBLICADO', 'ERRO')),
  instagram_account_id TEXT,
  target_username TEXT,
  creation_id TEXT,
  post_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices recomendados para alta performance da rotina cron
CREATE INDEX IF NOT EXISTS idx_agendamentos_status_scheduled 
ON "Agendamentos_Instagram" (status, scheduled_time);


-- Política de RLS (Permitir acesso completo para chave de serviço ou anon configurado)
ALTER TABLE "Agendamentos_Instagram" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso Total Agendamentos" ON "Agendamentos_Instagram"
FOR ALL USING (true) WITH CHECK (true);
`;

/**
 * Lê todos os agendamentos cadastrados.
 * 1. Tenta carregar do Supabase se configurado.
 * 2. Fallback resiliente para o arquivo JSON local data/agendamentos_instagram.json.
 */
export async function getAllAgendamentos(): Promise<AgendamentoInstagram[]> {
  await ensureDataDir();

  // 1. Tenta buscar do Supabase se estiver configurado
  try {
    const client = await getSupabaseClient();
    if (client) {
      const { data, error } = await client
        .from("Agendamentos_Instagram")
        .select("*")
        .order("scheduled_time", { ascending: true });

      if (!error && Array.isArray(data) && data.length > 0) {
        // Atualiza cache local silenciosamente
        saveAllLocal(data as AgendamentoInstagram[]).catch(() => {});
        memoryAgendamentos = data as AgendamentoInstagram[];
        return data as AgendamentoInstagram[];
      }
    }
  } catch (err) {
    console.warn("[AgendamentosDB] Supabase inacessível, utilizando armazenamento local:", err);
  }

  // 2. Fallback para arquivo JSON local
  try {
    if (!fsSync.existsSync(DB_FILE)) {
      return memoryAgendamentos;
    }
    const raw = await fs.readFile(DB_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memoryAgendamentos = parsed;
      return parsed;
    }
    return memoryAgendamentos;
  } catch (err) {
    console.warn("[AgendamentosDB] Erro ao ler banco local:", err);
    return memoryAgendamentos;
  }
}

/**
 * Salva a lista completa no arquivo local.
 */
async function saveAllLocal(records: AgendamentoInstagram[]): Promise<void> {
  memoryAgendamentos = records;
  await ensureDataDir();
  try {
    await fs.writeFile(DB_FILE, JSON.stringify(records, null, 2), "utf-8");
  } catch (err) {
    console.warn("[AgendamentosDB] Não foi possível persistir em disco:", err);
  }
}

/**
 * Retorna um agendamento específico pelo ID.
 */
export async function getAgendamentoById(id: string): Promise<AgendamentoInstagram | null> {
  const all = await getAllAgendamentos();
  return all.find((item) => item.id === id) || null;
}

/**
 * Cria ou atualiza um agendamento.
 */
export async function upsertAgendamento(
  item: Partial<AgendamentoInstagram> & { media_type: "IMAGE" | "REELS"; media_url: string; scheduled_time: string },
): Promise<AgendamentoInstagram> {
  await ensureDataDir();
  const all = await getAllAgendamentos();

  const id = item.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36));
  const now = new Date().toISOString();

  const existingIndex = all.findIndex((r) => r.id === id);
  const existing = existingIndex >= 0 ? all[existingIndex] : null;

  const record: AgendamentoInstagram = {
    id,
    media_type: item.media_type,
    media_url: item.media_url,
    caption: item.caption || "",
    scheduled_time: item.scheduled_time,
    status: item.status || "AGENDADO",
    destination_platform: item.destination_platform || existing?.destination_platform || "INSTAGRAM",
    instagram_account_id: item.instagram_account_id !== undefined ? (item.instagram_account_id ?? null) : (existing?.instagram_account_id ?? null),
    target_username: item.target_username !== undefined ? (item.target_username ?? null) : (existing?.target_username ?? null),
    facebook_page_id: item.facebook_page_id !== undefined ? (item.facebook_page_id ?? null) : (existing?.facebook_page_id ?? null),
    facebook_page_name: item.facebook_page_name !== undefined ? (item.facebook_page_name ?? null) : (existing?.facebook_page_name ?? null),
    facebook_post_id: item.facebook_post_id !== undefined ? (item.facebook_post_id ?? null) : (existing?.facebook_post_id ?? null),
    connection_id: item.connection_id !== undefined ? (item.connection_id ?? null) : (existing?.connection_id ?? null),
    creation_id: item.creation_id ?? null,
    post_id: item.post_id ?? null,
    error_message: item.error_message ?? null,
    created_at: existing ? existing.created_at : (item.created_at || now),
    updated_at: now,
  };

  if (existingIndex >= 0) {
    all[existingIndex] = record;
  } else {
    all.push(record);
  }

  // Ordena por scheduled_time
  all.sort((a, b) => new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime());

  await saveAllLocal(all);

  // Sincroniza com Supabase se disponível
  try {
    const client = await getSupabaseClient();
    if (client) {
      await client.from("Agendamentos_Instagram").upsert(record);
    }
  } catch (err) {
    console.warn("[AgendamentosDB] Erro ao sincronizar com Supabase:", err);
  }

  return record;
}

/**
 * Exclui um agendamento pelo ID.
 */
export async function deleteAgendamento(id: string): Promise<boolean> {
  await ensureDataDir();
  const all = await getAllAgendamentos();
  const filtered = all.filter((r) => r.id !== id);

  if (filtered.length === all.length) {
    return false;
  }

  await saveAllLocal(filtered);

  try {
    const client = await getSupabaseClient();
    if (client) {
      await client.from("Agendamentos_Instagram").delete().eq("id", id);
    }
  } catch (err) {
    console.warn("[AgendamentosDB] Erro ao deletar no Supabase:", err);
  }

  return true;
}

/**
 * Busca agendamentos prontos para disparo:
 * status == 'AGENDADO' e scheduled_time <= agora
 */
export async function getPendingAgendamentos(
  nowIso = new Date().toISOString(),
): Promise<AgendamentoInstagram[]> {
  const all = await getAllAgendamentos();
  const nowTs = new Date(nowIso).getTime();

  return all.filter((item) => {
    if (item.status !== "AGENDADO") return false;
    const itemTs = new Date(item.scheduled_time).getTime();
    return !isNaN(itemTs) && itemTs <= nowTs;
  });
}

/**
 * Atualiza o status e detalhes de um agendamento.
 */
export async function updateAgendamentoStatus(
  id: string,
  status: AgendamentoStatus,
  patch: Partial<AgendamentoInstagram> = {},
): Promise<AgendamentoInstagram | null> {
  const all = await getAllAgendamentos();
  const index = all.findIndex((r) => r.id === id);

  if (index === -1 || !all[index]) return null;

  const current = all[index]!;
  const updated: AgendamentoInstagram = {
    id: current.id,
    media_type: patch.media_type ?? current.media_type,
    media_url: patch.media_url ?? current.media_url,
    caption: patch.caption ?? current.caption,
    scheduled_time: patch.scheduled_time ?? current.scheduled_time,
    status,
    destination_platform: patch.destination_platform ?? current.destination_platform ?? "INSTAGRAM",
    instagram_account_id: patch.instagram_account_id !== undefined ? (patch.instagram_account_id ?? null) : (current.instagram_account_id ?? null),
    target_username: patch.target_username !== undefined ? (patch.target_username ?? null) : (current.target_username ?? null),
    facebook_page_id: patch.facebook_page_id !== undefined ? (patch.facebook_page_id ?? null) : (current.facebook_page_id ?? null),
    facebook_page_name: patch.facebook_page_name !== undefined ? (patch.facebook_page_name ?? null) : (current.facebook_page_name ?? null),
    facebook_post_id: patch.facebook_post_id !== undefined ? (patch.facebook_post_id ?? null) : (current.facebook_post_id ?? null),
    connection_id: patch.connection_id !== undefined ? (patch.connection_id ?? null) : (current.connection_id ?? null),
    creation_id: patch.creation_id !== undefined ? (patch.creation_id ?? null) : (current.creation_id ?? null),
    post_id: patch.post_id !== undefined ? (patch.post_id ?? null) : (current.post_id ?? null),
    error_message: patch.error_message !== undefined ? (patch.error_message ?? null) : (current.error_message ?? null),
    created_at: current.created_at,
    updated_at: new Date().toISOString(),
  };

  all[index] = updated;
  await saveAllLocal(all);

  try {
    const client = await getSupabaseClient();
    if (client) {
      await client
        .from("Agendamentos_Instagram")
        .update({
          status: updated.status,
          creation_id: updated.creation_id,
          post_id: updated.post_id,
          error_message: updated.error_message,
          updated_at: updated.updated_at,
        })
        .eq("id", id);
    }
  } catch (err) {
    console.warn("[AgendamentosDB] Erro ao atualizar status no Supabase:", err);
  }

  return updated;
}
