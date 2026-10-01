import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  type HistoricoSeguidoresRecord,
  type GrowthCalculationResult,
  type CronRunResult,
  type ProfileType,
} from "./types";
import {
  fetchHistoricoFromSupabase,
  upsertRecordToSupabase,
  upsertBatchToSupabase,
} from "./supabase";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "historico_seguidores.json");
const AUDIT_FILE = path.join(DATA_DIR, "cron_audit.log");

// Garante que o diretório data/ exista
async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

/**
 * Lê todos os registros da tabela Historico_Seguidores.
 * 1. Prioriza o Supabase quando configurado.
 * 2. Fallback transparente para o arquivo local data/historico_seguidores.json.
 */
export async function getAllHistoricoRecords(): Promise<HistoricoSeguidoresRecord[]> {
  await ensureDataDir();

  // 1. Tenta buscar do Supabase se estiver conectado
  try {
    const supabaseRecords = await fetchHistoricoFromSupabase();
    if (supabaseRecords && supabaseRecords.length > 0) {
      // Atualiza o cache local silenciosamente para resiliência offline
      saveAllHistoricoRecords(supabaseRecords).catch(() => {});
      return supabaseRecords;
    }
  } catch (err) {
    console.warn("[HistoricoDB] Supabase inacessível, utilizando cache local:", err);
  }

  // 2. Fallback para arquivo local
  try {
    if (!fsSync.existsSync(DB_FILE)) {
      return [];
    }
    const raw = await fs.readFile(DB_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("[HistoricoDB] Erro ao ler banco de dados local:", err);
    return [];
  }
}

/**
 * Salva a lista completa de registros no arquivo JSON local.
 */
async function saveAllHistoricoRecords(records: HistoricoSeguidoresRecord[]): Promise<void> {
  await ensureDataDir();
  const tmpFile = `${DB_FILE}.tmp.${Date.now()}`;
  await fs.writeFile(tmpFile, JSON.stringify(records, null, 2), "utf-8");
  await fs.rename(tmpFile, DB_FILE);
}

/**
 * Normaliza o handle para garantir o padrão com '@' no início.
 */
export function normalizeHandle(handle: string): string {
  const clean = handle.trim().replace(/^@+/, "").toLowerCase();
  return clean ? `@${clean}` : "";
}

/**
 * Passo 1: Insere ou atualiza uma "foto diária" na tabela Historico_Seguidores.
 * Se já existir uma foto para o mesmo perfil na mesma data, atualiza o valor.
 */
export async function upsertHistoricoRecord(record: {
  id?: string | undefined;
  profile_handle: string;
  profile_name: string;
  date: string; // YYYY-MM-DD
  followers_count: number;
  type: ProfileType;
  page_id?: string | undefined;
}): Promise<HistoricoSeguidoresRecord> {
  const records = await getAllHistoricoRecords();
  const handle = normalizeHandle(record.profile_handle);
  const dateStr = record.date.slice(0, 10);

  const existingIdx = records.findIndex(
    (r) => normalizeHandle(r.profile_handle) === handle && r.date === dateStr,
  );

  const updatedRecord: HistoricoSeguidoresRecord = {
    id: record.id || `hs-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    profile_handle: handle,
    profile_name: record.profile_name || handle,
    date: dateStr,
    followers_count: Math.max(0, Math.round(record.followers_count)),
    type: record.type,
    page_id: record.page_id,
    created_at: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    records[existingIdx] = {
      ...records[existingIdx],
      ...updatedRecord,
      id: records[existingIdx]!.id,
    };
  } else {
    records.push(updatedRecord);
  }

  // Ordena por data e handle
  records.sort((a, b) => a.date.localeCompare(b.date) || a.profile_handle.localeCompare(b.profile_handle));

  await saveAllHistoricoRecords(records);

  // Sincronização atômica em segundo plano com o Supabase (se configurado)
  upsertRecordToSupabase(updatedRecord).catch((err) => {
    console.warn("[HistoricoDB] Aviso ao persistir no Supabase:", err);
  });

  return updatedRecord;
}

/**
 * Insere lote de registros na tabela Historico_Seguidores.
 */
export async function upsertHistoricoBatch(
  batch: Array<{
    id?: string | undefined;
    profile_handle: string;
    profile_name: string;
    date: string;
    followers_count: number;
    type: ProfileType;
    page_id?: string | undefined;
  }>,
): Promise<{ inserted: number; updated: number; total: number }> {
  const records = await getAllHistoricoRecords();
  let inserted = 0;
  let updated = 0;

  for (const item of batch) {
    const handle = normalizeHandle(item.profile_handle);
    const dateStr = item.date.slice(0, 10);
    const existingIdx = records.findIndex(
      (r) => normalizeHandle(r.profile_handle) === handle && r.date === dateStr,
    );

    const fullItem: HistoricoSeguidoresRecord = {
      id: item.id || `hs-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      profile_handle: handle,
      profile_name: item.profile_name || handle,
      date: dateStr,
      followers_count: Math.max(0, Math.round(item.followers_count)),
      type: item.type,
      page_id: item.page_id,
      created_at: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      records[existingIdx] = {
        ...records[existingIdx],
        ...fullItem,
        id: records[existingIdx]!.id,
      };
      updated++;
    } else {
      records.push(fullItem);
      inserted++;
    }
  }

  records.sort((a, b) => a.date.localeCompare(b.date) || a.profile_handle.localeCompare(b.profile_handle));
  await saveAllHistoricoRecords(records);

  // Sincronização de lote com o Supabase
  upsertBatchToSupabase(records).catch((err) => {
    console.warn("[HistoricoDB] Aviso ao sincronizar lote no Supabase:", err);
  });

  return { inserted, updated, total: records.length };
}

/**
 * Sincroniza todos os registros locais para a tabela historico_seguidores do Supabase.
 */
export async function syncAllToSupabase(): Promise<{
  success: boolean;
  totalSynced: number;
  message: string;
}> {
  const localRecords = await getAllHistoricoRecords();
  if (localRecords.length === 0) {
    return { success: true, totalSynced: 0, message: "Nenhum registro local para sincronizar." };
  }

  const result = await upsertBatchToSupabase(localRecords);
  if (!result.success) {
    return {
      success: false,
      totalSynced: 0,
      message: "Falha ao enviar registros para o Supabase. Verifique a URL e a Anon Key.",
    };
  }

  return {
    success: true,
    totalSynced: result.count,
    message: `${result.count} registro(s) sincronizados com sucesso na tabela 'historico_seguidores' do Supabase!`,
  };
}

/**
 * Passo 4: Fazer a Matemática do Crescimento (A Lógica Exata)
 * Busca o Total Inicial na Data Inicial, o Total Final na Data Final,
 * e calcula: Total Final - Total Inicial = Crescimento do período.
 */
export async function calculateGrowthBetweenDates(
  profile_handle: string,
  startDate: string,
  endDate: string,
): Promise<GrowthCalculationResult> {
  const records = await getAllHistoricoRecords();
  const handle = normalizeHandle(profile_handle);

  // Filtra todos os registros deste perfil ordenados por data
  const profileRecords = records
    .filter((r) => normalizeHandle(r.profile_handle) === handle)
    .sort((a, b) => a.date.localeCompare(b.date));

  const profileName = profileRecords[0]?.profile_name || handle;
  const profileType: ProfileType = profileRecords[0]?.type || "Minha Página";

  if (profileRecords.length === 0) {
    return {
      profile_handle: handle,
      profile_name: profileName,
      type: profileType,
      startDate,
      endDate,
      initialFollowers: 0,
      finalFollowers: 0,
      growth: 0,
      percent: 0,
      days: 1,
      avgPerDay: 0,
    };
  }

  // 1. Buscar o Total Inicial: registro com data <= startDate mais próximo (ou primeiro disponível)
  let initialRecord = profileRecords.filter((r) => r.date <= startDate).pop();
  if (!initialRecord) {
    initialRecord = profileRecords[0];
  }

  // 2. Buscar o Total Final: registro com data <= endDate mais próximo (ou último disponível)
  let finalRecord = profileRecords.filter((r) => r.date <= endDate).pop();
  if (!finalRecord) {
    finalRecord = profileRecords[profileRecords.length - 1];
  }

  const initialFollowers = initialRecord?.followers_count ?? 0;
  const finalFollowers = finalRecord?.followers_count ?? initialFollowers;

  // 3. Cálculo de Crescimento: Total Final - Total Inicial
  const growth = finalFollowers - initialFollowers;
  const percent = initialFollowers > 0 ? (growth / initialFollowers) * 100 : 0;

  // Dias decorridos no período
  const dStart = new Date(`${startDate}T12:00:00`).getTime();
  const dEnd = new Date(`${endDate}T12:00:00`).getTime();
  const days = Math.max(1, Math.round(Math.abs(dEnd - dStart) / (24 * 60 * 60 * 1000)));
  const avgPerDay = Math.round((growth / days) * 10) / 10;

  return {
    profile_handle: handle,
    profile_name: profileName,
    type: profileType,
    startDate,
    endDate,
    initialFollowers,
    finalFollowers,
    growth,
    percent,
    days,
    avgPerDay,
  };
}

/**
 * Passo 2: Rotina Automatizada (Workflow Agendado / Cron Job)
 * Executa a rotina que roda diariamente às 23:59:
 * 1. Puxa a lista de todas as páginas monitoradas.
 * 2. Faz a requisição HTTP na API da Meta para cada uma delas.
 * 3. Pega o followers_count.
 * 4. Cria uma nova linha na tabela Historico_Seguidores com a data de hoje.
 */
export async function runDailyFollowersCron(params?: {
  accessToken?: string | undefined;
  pages?: Array<{
    id: string;
    handle: string;
    name: string;
    platform: string;
    isCompetitor: boolean;
    followersCount?: number | undefined;
  }> | undefined;
}): Promise<CronRunResult> {
  await ensureDataDir();
  const todayStr = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();
  const details: CronRunResult["details"] = [];
  let snapshotsSaved = 0;

  let pagesToProcess = params?.pages && params.pages.length > 0 ? params.pages : [];
  if (pagesToProcess.length === 0) {
    const existing = await getAllHistoricoRecords();
    const map = new Map<string, { id: string; handle: string; name: string; platform: string; isCompetitor: boolean; followersCount?: number }>();
    for (const rec of existing) {
      if (!map.has(rec.profile_handle)) {
        map.set(rec.profile_handle, {
          id: rec.page_id || rec.profile_handle,
          handle: rec.profile_handle,
          name: rec.profile_name || rec.profile_handle,
          platform: "instagram",
          isCompetitor: rec.type === "Concorrente",
          followersCount: rec.followers_count,
        });
      }
    }
    pagesToProcess = Array.from(map.values());
  }

  // Se o token da Meta estiver disponível, tenta atualizar seguidores ao vivo
  const accessToken = params?.accessToken || "";

  for (const page of pagesToProcess) {
    const handle = normalizeHandle(page.handle);
    const type: ProfileType = page.isCompetitor ? "Concorrente" : "Minha Página";
    let followers = page.followersCount ?? 0;
    let status = "Salvo com sucesso";

    // Se temos token da Meta e for página própria do Instagram ou Facebook
    if (accessToken && !page.isCompetitor) {
      try {
        if (page.platform === "facebook") {
          const fbRes = await fetch(
            `https://graph.facebook.com/v21.0/${page.id}?fields=followers_count,fan_count&access_token=${accessToken}`,
          );
          const fbData = (await fbRes.json()) as any;
          if (fbData.followers_count || fbData.fan_count) {
            followers = fbData.followers_count ?? fbData.fan_count;
            status = "Sincronizado via Meta Graph API";
          }
        } else if (page.platform === "instagram") {
          const igRes = await fetch(
            `https://graph.facebook.com/v21.0/${page.id}?fields=followers_count,media_count&access_token=${accessToken}`,
          );
          const igData = (await igRes.json()) as any;
          if (igData.followers_count !== undefined) {
            followers = igData.followers_count;
            status = "Sincronizado via Instagram Graph API";
          }
        }
      } catch (err: any) {
        status = `Fallback para seguidores em cache (${err.message})`;
      }
    }

    // Cria ou atualiza a linha na tabela Historico_Seguidores
    await upsertHistoricoRecord({
      profile_handle: handle,
      profile_name: page.name || handle,
      date: todayStr,
      followers_count: followers,
      type,
      page_id: page.id,
    });

    snapshotsSaved++;
    details.push({
      profile_handle: handle,
      followers_count: followers,
      type,
      status,
    });
  }

  // Registra no arquivo de auditoria cron_audit.log
  const logLine = `[${nowIso}] CRON EXECUTADO: ${snapshotsSaved} páginas fotografadas para a data ${todayStr}. Detalhes: ${JSON.stringify(details)}\n`;
  try {
    await fs.appendFile(AUDIT_FILE, logLine, "utf-8");
  } catch {
    // segue
  }

  return {
    success: true,
    timestamp: nowIso,
    executedAt: `${todayStr} às ${nowIso.slice(11, 16)}`,
    profilesProcessed: pagesToProcess.length,
    snapshotsSaved,
    details,
  };
}

/**
 * Retorna o status e metadados do Cron Agendado.
 */
export async function getCronStatus(): Promise<{
  active: boolean;
  schedule: string;
  targetTime: string;
  lastExecution?: string;
  totalRecordsInDb: number;
}> {
  await ensureDataDir();
  const records = await getAllHistoricoRecords();

  let lastExecution = "Nenhuma execução registrada";
  try {
    if (fsSync.existsSync(AUDIT_FILE)) {
      const auditContent = await fs.readFile(AUDIT_FILE, "utf-8");
      const lines = auditContent.trim().split("\n");
      if (lines.length > 0) {
        lastExecution = lines[lines.length - 1]!.slice(1, 20).replace("T", " ");
      }
    }
  } catch {
    // segue
  }

  return {
    active: true,
    schedule: "Diariamente às 23:59 (0 23:59 * * *)",
    targetTime: "23:59",
    lastExecution,
    totalRecordsInDb: records.length,
  };
}
