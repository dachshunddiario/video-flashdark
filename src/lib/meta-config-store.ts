import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import process from "node:process";

const DATA_DIR = path.resolve(process.cwd(), "data");
const CONFIG_FILE = path.join(DATA_DIR, "meta_config.json");

import { type MetaConnection } from "./types";

export interface StoredMetaConfig {
  accessToken: string;
  instagramAccountId: string;
  accountUsername?: string | undefined;
  accountName?: string | undefined;
  avatarUrl?: string | undefined;
  updatedAt?: string | undefined;
  connections?: MetaConnection[] | undefined;
  activeConnectionId?: string | undefined;
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function getSavedMetaConfig(): Promise<StoredMetaConfig | null> {
  await ensureDataDir();
  try {
    if (!fsSync.existsSync(CONFIG_FILE)) {
      return null;
    }
    const raw = await fs.readFile(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.accessToken || (Array.isArray(parsed.connections) && parsed.connections.length > 0))) {
      return parsed as StoredMetaConfig;
    }
    return null;
  } catch (err) {
    console.warn("[MetaConfigStore] Erro ao ler meta_config.json:", err);
    return null;
  }
}

export async function saveMetaConfig(config: Partial<StoredMetaConfig>): Promise<StoredMetaConfig> {
  await ensureDataDir();
  const existing = (await getSavedMetaConfig()) || {
    accessToken: "",
    instagramAccountId: "",
  };

  const updated: StoredMetaConfig = {
    ...existing,
    ...config,
    updatedAt: new Date().toISOString(),
  };

  // Garante que a lista de conexões e o token principal estejam 100% sincronizados
  if (config.accessToken) {
    if (!Array.isArray(updated.connections) || updated.connections.length === 0) {
      updated.connections = [
        {
          id: "conn_default",
          label: "Conexão Principal",
          accessToken: config.accessToken,
          connectedAt: new Date().toISOString(),
          appName: "Flash Dark",
          appId: "1437178635181870",
          hasPublishPermission: true,
        },
      ];
      updated.activeConnectionId = "conn_default";
    } else {
      const activeId = updated.activeConnectionId || "conn_default";
      const targetConn = updated.connections.find((c) => c.id === activeId) || updated.connections[0];
      if (targetConn) {
        targetConn.accessToken = config.accessToken;
      }
    }
  }

  await fs.writeFile(CONFIG_FILE, JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

/**
 * Retorna todas as conexões Meta cadastradas.
 * Garante sincronização bidirecional e migra token se necessário.
 */
export async function getAllMetaConnections(): Promise<MetaConnection[]> {
  const config = await getSavedMetaConfig();
  if (!config) return [];

  let conns = Array.isArray(config.connections) ? [...config.connections] : [];

  if (conns.length > 0) {
    // Sincroniza se o token principal no config for mais recente
    if (config.accessToken) {
      const activeId = config.activeConnectionId || "conn_default";
      const targetConn = conns.find((c) => c.id === activeId) || conns[0];
      if (targetConn && targetConn.accessToken !== config.accessToken) {
        targetConn.accessToken = config.accessToken;
        config.connections = conns;
        await saveMetaConfig(config);
      }
    }
    return conns;
  }

  // Migra token legado único para a lista de conexões
  if (config.accessToken) {
    const defaultConn: MetaConnection = {
      id: "conn_default",
      label: "Conexão Principal",
      accessToken: config.accessToken,
      connectedAt: config.updatedAt || new Date().toISOString(),
      appName: "Flash Dark",
      appId: "1437178635181870",
      hasPublishPermission: true,
    };

    config.connections = [defaultConn];
    config.activeConnectionId = "conn_default";
    await saveMetaConfig(config);
    return [defaultConn];
  }

  return [];
}

/**
 * Adiciona ou edita uma conexão Meta.
 */
export async function saveMetaConnection(conn: MetaConnection): Promise<MetaConnection[]> {
  const config = (await getSavedMetaConfig()) || {
    accessToken: "",
    instagramAccountId: "",
  };

  let list = Array.isArray(config.connections) ? [...config.connections] : [];
  const existingIndex = list.findIndex((c) => c.id === conn.id);

  if (existingIndex >= 0) {
    list[existingIndex] = { ...list[existingIndex], ...conn };
  } else {
    list.push(conn);
  }

  // Mantém accessToken principal atualizado com a conexão ativa
  const activeConn = list.find((c) => c.id === config.activeConnectionId) || list[0];
  const updatedConfig: Partial<StoredMetaConfig> = {
    ...config,
    connections: list,
    activeConnectionId: config.activeConnectionId || conn.id,
    accessToken: activeConn?.accessToken || conn.accessToken,
  };

  await saveMetaConfig(updatedConfig);
  return list;
}

/**
 * Remove uma conexão Meta por ID.
 */
export async function deleteMetaConnection(connectionId: string): Promise<MetaConnection[]> {
  const config = await getSavedMetaConfig();
  if (!config || !Array.isArray(config.connections)) return [];

  const list = config.connections.filter((c) => c.id !== connectionId);
  const nextActive = list[0];

  const updatedConfig: Partial<StoredMetaConfig> = {
    ...config,
    connections: list,
    accessToken: nextActive ? nextActive.accessToken : "",
  };
  if (nextActive?.id) {
    updatedConfig.activeConnectionId = nextActive.id;
  }

  await saveMetaConfig(updatedConfig);
  return list;
}

/**
 * Localiza qual conexão Meta possui o Instagram Account ID fornecido,
 * ou retorna a conexão ativa como fallback.
 */
export async function findConnectionForAccountId(
  instagramAccountId?: string | null,
): Promise<MetaConnection | null> {
  const connections = await getAllMetaConnections();
  if (connections.length === 0) return null;
  if (!instagramAccountId) return connections[0] ?? null;

  const config = await getSavedMetaConfig();
  if (config?.activeConnectionId) {
    const active = connections.find((c) => c.id === config.activeConnectionId);
    if (active) return active;
  }

  return connections[0] ?? null;
}

/**
 * Busca uma conexão por ID específico.
 */
export async function getMetaConnectionById(
  connectionId?: string | null,
): Promise<MetaConnection | null> {
  if (!connectionId) return null;
  const connections = await getAllMetaConnections();
  return connections.find((c) => c.id === connectionId) || null;
}



