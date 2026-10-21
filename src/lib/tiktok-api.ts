/**
 * Módulo de Integração Oficial do TikTok Developer API v2
 * Suporta Login Kit (OAuth 2.0) e Content Posting API (Direct Post)
 */
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { safeCwd } from "./env-safe";

const DATA_DIR = path.resolve(safeCwd(), "data");
const CONFIG_FILE = path.join(DATA_DIR, "tiktok_config.json");

export interface StoredTikTokConfig {
  clientKey: string;
  clientSecret: string;
  accessToken?: string | undefined;
  refreshToken?: string | undefined;
  openId?: string | undefined;
  displayName?: string | undefined;
  avatarUrl?: string | undefined;
  expiresAt?: number | undefined;
  updatedAt?: string | undefined;
}

const DEFAULT_CLIENT_KEY = process.env["TIKTOK_CLIENT_KEY"] || "awskq2nyl73e2300";
const DEFAULT_CLIENT_SECRET = process.env["TIKTOK_CLIENT_SECRET"] || "zq1Y0l0kUFzyNxBqFg1fHsNrwgWn6id5";

let inMemoryTikTokConfig: StoredTikTokConfig | null = {
  clientKey: DEFAULT_CLIENT_KEY,
  clientSecret: DEFAULT_CLIENT_SECRET,
};

async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // Ambiente somente-leitura ou nuvem
  }
}

export async function getSavedTikTokConfig(): Promise<StoredTikTokConfig | null> {
  await ensureDataDir();
  try {
    if (!fsSync.existsSync(CONFIG_FILE)) {
      return inMemoryTikTokConfig;
    }
    const raw = await fs.readFile(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      inMemoryTikTokConfig = {
        clientKey: DEFAULT_CLIENT_KEY,
        clientSecret: DEFAULT_CLIENT_SECRET,
        ...parsed,
      };
      return inMemoryTikTokConfig;
    }
    return inMemoryTikTokConfig;
  } catch (err) {
    console.warn("[TikTokConfigStore] Erro ao ler tiktok_config.json:", err);
    return inMemoryTikTokConfig;
  }
}

export async function saveTikTokConfig(config: Partial<StoredTikTokConfig>): Promise<StoredTikTokConfig> {
  await ensureDataDir();
  const existing = (await getSavedTikTokConfig()) || {
    clientKey: "",
    clientSecret: "",
  };

  const updated: StoredTikTokConfig = {
    ...existing,
    ...config,
    updatedAt: new Date().toISOString(),
  };

  inMemoryTikTokConfig = updated;
  try {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(updated, null, 2), "utf-8");
  } catch (err) {
    console.warn("[TikTokConfigStore] Não foi possível persistir no disco:", err);
  }
  return updated;
}

import crypto from "node:crypto";

/**
 * Gera par PKCE (code_verifier e code_challenge no padrão lower-case hex SHA-256 exigido pelo TikTok)
 */
export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString("hex"); // 64 caracteres [a-f0-9]
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("hex"); // 64 caracteres hex minúsculo
  return { codeVerifier, codeChallenge };
}

/**
 * Gera URL de autenticação OAuth 2.0 do TikTok com suporte obrigatório a PKCE (code_challenge)
 */
export function getTikTokAuthUrl(
  clientKey: string,
  redirectUri: string,
  codeChallenge?: string,
  state = "flashdark_oauth",
  profileId?: string,
): { authUrl: string; codeVerifier?: string; state: string } {
  let verifier = "";
  let challenge = codeChallenge;

  if (!challenge) {
    const pkce = generatePkcePair();
    verifier = pkce.codeVerifier;
    challenge = pkce.codeChallenge;
  }

  let finalState = state;
  if (finalState === "flashdark_oauth") {
    finalState = profileId && verifier ? `fd_${verifier}_${profileId}` : verifier ? `fd_${verifier}` : `flashdark_${Date.now()}`;
  }

  const scope = "user.info.basic,video.upload,video.publish";
  const params = new URLSearchParams({
    client_key: clientKey,
    scope,
    response_type: "code",
    redirect_uri: redirectUri,
    state: finalState,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  return {
    authUrl: `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`,
    codeVerifier: verifier || undefined,
    state: finalState,
  };
}

/**
 * Troca código OAuth por Access Token do TikTok com suporte a code_verifier do PKCE
 */
export async function exchangeTikTokCode(
  clientKey: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
  codeVerifier?: string,
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const params = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });

    if (codeVerifier) {
      params.append("code_verifier", codeVerifier);
    }

    const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
      },
      body: params.toString(),
    });

    const json = (await res.json()) as any;
    if (json.error || !json.access_token) {
      return {
        success: false,
        error: json.error_description || json.message || json.error || "Falha na troca de token do TikTok",
      };
    }

    const expiresAt = Date.now() + (json.expires_in || 86400) * 1000;
    await saveTikTokConfig({
      clientKey,
      clientSecret,
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      openId: json.open_id,
      expiresAt,
    });

    return { success: true, data: json };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Obtém dados básicos do perfil autenticado
 */
export async function fetchTikTokUserInfo(accessToken: string): Promise<{ success: boolean; user?: any; error?: string }> {
  try {
    const fields = "open_id,union_id,avatar_url,display_name,bio_description,is_verified";
    const res = await fetch(`https://open.tiktokapis.com/v2/user/info/?fields=${fields}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const json = (await res.json()) as any;
    if (json.data?.user) {
      const u = json.data.user;
      await saveTikTokConfig({
        displayName: u.display_name,
        avatarUrl: u.avatar_url,
      });
      return { success: true, user: u };
    }
    return { success: false, error: json.error?.message || "Erro ao consultar dados do usuário no TikTok" };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
