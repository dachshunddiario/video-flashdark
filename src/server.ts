import "./lib/error-capture";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { safeCwd } from "./lib/env-safe";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  getAllHistoricoRecords,
  upsertHistoricoRecord,
  upsertHistoricoBatch,
  calculateGrowthBetweenDates,
  runDailyFollowersCron,
  getCronStatus,
  normalizeHandle,
  syncAllToSupabase,
} from "./lib/historico-db";
import {
  testSupabaseConnection,
  saveSupabaseConfig,
  getSupabaseConfig,
} from "./lib/supabase";
import {
  getAllAgendamentos,
  getAgendamentoById,
  upsertAgendamento,
  deleteAgendamento,
  AGENDAMENTOS_SUPABASE_SQL,
} from "./lib/agendamentos-db";
import {
  publishSingleAgendamento,
  runAgendamentosWorker,
} from "./lib/meta-publisher";
import {
  getSavedMetaConfig,
  saveMetaConfig,
  getAllMetaConnections,
  saveMetaConnection,
  deleteMetaConnection,
  findConnectionForAccountId,
  getMetaConnectionById,
  updateConnectionTikTok,
} from "./lib/meta-config-store";
import { type MetaConnection } from "./lib/types";
import {
  getSavedTikTokConfig,
  saveTikTokConfig,
  getTikTokAuthUrl,
  exchangeTikTokCode,
  fetchTikTokUserInfo,
} from "./lib/tiktok-api";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// Diretório nativo de templates dentro do projeto: <projectRoot>/templates
const TEMPLATES_DIR = path.resolve(safeCwd(), "templates");

function sanitizeFileName(name: string): string {
  const clean = name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .toLowerCase();
  return clean.replace(/^template_/, "");
}

/**
 * Roteamento da API nativa de templates (/api/templates).
 * Permite que a aplicação salve e leia arquivos .json diretamente na pasta "templates" do projeto.
 */
async function handleTemplatesApi(request: Request): Promise<Response> {
  await fs.mkdir(TEMPLATES_DIR, { recursive: true });
  const url = new URL(request.url);

  // 1. GET /api/templates — Lista todos os templates salvos na pasta templates/
  if (request.method === "GET") {
    try {
      const files = await fs.readdir(TEMPLATES_DIR);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));

      const templatesList: any[] = [];

      for (const fileName of jsonFiles) {
        try {
          const filePath = path.join(TEMPLATES_DIR, fileName);
          const raw = await fs.readFile(filePath, "utf-8");
          const parsed = JSON.parse(raw);

          // Suporta tanto formato direto TemplateVisual quanto objeto com chave template
          const templateData = parsed.template ? parsed.template : parsed;
          if (templateData && typeof templateData === "object") {
            const templateName =
              templateData.name ||
              parsed.name ||
              fileName.replace(/\.json$/, "").replace(/^template_/, "").replace(/^backup_/, "");

            templatesList.push({
              ...templateData,
              name: templateName,
              fileName,
            });
          }
        } catch (readErr) {
          console.warn(`Erro ao ler arquivo ${fileName}:`, readErr);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          folder: "templates",
          templates: templatesList,
          backups: [],
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, error: err.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // 2. POST /api/templates — Salva um template na pasta templates/
  if (request.method === "POST") {
    try {
      const body = await request.json();
      const template = body.template || body;
      const customName = body.name || template.name || "Template";
      const safeName = sanitizeFileName(customName);

      const fileName = `template_${safeName}.json`;
      const fileData = {
        ...template,
        name: customName,
        fileName,
      };

      const filePath = path.join(TEMPLATES_DIR, fileName);
      await fs.writeFile(filePath, JSON.stringify(fileData, null, 2), "utf-8");

      return new Response(
        JSON.stringify({
          success: true,
          fileName,
          folder: "templates",
          data: fileData,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, error: err.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // 3. DELETE /api/templates?name=...&file=... — Remove com garantia o template da pasta
  if (request.method === "DELETE") {
    try {
      const nameParam = (url.searchParams.get("name") || "").trim();
      const fileParam = (url.searchParams.get("file") || "").trim();
      const safeName = sanitizeFileName(nameParam);

      const files = await fs.readdir(TEMPLATES_DIR);
      let deleted = 0;

      for (const f of files) {
        if (!f.endsWith(".json")) continue;

        let shouldDelete = false;

        // 1. Coincidência direta de nome de arquivo
        if (fileParam && f.toLowerCase() === fileParam.toLowerCase()) {
          shouldDelete = true;
        } else if (f.toLowerCase() === nameParam.toLowerCase()) {
          shouldDelete = true;
        } else if (safeName && f.toLowerCase() === `template_${safeName}.json`.toLowerCase()) {
          shouldDelete = true;
        } else if (safeName && f.toLowerCase() === `${safeName}.json`.toLowerCase()) {
          shouldDelete = true;
        } else if (safeName && (f.startsWith("backup_") || f.startsWith("template_")) && f.includes(safeName)) {
          shouldDelete = true;
        }

        // 2. Se ainda não identificado, inspeciona o conteúdo do JSON
        if (!shouldDelete && nameParam) {
          try {
            const filePath = path.join(TEMPLATES_DIR, f);
            const content = await fs.readFile(filePath, "utf-8");
            const parsed = JSON.parse(content);
            const tmplName = parsed.name || parsed.template?.name || "";
            if (
              tmplName.trim().toLowerCase() === nameParam.toLowerCase() ||
              (safeName && sanitizeFileName(tmplName) === safeName)
            ) {
              shouldDelete = true;
            }
          } catch {}
        }

        if (shouldDelete) {
          const filePath = path.join(TEMPLATES_DIR, f);
          await fs.unlink(filePath).catch(() => {});
          deleted++;
        }
      }

      return new Response(
        JSON.stringify({ success: true, deleted }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, error: err.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  return new Response("Method not allowed", { status: 405 });
}

function getNvencFfmpegPath(): string {
  const gyanPath = path.join(
    process.env["LOCALAPPDATA"] || "",
    "Microsoft",
    "WinGet",
    "Packages",
    "Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe",
    "ffmpeg-9.0.2-full_build",
    "bin",
    "ffmpeg.exe",
  );
  if (fsSync.existsSync(gyanPath)) return gyanPath;
  return "ffmpeg";
}

/**
 * Interface para acompanhamento em tempo real de jobs de renderização NVENC
 */
interface NvencJobState {
  progress: number;
  fps: number;
  speed: string;
  time: number;
  duration: number;
  status: "starting" | "rendering" | "done" | "error";
  error?: string;
  updatedAt: number;
}

const activeNvencJobs = new Map<string, NvencJobState>();

// Limpeza de jobs expirados sob demanda (> 5 minutos de inatividade)
function cleanupExpiredNvencJobs() {
  const now = Date.now();
  for (const [id, job] of activeNvencJobs.entries()) {
    if (now - job.updatedAt > 5 * 60 * 1000) {
      activeNvencJobs.delete(id);
    }
  }
}

/**
 * Roteamento da API de Renderização com NVIDIA NVENC + CUDA (/api/render-nvenc).
 * Descarrega 100% do processamento do vídeo para a GPU RTX 3090 com aceleração de hardware instantânea.
 */
async function handleNvencApi(request: Request): Promise<Response> {
  cleanupExpiredNvencJobs();
  const url = new URL(request.url);
  const ffmpegPath = getNvencFfmpegPath();

  if (
    request.method === "GET" &&
    (url.pathname === "/api/render-nvenc" || url.pathname === "/api/render-nvenc/status")
  ) {
    return new Response(
      JSON.stringify({
        success: true,
        available: true,
        gpu: "NVIDIA RTX 3090",
        encoder: "h264_nvenc",
        hardwareAcceleration: "CUDA",
        ffmpeg: ffmpegPath,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // Consulta de progresso em tempo real da renderização na GPU
  if (request.method === "GET" && url.pathname === "/api/render-nvenc/progress") {
    const jobId = url.searchParams.get("id");
    if (!jobId || !activeNvencJobs.has(jobId)) {
      return new Response(
        JSON.stringify({ success: false, progress: 0, status: "unknown" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }
    const job = activeNvencJobs.get(jobId)!;
    return new Response(
      JSON.stringify({
        success: true,
        progress: job.progress,
        fps: job.fps,
        speed: job.speed,
        time: job.time,
        duration: job.duration,
        status: job.status,
        error: job.error,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  if (request.method === "POST" && url.pathname === "/api/render-nvenc") {
    const tempDir = path.join(
      os.tmpdir(),
      "nvenc_" + Math.random().toString(36).slice(2) + "_" + Date.now(),
    );
    await fs.mkdir(tempDir, { recursive: true });

    let currentJobId = "";

    try {
      const formData = await request.formData();
      const videoEntry = formData.get("video");
      const templateEntry = formData.get("templateImage");

      if (!videoEntry || !(videoEntry instanceof Blob)) {
        return new Response(
          JSON.stringify({ success: false, error: "Arquivo de vídeo não enviado." }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      currentJobId = (formData.get("jobId") as string) || `nvenc_${Date.now()}`;
      const videoDuration = parseFloat((formData.get("duration") as string) || "0");

      activeNvencJobs.set(currentJobId, {
        progress: 5,
        fps: 0,
        speed: "1x",
        time: 0,
        duration: videoDuration,
        status: "starting",
        updatedAt: Date.now(),
      });

      const inputVideoPath = path.join(tempDir, "input.mp4");
      const outputVideoPath = path.join(tempDir, "output.mp4");
      const templatePath = path.join(tempDir, "template.png");

      const videoBuffer = Buffer.from(await videoEntry.arrayBuffer());
      await fs.writeFile(inputVideoPath, videoBuffer);

      let hasTemplate = false;
      if (templateEntry && templateEntry instanceof Blob) {
        const templateBuffer = Buffer.from(await templateEntry.arrayBuffer());
        await fs.writeFile(templatePath, templateBuffer);
        hasTemplate = true;
      }

      const cropX = parseInt((formData.get("cropX") as string) || "0", 10);
      const cropY = parseInt((formData.get("cropY") as string) || "0", 10);
      const cropW = parseInt((formData.get("cropW") as string) || "0", 10);
      const cropH = parseInt((formData.get("cropH") as string) || "0", 10);

      const overlayX = parseInt((formData.get("overlayX") as string) || "0", 10);
      const overlayY = parseInt((formData.get("overlayY") as string) || "0", 10);
      const overlayW = parseInt((formData.get("overlayW") as string) || "1080", 10);
      const overlayH = parseInt((formData.get("overlayH") as string) || "1920", 10);
      const borderRadius = parseInt((formData.get("borderRadius") as string) || "0", 10);

      const keepAudio = (formData.get("keepAudio") as string) !== "false";
      const preset = (formData.get("preset") as string) || "p2";
      const cq = (formData.get("cq") as string) || "26";
      const targetBitrate = (formData.get("targetBitrate") as string) || "1600k";
      const maxBitrate = (formData.get("maxBitrate") as string) || "2200k";
      const bufSize = (formData.get("bufSize") as string) || "4400k";
      const rawBgColor = ((formData.get("bgColor") as string) || "#000000").trim();
      const ffmpegBgColor = rawBgColor.startsWith("#") ? `0x${rawBgColor.slice(1)}` : rawBgColor;

      const args: string[] = ["-y"];

      // Otimização de filtro: se o vídeo está dentro dos limites 1080x1920, usamos 'pad', que é muito mais rápido que 'overlay' duplo.
      // Se estiver fora dos limites (ex: overflow / coordenadas negativas), usamos overlay com fallback seguro.
      const canUsePad =
        overlayX >= 0 &&
        overlayY >= 0 &&
        overlayX + overlayW <= 1080 &&
        overlayY + overlayH <= 1920;

      if (hasTemplate) {
        args.push("-loop", "1", "-i", templatePath);
        args.push("-hwaccel", "cuda", "-i", inputVideoPath);

        let filter = "";
        if (canUsePad) {
          if (cropW > 0 && cropH > 0) {
            filter = `[1:v]crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${overlayW}:${overlayH},pad=1080:1920:${overlayX}:${overlayY}:color=${ffmpegBgColor}[v_padded];[v_padded][0:v]overlay=0:0:shortest=1[outv]`;
          } else {
            filter = `[1:v]scale=${overlayW}:${overlayH},pad=1080:1920:${overlayX}:${overlayY}:color=${ffmpegBgColor}[v_padded];[v_padded][0:v]overlay=0:0:shortest=1[outv]`;
          }
        } else {
          if (cropW > 0 && cropH > 0) {
            filter = `[1:v]crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${overlayW}:${overlayH}[v_scaled];color=c=${ffmpegBgColor}:s=1080x1920:d=1[bg];[bg][v_scaled]overlay=${overlayX}:${overlayY}[v_comp];[v_comp][0:v]overlay=0:0:shortest=1[outv]`;
          } else {
            filter = `[1:v]scale=${overlayW}:${overlayH}[v_scaled];color=c=${ffmpegBgColor}:s=1080x1920:d=1[bg];[bg][v_scaled]overlay=${overlayX}:${overlayY}[v_comp];[v_comp][0:v]overlay=0:0:shortest=1[outv]`;
          }
        }
        args.push("-filter_complex", filter);
        args.push("-map", "[outv]");
        if (keepAudio) {
          args.push("-map", "1:a?");
        }
      } else {
        args.push("-hwaccel", "cuda", "-i", inputVideoPath);
        let filter = "";
        if (canUsePad) {
          if (cropW > 0 && cropH > 0) {
            filter = `[0:v]crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${overlayW}:${overlayH},pad=1080:1920:${overlayX}:${overlayY}:color=${ffmpegBgColor}[outv]`;
          } else {
            filter = `[0:v]scale=${overlayW}:${overlayH},pad=1080:1920:${overlayX}:${overlayY}:color=${ffmpegBgColor}[outv]`;
          }
        } else {
          if (cropW > 0 && cropH > 0) {
            filter = `[0:v]crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${overlayW}:${overlayH}[v_scaled];color=c=${ffmpegBgColor}:s=1080x1920:d=1[bg];[bg][v_scaled]overlay=${overlayX}:${overlayY}[outv]`;
          } else {
            filter = `[0:v]scale=${overlayW}:${overlayH}[v_scaled];color=c=${ffmpegBgColor}:s=1080x1920:d=1[bg];[bg][v_scaled]overlay=${overlayX}:${overlayY}[outv]`;
          }
        }
        args.push("-filter_complex", filter);
        args.push("-map", "[outv]");
        if (keepAudio) {
          args.push("-map", "0:a?");
        }
      }

      args.push(
        "-c:v",
        "h264_nvenc",
        "-preset",
        preset,
        "-tune",
        "hq",
        "-rc:v",
        "vbr",
        "-cq:v",
        cq,
        "-b:v",
        targetBitrate,
        "-maxrate",
        maxBitrate,
        "-bufsize",
        bufSize,
        "-spatial-aq",
        "1",
        "-temporal-aq",
        "1",
        "-movflags",
        "+faststart",
      );

      if (keepAudio) {
        args.push("-c:a", "copy");
      } else {
        args.push("-an");
      }

      // Adiciona flag de progresso em tempo real
      args.push("-progress", "pipe:1");
      args.push(outputVideoPath);

      // Executa no hardware NVIDIA com monitoramento contínuo de progresso
      await new Promise<void>(async (resolve, reject) => {
        const { spawn } = await import("node:child_process");
        const proc = spawn(ffmpegPath, args);
        let stderr = "";

        proc.stdout.on("data", (data: Buffer) => {
          const text = data.toString();
          const timeMatch = text.match(/out_time_us=(\d+)/);
          const fpsMatch = text.match(/fps=([\d.]+)/);
          const speedMatch = text.match(/speed=([\s\d.]+)x/);

          const job = activeNvencJobs.get(currentJobId);
          if (job) {
            job.updatedAt = Date.now();
            if (fpsMatch && fpsMatch[1]) job.fps = parseFloat(fpsMatch[1]);
            if (speedMatch && speedMatch[1]) job.speed = speedMatch[1].trim() + "x";
            if (timeMatch && timeMatch[1]) {
              const timeSec = parseInt(timeMatch[1], 10) / 1_000_000;
              job.time = timeSec;
              if (job.duration > 0) {
                // Progresso de 5% a 98% baseado no tempo real codificado
                const pct = Math.min(98, Math.max(5, Math.round((timeSec / job.duration) * 100)));
                job.progress = pct;
              } else {
                job.progress = Math.min(95, job.progress + 5);
              }
              job.status = "rendering";
            }
          }
        });

        proc.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });

        proc.on("error", (err) => {
          const job = activeNvencJobs.get(currentJobId);
          if (job) {
            job.status = "error";
            job.error = err.message;
            job.updatedAt = Date.now();
          }
          reject(err);
        });

        proc.on("close", (code) => {
          const job = activeNvencJobs.get(currentJobId);
          if (code === 0) {
            if (job) {
              job.progress = 100;
              job.status = "done";
              job.updatedAt = Date.now();
            }
            resolve();
          } else {
            if (job) {
              job.status = "error";
              job.error = stderr || `FFmpeg falhou com código ${code}`;
              job.updatedAt = Date.now();
            }
            console.error("FFmpeg NVENC error:", stderr);
            reject(new Error(stderr || `FFmpeg falhou com código ${code}`));
          }
        });
      });

      const outBuffer = await fs.readFile(outputVideoPath);

      // Limpeza em segundo plano
      fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

      return new Response(outBuffer, {
        status: 200,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(outBuffer.length),
        },
      });
    } catch (err: any) {
      if (currentJobId && activeNvencJobs.has(currentJobId)) {
        const job = activeNvencJobs.get(currentJobId)!;
        job.status = "error";
        job.error = err.message;
        job.updatedAt = Date.now();
      }
      fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      console.error("Erro na renderização NVENC:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Not found", { status: 404 });
}

/**
 * Banco em memória de perfis conhecidos para modo demonstração / offline
 */
const KNOWN_DEMO_PROFILES: Record<
  string,
  {
    name: string;
    followers: number;
    posts: number;
    following: number;
    biography: string;
    avatarUrl: string;
    verified: boolean;
  }
> = {
  dachshunddiario: {
    name: "Dachshund Diário 🌭",
    followers: 28450,
    posts: 412,
    following: 320,
    biography: "O portal oficial dos apaixonados por Dachshund / Teckel / Salsicha! Dicas diárias, vídeos fofos e muito amor. 🐾",
    avatarUrl: "https://images.unsplash.com/photo-1612195583950-b8fd34c87093?w=150&h=150&fit=crop&crop=face",
    verified: true,
  },
  "doxie.lovers": {
    name: "Doxie Lovers World",
    followers: 64200,
    posts: 890,
    following: 450,
    biography: "Worldwide Dachshund Community ❤️ Celebrating the long dogs every day! Tag #doxielovers to be featured.",
    avatarUrl: "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=150&h=150&fit=crop&crop=face",
    verified: true,
  },
  wienerdogworld: {
    name: "Wiener Dog World 🐾",
    followers: 43100,
    posts: 620,
    following: 280,
    biography: "The happiest sausage dogs on Earth! Daily reels, memes and pup humor.",
    avatarUrl: "https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=150&h=150&fit=crop&crop=face",
    verified: false,
  },
  viralbichos: {
    name: "Viral Bichos Brasil",
    followers: 125000,
    posts: 1450,
    following: 110,
    biography: "Os vídeos de pets mais virais da internet reunidos em um só lugar! 🐶🐱🦜",
    avatarUrl: "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=150&h=150&fit=crop&crop=face",
    verified: true,
  },
  salsichasreais: {
    name: "Salsichas Reais",
    followers: 19800,
    posts: 310,
    following: 195,
    biography: "Vida real com cães salsichas: teimosia, charme e cobertores!",
    avatarUrl: "https://images.unsplash.com/photo-1517849845537-4d257902454a?w=150&h=150&fit=crop&crop=face",
    verified: false,
  },
  seufilmefavorito: {
    name: "Seu Filme Favorito 🎬",
    followers: 48500,
    posts: 320,
    following: 215,
    biography: "O melhor do cinema, séries, resenhas e dicas imperdíveis! 🍿🎥 Qual é o seu filme favorito?",
    avatarUrl: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=150&h=150&fit=crop&crop=face",
    verified: false,
  },
  filmeseseries: {
    name: "Filmes & Séries Brasil 🍿",
    followers: 82000,
    posts: 640,
    following: 190,
    biography: "Tudo sobre o universo cinematográfico, estreias e trailers exclusivos! 🎞️✨",
    avatarUrl: "https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=150&h=150&fit=crop&crop=face",
    verified: false,
  },
  cinefilos: {
    name: "Cinépicos & Críticas 🎥",
    followers: 31200,
    posts: 280,
    following: 140,
    biography: "Para quem respira cinema! Análises, curiosidades e listas dos maiores clássicos da sétima arte.",
    avatarUrl: "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=150&h=150&fit=crop&crop=face",
    verified: false,
  },
};

/**
 * Construtor inteligente de perfis de referência para concorrentes e benchmarking
 */
function buildReferenceProfile(cleanHandle: string) {
  const normalized = cleanHandle.toLowerCase().trim();

  // 1. Verifica se já existe perfil conhecido
  if (KNOWN_DEMO_PROFILES[normalized]) {
    const known = KNOWN_DEMO_PROFILES[normalized]!;
    return {
      handle: normalized,
      name: known.name,
      followers: known.followers,
      posts: known.posts,
      following: known.following,
      biography: known.biography,
      avatarUrl: known.avatarUrl,
      verified: known.verified,
      isKnown: true,
    };
  }

  // 2. Detecção inteligente de nicho / palavras-chave
  let emoji = "✨";
  let bio = `Perfil de referência @${normalized}. Monitoramento de dados e análise comparativa de crescimento.`;
  let avatarUrl = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face";

  if (/film|filme|cine|cinema|movie|serie|pipoca|trailers/.test(normalized)) {
    emoji = "🎬";
    bio = `O melhor do cinema, séries, lançamentos e análises! 🍿🎥 Conteúdo diário sobre filmes.`;
    avatarUrl = "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=150&h=150&fit=crop&crop=face";
  } else if (/dog|pet|cachorro|cat|gato|bicho|animal|salsicha|dachshund/.test(normalized)) {
    emoji = "🐾";
    bio = `Amor pelos pets, dicas de cuidados e momentos fofos diários! 🐶🐱`;
    avatarUrl = "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=150&h=150&fit=crop&crop=face";
  } else if (/mkt|marketing|growth|business|negocio|vendas|dinheiro|finance/.test(normalized)) {
    emoji = "📈";
    bio = `Estratégias de crescimento, mercado e inteligência de negócios! 🚀`;
    avatarUrl = "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=150&h=150&fit=crop&crop=face";
  } else if (/tech|dev|code|ia|ai|software|tecnologia/.test(normalized)) {
    emoji = "⚡";
    bio = `Inovação, inteligência artificial e novidades do mundo tech! 💻`;
    avatarUrl = "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=150&h=150&fit=crop&crop=face";
  }

  // Cálculo determinístico para manter valores consistentes a cada consulta
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash << 5) - hash + normalized.charCodeAt(i);
    hash |= 0;
  }
  const positiveHash = Math.abs(hash);
  const estFollowers = 8000 + (positiveHash % 68000);
  const estPosts = 45 + (positiveHash % 420);
  const estFollowing = 90 + (positiveHash % 350);

  const formattedName = normalized
    .split(/[._]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return {
    handle: normalized,
    name: `${formattedName} ${emoji}`.trim(),
    followers: estFollowers,
    posts: estPosts,
    following: estFollowing,
    biography: bio,
    avatarUrl,
    verified: false,
    isKnown: false,
  };
}

/**
 * Roteamento da API Social / Meta Graph API (/api/social)
 */
async function handleSocialApi(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // 0. API da Tabela Historico_Seguidores & Rotina Automatizada (Passo 1, 2 e 4)
  if (url.pathname === "/api/social/historico-seguidores") {
    try {
      if (request.method === "GET") {
        const startDate = url.searchParams.get("startDate") || "";
        const endDate = url.searchParams.get("endDate") || "";
        const handleFilter = normalizeHandle(url.searchParams.get("handle") || "");
        const typeFilter = url.searchParams.get("type") || "";

        let records = await getAllHistoricoRecords();

        if (handleFilter) {
          records = records.filter((r) => normalizeHandle(r.profile_handle) === handleFilter);
        }
        if (typeFilter) {
          records = records.filter((r) => r.type === typeFilter);
        }
        if (startDate) {
          records = records.filter((r) => r.date >= startDate);
        }
        if (endDate) {
          records = records.filter((r) => r.date <= endDate);
        }

        // Se data inicial e final foram fornecidas, calcula a matemática do crescimento (Passo 4)
        let calculations: any[] = [];
        if (startDate && endDate) {
          const uniqueHandles = Array.from(new Set(records.map((r) => r.profile_handle)));
          calculations = await Promise.all(
            uniqueHandles.map((h) => calculateGrowthBetweenDates(h, startDate, endDate)),
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            totalRecords: records.length,
            records,
            calculations,
            filter: { startDate, endDate, handle: handleFilter, type: typeFilter },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (request.method === "POST") {
        const body = (await request.json()) as any;
        if (!body.profile_handle || body.followers_count === undefined) {
          return new Response(
            JSON.stringify({ success: false, message: "Campos profile_handle e followers_count são obrigatórios." }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const record = await upsertHistoricoRecord({
          profile_handle: body.profile_handle,
          profile_name: body.profile_name || body.profile_handle,
          date: body.date || new Date().toISOString().slice(0, 10),
          followers_count: Number(body.followers_count),
          type: body.type || "Minha Página",
          page_id: body.page_id,
        });

        return new Response(
          JSON.stringify({ success: true, record }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err.message || "Erro em /api/social/historico-seguidores" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // 0.1 Inserção em Lote na tabela Historico_Seguidores
  if (url.pathname === "/api/social/historico-seguidores/batch" && request.method === "POST") {
    try {
      const body = (await request.json()) as any;
      const batch = Array.isArray(body.batch) ? body.batch : Array.isArray(body) ? body : [];
      const result = await upsertHistoricoBatch(batch);
      return new Response(
        JSON.stringify({ success: true, ...result }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // 0.2 Disparo da Rotina Automatizada (Cron Diário das 23:59)
  if (url.pathname === "/api/social/historico-seguidores/cron-run" && request.method === "POST") {
    try {
      let params: any = {};
      try {
        params = await request.json();
      } catch {
        // segue com vazio
      }
      const cronResult = await runDailyFollowersCron(params);
      return new Response(
        JSON.stringify({ success: true, cronResult }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // 0.3 Status do Cron Diário
  if (url.pathname === "/api/social/historico-seguidores/cron-status" && request.method === "GET") {
    try {
      const status = await getCronStatus();
      return new Response(
        JSON.stringify({ success: true, status }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // 0.4 Supabase: Status da Conexão
  if (url.pathname === "/api/supabase/status" && request.method === "GET") {
    try {
      const config = await getSupabaseConfig();
      const status = await testSupabaseConnection();
      return new Response(
        JSON.stringify({
          success: true,
          ...status,
          config: config
            ? {
                url: config.url,
                hasKey: Boolean(config.anonKey),
                maskedKey: config.anonKey
                  ? `${config.anonKey.slice(0, 8)}...${config.anonKey.slice(-6)}`
                  : "",
                configuredAt: config.configuredAt,
              }
            : null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // 0.5 Supabase: Salvar Configuração & Testar Conexão
  if (url.pathname === "/api/supabase/config" && request.method === "POST") {
    try {
      const body = (await request.json()) as any;
      if (!body.url || !body.anonKey) {
        return new Response(
          JSON.stringify({ success: false, message: "URL e Anon Key do Supabase são obrigatórios." }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      await saveSupabaseConfig({ url: body.url, anonKey: body.anonKey });
      const testResult = await testSupabaseConnection({ url: body.url, anonKey: body.anonKey });

      return new Response(
        JSON.stringify({ success: true, ...testResult }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // 0.6 Supabase: Sincronização Completa de Dados Locais para o Supabase
  if (url.pathname === "/api/supabase/sync" && request.method === "POST") {
    try {
      const syncResult = await syncAllToSupabase();
      return new Response(
        JSON.stringify(syncResult),
        { status: syncResult.success ? 200 : 500, headers: { "Content-Type": "application/json" } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // 1. POST ou GET /api/social/meta-test-connection
  if (url.pathname === "/api/social/meta-test-connection") {
    try {
      let accessToken = url.searchParams.get("accessToken") || "";
      let instagramAccountId = url.searchParams.get("instagramAccountId") || "";

      if (request.method === "POST") {
        try {
          const body = (await request.json()) as any;
          if (body.accessToken) accessToken = body.accessToken;
          if (body.instagramAccountId) instagramAccountId = body.instagramAccountId;
        } catch {
          // segue com searchParams
        }
      }

      if (!accessToken.trim()) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Por favor, insira o Meta Access Token.",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      // Função para descobrir todas as Páginas e Contas do Instagram vinculadas ao Token
      async function discoverAccounts(): Promise<Array<{
        id: string;
        username: string;
        name: string;
        pageName?: string;
        pageId?: string;
        platform: "instagram" | "facebook";
        avatarUrl?: string;
        followers: number;
        posts: number;
        biography?: string;
        hasInstagram: boolean;
      }>> {
        const list: Array<{
          id: string;
          username: string;
          name: string;
          pageName?: string;
          pageId?: string;
          platform: "instagram" | "facebook";
          avatarUrl?: string;
          followers: number;
          posts: number;
          biography?: string;
          hasInstagram: boolean;
          historicalSnapshots?: Array<{ date: string; followers: number }>;
        }> = [];

        try {
          const accountsUrl = `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,fan_count,followers_count,instagram_business_account{id,username,name,biography,profile_picture_url,followers_count,media_count}&access_token=${accessToken}`;
          const res = await fetch(accountsUrl);
          const data = (await res.json()) as any;
          if (Array.isArray(data.data)) {
            for (const page of data.data) {
              // 1. Adiciona a Conta Comercial do Instagram (se vinculada)
              if (page.instagram_business_account) {
                const ig = page.instagram_business_account;
                const alreadyExists = list.some(
                  (item) =>
                    item.id === ig.id ||
                    (item.platform === "instagram" &&
                      item.username.toLowerCase() === ig.username.toLowerCase()),
                );
                if (!alreadyExists) {
                  // Busca histórico diário oficial de novos seguidores se permitido pelo token
                  let igSnapshots: Array<{ date: string; followers: number }> = [];
                  try {
                    const insightsUrl = `https://graph.facebook.com/v21.0/${ig.id}/insights?metric=follower_count&period=day&access_token=${accessToken}`;
                    const insRes = await fetch(insightsUrl);
                    const insData = (await insRes.json()) as any;
                    if (insData && Array.isArray(insData.data) && insData.data[0]?.values) {
                      const values = insData.data[0].values;
                      let running = ig.followers_count ?? 0;
                      const rev = [...values].reverse();
                      const snaps: Array<{ date: string; followers: number }> = [];
                      const todayStr = new Date().toISOString().slice(0, 10);
                      snaps.push({ date: todayStr, followers: running });
                      for (const v of rev) {
                        const dateStr = v.end_time.slice(0, 10);
                        const delta = typeof v.value === "number" ? v.value : 0;
                        running = Math.max(0, running - delta);
                        snaps.push({ date: dateStr, followers: running });
                      }
                      igSnapshots = snaps.reverse();
                    }
                  } catch {
                    // segue se token não tiver instagram_manage_insights
                  }

                  list.push({
                    id: ig.id,
                    username: ig.username,
                    name: ig.name || ig.username,
                    pageName: page.name,
                    pageId: page.id,
                    platform: "instagram",
                    avatarUrl: ig.profile_picture_url,
                    followers: ig.followers_count ?? 0,
                    posts: ig.media_count ?? 0,
                    biography: ig.biography ?? "",
                    hasInstagram: true,
                    historicalSnapshots: igSnapshots,
                  });
                }
              }

              // 2. Adiciona a Página do Facebook correspondente com seus seguidores reais
              const fbFollowers = page.followers_count ?? page.fan_count ?? 0;
              const pageExists = list.some(
                (item) =>
                  item.id === page.id ||
                  (item.platform === "facebook" &&
                    item.name.toLowerCase() === page.name.toLowerCase()),
              );
              if (!pageExists) {
                // Busca histórico diário de curtidores se permitido pelo token
                let fbSnapshots: Array<{ date: string; followers: number }> = [];
                try {
                  const fbInsUrl = `https://graph.facebook.com/v21.0/${page.id}/insights/page_fans?period=day&access_token=${accessToken}`;
                  const fbInsRes = await fetch(fbInsUrl);
                  const fbInsData = (await fbInsRes.json()) as any;
                  if (fbInsData && Array.isArray(fbInsData.data) && fbInsData.data[0]?.values) {
                    const values = fbInsData.data[0].values;
                    fbSnapshots = values.map((v: any) => ({
                      date: v.end_time.slice(0, 10),
                      followers: v.value,
                    }));
                  }
                } catch {
                  // segue
                }

                list.push({
                  id: page.id,
                  username: page.name.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                  name: page.name,
                  pageName: page.name,
                  pageId: page.id,
                  platform: "facebook",
                  avatarUrl: `https://graph.facebook.com/v21.0/${page.id}/picture?type=normal&access_token=${accessToken}`,
                  followers: fbFollowers,
                  posts: 0,
                  biography: `Página do Facebook (${page.name})`,
                  hasInstagram: Boolean(page.instagram_business_account),
                  historicalSnapshots: fbSnapshots,
                });
              }
            }
          }
        } catch {
          // segue
        }

        // Tenta também consultar diretamente me?fields=instagram_business_account
        try {
          const meUrl = `https://graph.facebook.com/v21.0/me?fields=id,name,username,instagram_business_account{id,username,name,biography,profile_picture_url,followers_count,media_count}&access_token=${accessToken}`;
          const meRes = await fetch(meUrl);
          const meData = (await meRes.json()) as any;
          if (meData.instagram_business_account) {
            const ig = meData.instagram_business_account;
            const alreadyExists = list.some(
              (item) =>
                item.id === ig.id ||
                (item.platform === "instagram" &&
                  item.username.toLowerCase() === ig.username.toLowerCase()),
            );
            if (!alreadyExists) {
              list.push({
                id: ig.id,
                username: ig.username,
                name: ig.name || ig.username,
                pageName: meData.name || "Perfil",
                platform: "instagram",
                avatarUrl: ig.profile_picture_url,
                followers: ig.followers_count ?? 0,
                posts: ig.media_count ?? 0,
                biography: ig.biography ?? "",
                hasInstagram: true,
              });
            }
          }
        } catch {
          // segue
        }

        return list;
      }

      // Descobre todas as contas vinculadas a este token
      const discovered = await discoverAccounts();

      // CASO 1: Se o usuário NÃO forneceu o Instagram Account ID, usamos a lista de descobertos
      if (!instagramAccountId.trim()) {
        const primary = discovered.find((d) => d.hasInstagram) || discovered[0];
        if (primary) {
          return new Response(
            JSON.stringify({
              success: true,
              discovered: true,
              instagramAccountId: primary.id,
              username: primary.username,
              name: primary.name,
              pageName: primary.pageName,
              platform: primary.platform,
              avatarUrl: primary.avatarUrl,
              followers: primary.followers ?? 0,
              posts: primary.posts ?? 0,
              biography: primary.biography ?? "",
              accounts: discovered,
              message: `Encontramos ${discovered.length} página(s) vinculada(s) ao seu token!`,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        return new Response(
          JSON.stringify({
            success: false,
            message:
              "Token válido, mas nenhuma Página do Facebook ou conta do Instagram vinculada foi encontrada com as permissões atuais. Certifique-se de selecionar sua Página ao gerar o token.",
          }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        );
      }

      // CASO 2: O usuário forneceu um ID diretamente
      // 1. Tenta consultar diretamente como Instagram Account ID
      const metaUrl = `https://graph.facebook.com/v21.0/${instagramAccountId}?fields=id,username,name,biography,profile_picture_url,followers_count,media_count&access_token=${accessToken}`;
      const metaRes = await fetch(metaUrl);
      const metaData = (await metaRes.json()) as any;

      if (metaRes.ok && metaData.username) {
        return new Response(
          JSON.stringify({
            success: true,
            instagramAccountId: metaData.id || instagramAccountId,
            username: metaData.username,
            name: metaData.name || metaData.username,
            avatarUrl: metaData.profile_picture_url,
            followers: metaData.followers_count ?? 0,
            posts: metaData.media_count ?? 0,
            biography: metaData.biography ?? "",
            accounts: discovered,
            message: `Conectado com sucesso à conta @${metaData.username}!`,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // 2. Se falhou (como no erro #100), verifica se o ID fornecido é na verdade um FACEBOOK PAGE ID!
      try {
        const pageUrl = `https://graph.facebook.com/v21.0/${instagramAccountId}?fields=id,name,instagram_business_account{id,username,name,biography,profile_picture_url,followers_count,media_count}&access_token=${accessToken}`;
        const pageRes = await fetch(pageUrl);
        const pageData = (await pageRes.json()) as any;

        if (pageRes.ok && pageData.instagram_business_account) {
          const ig = pageData.instagram_business_account;
          return new Response(
            JSON.stringify({
              success: true,
              instagramAccountId: ig.id,
              username: ig.username,
              name: ig.name || ig.username,
              pageName: pageData.name,
              avatarUrl: ig.profile_picture_url,
              followers: ig.followers_count ?? 0,
              posts: ig.media_count ?? 0,
              biography: ig.biography ?? "",
              accounts: discovered,
              message: `O ID fornecido (${instagramAccountId}) era da sua Página do Facebook ("${pageData.name}"). Convertemos automaticamente para o Instagram @${ig.username}!`,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } else if (pageRes.ok && pageData.name && !pageData.instagram_business_account) {
          return new Response(
            JSON.stringify({
              success: false,
              accounts: discovered,
              message: `O ID informado (${instagramAccountId}) é da sua Página do Facebook "${pageData.name}", mas ela ainda não possui uma conta de Instagram Comercial vinculada. Vincule seu Instagram a essa Página no app do Instagram (Editar Perfil > Página) ou no Meta Business Suite.`,
            }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
      } catch {
        // segue para tratamento de erro
      }

      // 2.5 Fallback: se o ID informado falhou mas temos contas descobertas
      if (discovered.length > 0) {
        const fallback = discovered.find((d) => d.hasInstagram) || discovered[0];
        if (fallback) {
          return new Response(
            JSON.stringify({
              success: true,
              discovered: true,
              instagramAccountId: fallback.id,
              username: fallback.username,
              name: fallback.name,
              pageName: fallback.pageName,
              platform: fallback.platform,
              avatarUrl: fallback.avatarUrl,
              followers: fallback.followers ?? 0,
              posts: fallback.posts ?? 0,
              biography: fallback.biography ?? "",
              accounts: discovered,
              message: `O ID informado (${instagramAccountId}) era inválido, mas localizamos ${discovered.length} página(s) vinculada(s) ao seu token!`,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
      }

      // 3. Traduz e formata erros frequentes da Meta com instruções claras
      const rawError = metaData?.error?.message || "";
      let friendlyMessage = metaData?.error?.message || "Erro de autenticação com a Meta Graph API.";

      if (rawError.includes("pages_read_engagement") || rawError.includes("Page Public Content Access") || rawError.includes("#100")) {
        friendlyMessage = `O ID informado (${instagramAccountId}) é de uma Página do Facebook, e não de uma conta do Instagram. Para resolver:\n1. Adicione a permissão 'pages_read_engagement' no seu token no Graph API Explorer.\n2. Ou simplesmente apague o campo de ID e clique em 'Detectar Conta Automaticamente' para o app encontrar seu Instagram sozinho.`;
      }

      return new Response(
        JSON.stringify({
          success: false,
          message: friendlyMessage,
          metaError: metaData?.error,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err.message || "Erro interno ao testar conexão." }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // 2. GET ou POST /api/social/instagram-lookup
  if (url.pathname === "/api/social/instagram-lookup") {
    try {
      let handle = url.searchParams.get("handle") || "";
      let accessToken = url.searchParams.get("accessToken") || process.env["META_ACCESS_TOKEN"] || "";
      let instagramAccountId =
        url.searchParams.get("instagramAccountId") || process.env["META_INSTAGRAM_ACCOUNT_ID"] || "";

      if (request.method === "POST") {
        try {
          const body = (await request.json()) as any;
          if (body.handle) handle = body.handle;
          if (body.accessToken) accessToken = body.accessToken;
          if (body.instagramAccountId) instagramAccountId = body.instagramAccountId;
        } catch {
          // segue
        }
      }

      if (!handle.trim()) {
        return new Response(
          JSON.stringify({ success: false, message: "Nome do usuário (@handle) é obrigatório." }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      // Normaliza o handle
      const cleanHandle = handle
        .trim()
        .replace(/^@/, "")
        .replace(/https?:\/\/(www\.)?instagram\.com\//, "")
        .replace(/\/.*$/, "")
        .toLowerCase();

      // CASO A: Usuário configurou Meta Access Token e Instagram Business Account ID
      if (accessToken && instagramAccountId) {
        try {
          let resolvedIgId = instagramAccountId;
          // Se o ID for de uma Página do Facebook, converte automaticamente para o Instagram Business ID
          try {
            const pageCheckUrl = `https://graph.facebook.com/v21.0/${instagramAccountId}?fields=id,instagram_business_account{id}&access_token=${accessToken}`;
            const pageCheckRes = await fetch(pageCheckUrl);
            const pageCheckData = (await pageCheckRes.json()) as any;
            if (pageCheckData?.instagram_business_account?.id) {
              resolvedIgId = pageCheckData.instagram_business_account.id;
            }
          } catch {
            // segue com o ID fornecido
          }

          // 1. Tenta consulta direta (caso seja a própria conta cadastrada)
          const ownUrl = `https://graph.facebook.com/v21.0/${resolvedIgId}?fields=id,username,name,biography,profile_picture_url,followers_count,follows_count,media_count&access_token=${accessToken}`;
          const ownRes = await fetch(ownUrl);
          const ownData = (await ownRes.json()) as any;

          if (ownRes.ok && ownData.username?.toLowerCase() === cleanHandle) {
            return new Response(
              JSON.stringify({
                success: true,
                source: "meta_graph_api",
                handle: ownData.username,
                name: ownData.name || ownData.username,
                followers: ownData.followers_count ?? 0,
                posts: ownData.media_count ?? 0,
                following: ownData.follows_count ?? 0,
                biography: ownData.biography ?? "",
                avatarUrl: ownData.profile_picture_url ?? "",
                verified: true,
                message: "Dados sincronizados oficialmente via Meta Graph API (Sua Conta).",
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }

          // 2. Consulta via Meta Business Discovery API (para páginas de concorrentes ou de terceiros)
          const discoveryUrl = `https://graph.facebook.com/v21.0/${resolvedIgId}?fields=business_discovery.username(${cleanHandle}){id,username,name,biography,profile_picture_url,followers_count,follows_count,media_count,media{id,caption,like_count,comments_count,timestamp,media_url,permalink}}&access_token=${accessToken}`;
          const discRes = await fetch(discoveryUrl);
          const discData = (await discRes.json()) as any;

          if (discRes.ok && discData.business_discovery) {
            const bd = discData.business_discovery;
            return new Response(
              JSON.stringify({
                success: true,
                source: "meta_graph_api",
                handle: bd.username,
                name: bd.name || bd.username,
                followers: bd.followers_count ?? 0,
                posts: bd.media_count ?? 0,
                following: bd.follows_count ?? 0,
                biography: bd.biography ?? "",
                avatarUrl: bd.profile_picture_url ?? "",
                verified: true,
                recentPosts: bd.media?.data || [],
                message: "Dados sincronizados oficialmente via Meta Graph API (Business Discovery).",
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          } else if (discData.error) {
            console.warn("[Meta API Warning]", discData.error.message);
            // Se falhou por conta da Meta (ex: conta não é comercial ou token expirou), informamos o usuário
          }
        } catch (metaErr: any) {
          console.warn("[Meta API Exception]", metaErr.message);
        }
      }

      // CASO B: Fallback Inteligente / Modo Referência para Concorrentes e Páginas
      // Constrói o perfil de referência completo (banco conhecido ou gerador inteligente por nicho)
      const refProfile = buildReferenceProfile(cleanHandle);

      return new Response(
        JSON.stringify({
          success: true,
          source: refProfile.isKnown ? "mock_database" : "reference_mode",
          isReference: true,
          handle: refProfile.handle,
          name: refProfile.name,
          followers: refProfile.followers,
          posts: refProfile.posts,
          following: refProfile.following,
          biography: refProfile.biography,
          avatarUrl: refProfile.avatarUrl,
          verified: refProfile.verified,
          message: accessToken
            ? "Perfil carregado em Modo Referência. Como a Meta Graph API só fornece dados automáticos de contas comerciais vinculadas, os dados acima servem como base para benchmarking. Você pode confirmar ou ajustar os seguidores abaixo para comparar no gráfico."
            : "Perfil carregado em Modo Referência / Demonstração para comparação no gráfico.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err.message || "Erro no processamento da consulta." }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  return new Response("Not found", { status: 404 });
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown; error?: unknown };
    return payload.unhandled === true || payload.error === true || payload.message === "HTTPError";
  } catch {
    return false;
  }
}

const UPLOADS_DIR = path.resolve(safeCwd(), "public", "uploads");

function getUploadMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".webm":
      return "video/webm";
    default:
      return "application/octet-stream";
  }
}

async function handleUploadsStatic(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const fileName = path.basename(url.pathname);
  const filePath = path.join(UPLOADS_DIR, fileName);

  try {
    if (!fsSync.existsSync(filePath)) {
      return new Response("Arquivo não encontrado", { status: 404 });
    }
    const stat = await fs.stat(filePath);
    const mime = getUploadMimeType(filePath);
    const data = await fs.readFile(filePath);

    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": stat.size.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err: any) {
    return new Response("Erro ao ler arquivo", { status: 500 });
  }
}

/**
 * Roteamento da API de Agendador Flash (/api/agendamentos).
 */
async function handleAgendamentosApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // 1. GET /api/agendamentos — Lista todos os registros
  if (request.method === "GET" && pathname === "/api/agendamentos") {
    try {
      const records = await getAllAgendamentos();
      return new Response(JSON.stringify({ success: true, data: records }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // 2. POST /api/agendamentos — Salva ou edita agendamento
  if (request.method === "POST" && pathname === "/api/agendamentos") {
    try {
      const body = await request.json();
      const saved = await upsertAgendamento(body);
      return new Response(JSON.stringify({ success: true, data: saved }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err.message }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // 3. DELETE /api/agendamentos — Remove agendamento
  if (
    (request.method === "DELETE" && pathname === "/api/agendamentos") ||
    (request.method === "POST" && pathname === "/api/agendamentos/delete")
  ) {
    try {
      let id = url.searchParams.get("id") || "";
      if (!id && request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) as any;
        if (body.id) id = body.id;
      }
      if (!id) {
        return new Response(
          JSON.stringify({ success: false, message: "ID do agendamento é obrigatório." }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      const deleted = await deleteAgendamento(id);
      return new Response(JSON.stringify({ success: deleted }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // 4. POST /api/agendamentos/upload — Upload de mídia para storage público local
  if (request.method === "POST" && pathname === "/api/agendamentos/upload") {
    try {
      await fs.mkdir(UPLOADS_DIR, { recursive: true });
      const formData = await request.formData();
      const file = formData.get("file");

      if (!file || typeof file === "string") {
        return new Response(
          JSON.stringify({ success: false, message: "Nenhum arquivo enviado no campo 'file'." }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      const fileObj = file as File;
      const originalName = fileObj.name || "upload";
      const ext = path.extname(originalName) || (fileObj.type.includes("video") ? ".mp4" : ".jpg");
      const safeBase = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
      const fileName = `${Date.now()}_${safeBase}${ext}`;
      const targetPath = path.join(UPLOADS_DIR, fileName);

      const arrayBuffer = await fileObj.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await fs.writeFile(targetPath, buffer);

      const publicPath = `/uploads/${fileName}`;
      let fullUrl = `${url.origin}${publicPath}`;

      // Espelha para CDN pública para que os servidores da Meta Graph API possam acessar a mídia
      try {
        const cdnFormData = new FormData();
        cdnFormData.append("reqtype", "fileupload");
        const blob = new Blob([buffer], { type: fileObj.type || "image/jpeg" });
        cdnFormData.append("fileToUpload", blob, fileName);
        const cdnRes = await fetch("https://catbox.moe/user/api.php", {
          method: "POST",
          body: cdnFormData,
        });
        if (cdnRes.ok) {
          const directCdnUrl = (await cdnRes.text()).trim();
          if (directCdnUrl.startsWith("http")) {
            fullUrl = directCdnUrl;
            console.log(`[AgendadorFlash] Upload espelhado para CDN pública: ${fullUrl}`);
          }
        }
      } catch (cdnErr) {
        console.warn("[AgendadorFlash] Aviso ao enviar para CDN pública:", cdnErr);
      }

      return new Response(
        JSON.stringify({
          success: true,
          url: publicPath,
          fullUrl,
          fileName,
          size: buffer.length,
          type: fileObj.type,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (err: any) {
      console.error("[AgendadorFlash] Erro no upload de mídia:", err);
      return new Response(
        JSON.stringify({ success: false, message: err.message || "Erro no upload." }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // 5. POST /api/agendamentos/publish-now — Disparo imediato oficial Meta API v22.0
  if (request.method === "POST" && pathname === "/api/agendamentos/publish-now") {
    try {
      const body = (await request.json()) as any;
      let agendamentoId = body.id;

      // Se passou dados para criação rápida + disparo imediato
      if (!agendamentoId && body.media_url && body.media_type) {
        const created = await upsertAgendamento({
          media_type: body.media_type,
          media_url: body.media_url,
          caption: body.caption || "",
          scheduled_time: new Date().toISOString(),
          status: "PUBLICANDO",
          destination_platform: body.destination_platform || "INSTAGRAM",
          instagram_account_id: body.instagram_account_id || null,
          target_username: body.target_username || null,
          facebook_page_id: body.facebook_page_id || null,
          facebook_page_name: body.facebook_page_name || null,
          connection_id: body.connection_id || null,
        });
        agendamentoId = created.id;
      }

      if (!agendamentoId) {
        return new Response(
          JSON.stringify({ success: false, message: "ID do agendamento não fornecido." }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      // Credenciais Meta: passadas no body ou recuperadas da conexão específica / config permanente
      let resolvedToken = body.metaConfig?.accessToken || body.accessToken || "";
      if (!resolvedToken && body.connection_id) {
        const conn = await getMetaConnectionById(body.connection_id);
        if (conn?.accessToken) resolvedToken = conn.accessToken;
      }
      if (!resolvedToken) {
        const savedConfig = await getSavedMetaConfig();
        resolvedToken = savedConfig?.accessToken || "";
      }

      const credentials = {
        accessToken: resolvedToken,
        instagramAccountId:
          body.instagram_account_id ||
          body.metaConfig?.instagramAccountId ||
          body.instagramAccountId ||
          "",
      };

      const dest = body.destination_platform || "INSTAGRAM";
      if (!credentials.accessToken) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Access Token da Meta não configurado. Adicione suas credenciais no painel.",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      if (dest !== "FACEBOOK" && !credentials.instagramAccountId) {
        return new Response(
          JSON.stringify({
            success: false,
            message:
              "Instagram Business Account ID não configurado para publicação no Instagram.",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      const result = await publishSingleAgendamento(agendamentoId, credentials);
      const updatedItem = await getAgendamentoById(agendamentoId);

      return new Response(
        JSON.stringify({
          success: result.success,
          result,
          item: updatedItem,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (err: any) {
      console.error("[AgendadorFlash] Erro ao disparar publicação imediata:", err);
      return new Response(
        JSON.stringify({ success: false, message: err.message || "Erro ao publicar." }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // 6. POST /api/agendamentos/cron-run — Dispara o Worker manualmente
  if (request.method === "POST" && pathname === "/api/agendamentos/cron-run") {
    try {
      const body = (await request.json().catch(() => ({}))) as any;
      const savedConfig = await getSavedMetaConfig();
      const credentials = {
        accessToken: body.accessToken || savedConfig?.accessToken || "",
        instagramAccountId:
          body.instagramAccountId || savedConfig?.instagramAccountId || "",
      };

      if (!credentials.accessToken || !credentials.instagramAccountId) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Credenciais da Meta não configuradas para o Worker.",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      const workerRes = await runAgendamentosWorker(credentials);
      return new Response(JSON.stringify({ success: true, result: workerRes }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // 7. GET /api/agendamentos/sql — Retorna o script SQL para criação no Supabase
  if (request.method === "GET" && pathname === "/api/agendamentos/sql") {
    return new Response(
      JSON.stringify({
        success: true,
        sql: AGENDAMENTOS_SUPABASE_SQL,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // 8. GET ou POST /api/agendamentos/meta-config — Salva credenciais permanentes server-side
  if (pathname === "/api/agendamentos/meta-config") {
    if (request.method === "POST") {
      try {
        const body = (await request.json()) as any;
        const saved = await saveMetaConfig(body);
        return new Response(JSON.stringify({ success: true, config: saved }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err: any) {
        return new Response(
          JSON.stringify({ success: false, message: err.message }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
    } else {
      const config = await getSavedMetaConfig();
      return new Response(JSON.stringify({ success: true, config }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // 8.1. GET /api/agendamentos/meta-connections — Lista conexões cadastradas
  if (pathname === "/api/agendamentos/meta-connections" && request.method === "GET") {
    try {
      const connections = await getAllMetaConnections();
      return new Response(JSON.stringify({ success: true, connections }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err.message, connections: [] }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // 8.2. POST /api/agendamentos/meta-connections — Adiciona ou edita conexão Meta
  if (pathname === "/api/agendamentos/meta-connections" && request.method === "POST") {
    try {
      const body = (await request.json().catch(() => ({}))) as any;
      if (!body.accessToken || !body.accessToken.trim()) {
        return new Response(
          JSON.stringify({ success: false, message: "Token de acesso é obrigatório." }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      const rawToken = body.accessToken.trim();
      const label = body.label?.trim() || `Conexão Meta ${Date.now()}`;
      const connId = body.id || `conn_${Date.now()}`;

      // Valida permissões e recupera app info da Meta Graph API
      let appId: string | null = null;
      let appName: string | null = null;
      let hasPublish = false;
      try {
        const debugRes = await fetch(
          `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(rawToken)}&access_token=${encodeURIComponent(rawToken)}`,
        ).catch(() => null);
        if (debugRes && debugRes.ok) {
          const debugJson = await debugRes.json();
          appId = debugJson.data?.app_id || null;
          appName = debugJson.data?.application || null;
          const scopes = debugJson.data?.scopes || [];
          hasPublish = scopes.includes("instagram_content_publish");
        }
      } catch {
        // segue
      }

      const newConn: MetaConnection = {
        id: connId,
        label,
        accessToken: rawToken,
        connectedAt: new Date().toISOString(),
        appId,
        appName,
        hasPublishPermission: hasPublish,
      };

      const updatedList = await saveMetaConnection(newConn);
      return new Response(
        JSON.stringify({ success: true, connection: newConn, connections: updatedList }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // 8.3. DELETE /api/agendamentos/meta-connections — Remove conexão
  if (
    pathname === "/api/agendamentos/meta-connections" &&
    (request.method === "DELETE" || (request.method === "POST" && url.searchParams.get("action") === "delete"))
  ) {
    try {
      const id = url.searchParams.get("id");
      if (!id) {
        return new Response(
          JSON.stringify({ success: false, message: "ID da conexão não fornecido." }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      const remaining = await deleteMetaConnection(id);
      return new Response(JSON.stringify({ success: true, connections: remaining }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // 8.4. POST /api/agendamentos/meta-connections/tiktok — Vincula ou desvincula TikTok de um perfil/marca
  if (pathname === "/api/agendamentos/meta-connections/tiktok" && request.method === "POST") {
    try {
      const body = (await request.json().catch(() => ({}))) as any;
      const { connectionId, action, handle, tikTok } = body;
      if (!connectionId) {
        return new Response(JSON.stringify({ success: false, message: "connectionId é obrigatório." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (action === "disconnect") {
        await updateConnectionTikTok(connectionId, {
          accessToken: undefined,
          refreshToken: undefined,
          openId: undefined,
          displayName: undefined,
          avatarUrl: undefined,
          expiresAt: undefined,
        });
      } else if (handle) {
        const clean = handle.trim().replace(/^@/, "");
        await updateConnectionTikTok(connectionId, {
          displayName: clean,
          accessToken: "manual_linked",
        });
      } else if (tikTok) {
        await updateConnectionTikTok(connectionId, tikTok);
      }

      const connections = await getAllMetaConnections();
      return new Response(JSON.stringify({ success: true, connections }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ success: false, message: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // 9. GET ou POST /api/agendamentos/accounts — Lista todas as contas Instagram vinculadas e Páginas do Facebook
  if (pathname === "/api/agendamentos/accounts") {
    try {
      let explicitToken = url.searchParams.get("accessToken") || "";
      if (request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) as any;
        if (body.accessToken) explicitToken = body.accessToken;
      }

      const accounts: Array<{
        id: string;
        username: string;
        name: string;
        profilePictureUrl: string | null;
        followersCount: number | null;
        pageName: string;
        pageId: string;
        pageAccessToken: string | null;
        hasInstagram?: boolean;
        hasFacebook?: boolean;
        connectionId?: string | null;
        connectionLabel?: string | null;
      }> = [];

      const parsePagesData = (data: any, connId?: string | null, connLabel?: string | null) => {
        if (!data || !Array.isArray(data.data)) return;
        for (const page of data.data) {
          const ig = page.instagram_business_account || page.connected_instagram_account;
          if (ig) {
            if (!accounts.some((a) => a.id === ig.id)) {
              accounts.push({
                id: ig.id,
                username: ig.username,
                name: ig.name || page.name,
                profilePictureUrl: ig.profile_picture_url || null,
                followersCount: ig.followers_count ?? null,
                pageName: page.name,
                pageId: page.id,
                pageAccessToken: page.access_token || null,
                hasInstagram: true,
                hasFacebook: true,
                connectionId: connId || null,
                connectionLabel: connLabel || null,
              });
            }
          } else {
            // Página do Facebook sem conta do Instagram vinculada
            const fbVirtualId = `fb_${page.id}`;
            if (!accounts.some((a) => a.id === fbVirtualId || a.pageId === page.id)) {
              accounts.push({
                id: fbVirtualId,
                username: page.name,
                name: page.name,
                profilePictureUrl: null,
                followersCount: null,
                pageName: page.name,
                pageId: page.id,
                pageAccessToken: page.access_token || null,
                hasInstagram: false,
                hasFacebook: true,
                connectionId: connId || null,
                connectionLabel: connLabel || null,
              });
            }
          }
        }
      };

      // Se passou um token específico, busca somente dele
      if (explicitToken) {
        const accountsUrl = `https://graph.facebook.com/v22.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name,biography,profile_picture_url,followers_count,media_count},connected_instagram_account{id,username,name,biography,profile_picture_url,followers_count,media_count}&access_token=${encodeURIComponent(explicitToken)}`;
        const res = await fetch(accountsUrl);
        const data = (await res.json()) as any;
        if (res.ok) {
          parsePagesData(data);
        }
      } else {
        // Multi-Conexões: consulta cada conexão Meta configurada
        const connections = await getAllMetaConnections();

        if (connections.length === 0) {
          const saved = await getSavedMetaConfig();
          if (saved?.accessToken) {
            connections.push({
              id: "conn_default",
              label: "Conexão Principal",
              accessToken: saved.accessToken,
              connectedAt: saved.updatedAt || new Date().toISOString(),
            });
          }
        }

        for (const conn of connections) {
          try {
            const accountsUrl = `https://graph.facebook.com/v22.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name,biography,profile_picture_url,followers_count,media_count},connected_instagram_account{id,username,name,biography,profile_picture_url,followers_count,media_count}&access_token=${encodeURIComponent(conn.accessToken)}`;
            const res = await fetch(accountsUrl);
            const data = (await res.json()) as any;

            if (res.ok) {
              parsePagesData(data, conn.id, conn.label);
            } else if (data?.error?.code === 190) {
              // Token expirou nesta conexão, tenta fallback com config principal se diferente
              const saved = await getSavedMetaConfig();
              if (saved?.accessToken && saved.accessToken !== conn.accessToken) {
                const fbUrl = `https://graph.facebook.com/v22.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name,biography,profile_picture_url,followers_count,media_count},connected_instagram_account{id,username,name,biography,profile_picture_url,followers_count,media_count}&access_token=${encodeURIComponent(saved.accessToken)}`;
                const fbRes = await fetch(fbUrl);
                const fbData = (await fbRes.json()) as any;
                if (fbRes.ok) {
                  parsePagesData(fbData, conn.id, conn.label);
                }
              }
            }
          } catch (connErr) {
            console.warn(`[AgendadorFlash] Erro ao carregar contas da conexão '${conn.label}':`, connErr);
          }
        }
      }

      return new Response(JSON.stringify({ success: true, accounts }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err.message, accounts: [] }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // 10. GET ou POST /api/agendamentos/meta-permissions — Valida permissões do token na Meta API
  if (pathname === "/api/agendamentos/meta-permissions") {
    try {
      let accessToken = url.searchParams.get("accessToken") || "";
      if (request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) as any;
        if (body.accessToken) accessToken = body.accessToken;
      }
      if (!accessToken) {
        const saved = await getSavedMetaConfig();
        if (saved?.accessToken) accessToken = saved.accessToken;
      }

      if (!accessToken) {
        return new Response(
          JSON.stringify({
            success: false,
            isValid: false,
            hasPublishPermission: false,
            hasInstagramPublish: false,
            hasFacebookPublish: false,
            grantedPermissions: [],
            missingPermissions: ["instagram_content_publish", "pages_manage_posts", "instagram_basic", "pages_show_list"],
            message: "Token não configurado.",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // Consulta /me/permissions e debug_token em paralelo
      const [permRes, debugRes] = await Promise.all([
        fetch(`https://graph.facebook.com/v22.0/me/permissions?access_token=${encodeURIComponent(accessToken)}`).catch(() => null),
        fetch(`https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(accessToken)}`).catch(() => null),
      ]);

      const permData = permRes ? await permRes.json().catch(() => ({})) : {};
      const debugData = debugRes ? await debugRes.json().catch(() => ({})) : {};

      const granted: string[] = [];
      if (Array.isArray(permData?.data)) {
        for (const p of permData.data) {
          if (p.status === "granted") granted.push(p.permission);
        }
      }
      if (Array.isArray(debugData?.data?.scopes)) {
        for (const s of debugData.data.scopes) {
          if (!granted.includes(s)) granted.push(s);
        }
      }

      const hasIgPublish = granted.includes("instagram_content_publish");
      const hasFbPublish = granted.includes("pages_manage_posts");
      const hasPublish = hasIgPublish || hasFbPublish;

      const requiredScopes = ["instagram_basic", "instagram_content_publish", "pages_show_list"];
      const missing = requiredScopes.filter((s) => !granted.includes(s));
      const isValid = debugData?.data?.is_valid ?? permRes?.ok ?? false;

      return new Response(
        JSON.stringify({
          success: true,
          isValid,
          hasPublishPermission: hasPublish,
          hasInstagramPublish: hasIgPublish,
          hasFacebookPublish: hasFbPublish,
          appId: debugData?.data?.app_id || "1437178635181870",
          appName: debugData?.data?.application || "Flash Dark",
          tokenType: debugData?.data?.type || "USER",
          grantedPermissions: granted,
          missingPermissions: missing,
          expiresAt: debugData?.data?.expires_at ?? null,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          isValid: false,
          hasPublishPermission: false,
          grantedPermissions: [],
          missingPermissions: [],
          message: err.message,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  return new Response("Not found", { status: 404 });
}


/**
 * Roteamento da API do TikTok (/api/tiktok/*).
 * Suporta Login Kit, OAuth 2.0 callback, consulta de status e credenciais.
 */
async function handleTikTokApi(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // 1. GET /api/tiktok/callback — Callback OAuth do TikTok
  if (url.pathname === "/api/tiktok/callback" && request.method === "GET") {
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    const error = url.searchParams.get("error") || "";
    const errorDescription = url.searchParams.get("error_description") || "";

    if (error) {
      return new Response(
        `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>TikTok Auth Error</title></head>
<body style="background:#0f172a;color:#f8fafc;font-family:sans-serif;padding:40px;text-align:center;">
  <h2 style="color:#ef4444;">Erro na Autentica&ccedil;&atilde;o do TikTok</h2>
  <p>${error}: ${errorDescription}</p>
  <button onclick="window.close()" style="background:#3b82f6;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;margin-top:20px;">Fechar</button>
</body>
</html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    let codeVerifier: string | undefined = undefined;
    let profileId: string | undefined = undefined;
    if (state.startsWith("fd_")) {
      const parts = state.split("_");
      codeVerifier = parts[1];
      if (parts.length >= 3) {
        profileId = parts.slice(2).join("_");
      }
    }

    if (code) {
      try {
        const cfg = await getSavedTikTokConfig();
        if (cfg?.clientKey && cfg?.clientSecret) {
          const origin = url.origin;
          const redirectUri = `${origin}/api/tiktok/callback`;
          const exchangeRes = await exchangeTikTokCode(
            cfg.clientKey,
            cfg.clientSecret,
            code,
            redirectUri,
            codeVerifier,
          );
          if (exchangeRes.success && exchangeRes.data?.access_token) {
            const userInfo = await fetchTikTokUserInfo(exchangeRes.data.access_token);
            if (profileId) {
              await updateConnectionTikTok(profileId, {
                clientKey: cfg.clientKey,
                clientSecret: cfg.clientSecret,
                accessToken: exchangeRes.data.access_token,
                refreshToken: exchangeRes.data.refresh_token,
                openId: exchangeRes.data.open_id,
                displayName: userInfo?.displayName || undefined,
                avatarUrl: userInfo?.avatarUrl || undefined,
                expiresAt: Date.now() + (exchangeRes.data.expires_in || 86400) * 1000,
              });
            }
          }
        }
      } catch (exchangeErr) {
        console.warn("[TikTok API] Erro ao trocar token automaticamente no callback:", exchangeErr);
      }
    }

    return new Response(
      `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>TikTok Conectado - Flash Dark</title>
</head>
<body style="background:#090d16;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div style="background:#131c2e;padding:32px 40px;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,0.5);text-align:center;max-width:420px;border:1px solid #1e293b;">
    <div style="width:56px;height:56px;background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:#22c55e;font-size:26px;">✓</div>
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#f8fafc;">Conta TikTok Conectada!</h2>
    <p style="margin:0 0 20px;color:#94a3b8;font-size:14px;line-height:1.5;">A autoriza&ccedil;&atilde;o do TikTok foi conclu&iacute;da com sucesso no Flash Dark.</p>
    <button onclick="window.close()" style="background:#2563eb;color:#fff;border:none;font-weight:600;padding:10px 24px;border-radius:8px;cursor:pointer;font-size:14px;">Concluir e Fechar</button>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'TIKTOK_AUTH_SUCCESS', code: ${JSON.stringify(code)}, profileId: ${JSON.stringify(profileId || null)} }, '*');
      setTimeout(() => window.close(), 1500);
    }
  </script>
</body>
</html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  // 2. GET /api/tiktok/status — Retorna status da conexão TikTok
  if (url.pathname === "/api/tiktok/status" && request.method === "GET") {
    const profileId = url.searchParams.get("profileId");
    let targetProfile = profileId ? await getMetaConnectionById(profileId) : null;
    const cfg = await getSavedTikTokConfig();

    const clientKey = targetProfile?.tikTok?.clientKey || cfg?.clientKey;
    const hasSecret = Boolean(targetProfile?.tikTok?.clientSecret || cfg?.clientSecret);
    const accessToken = targetProfile?.tikTok?.accessToken || cfg?.accessToken;
    const expiresAt = targetProfile?.tikTok?.expiresAt || cfg?.expiresAt;
    const displayName = targetProfile?.tikTok?.displayName || cfg?.displayName;
    const avatarUrl = targetProfile?.tikTok?.avatarUrl || cfg?.avatarUrl;
    const openId = targetProfile?.tikTok?.openId || cfg?.openId;

    const isConnected = Boolean(accessToken && (!expiresAt || expiresAt > Date.now()));
    return new Response(
      JSON.stringify({
        success: true,
        connected: isConnected,
        clientKey: clientKey ? `${clientKey.slice(0, 4)}...${clientKey.slice(-4)}` : null,
        hasSecret,
        displayName: displayName || null,
        avatarUrl: avatarUrl || null,
        openId: openId || null,
        expiresAt: expiresAt || null,
        profileId: targetProfile?.id || null,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // 3. GET /api/tiktok/auth-url — Gera URL de autorização OAuth com PKCE obrigatório
  if (url.pathname === "/api/tiktok/auth-url" && request.method === "GET") {
    const profileId = url.searchParams.get("profileId") || undefined;
    const cfg = await getSavedTikTokConfig();
    let targetProfile = profileId ? await getMetaConnectionById(profileId) : null;
    const clientKey = url.searchParams.get("clientKey") || targetProfile?.tikTok?.clientKey || cfg?.clientKey;

    if (!clientKey) {
      return new Response(
        JSON.stringify({ success: false, message: "Client Key do TikTok não configurado." }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const origin = url.origin;
    const redirectUri = `${origin}/api/tiktok/callback`;
    const authData = getTikTokAuthUrl(clientKey, redirectUri, undefined, "flashdark_oauth", profileId);
    return new Response(
      JSON.stringify({ success: true, authUrl: authData.authUrl, redirectUri, state: authData.state }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // 4. POST /api/tiktok/config — Salva credenciais (clientKey / clientSecret)
  if (url.pathname === "/api/tiktok/config" && request.method === "POST") {
    try {
      const body = (await request.json()) as any;
      if (!body.clientKey || !body.clientSecret) {
        return new Response(
          JSON.stringify({ success: false, message: "clientKey e clientSecret são obrigatórios." }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      const updated = await saveTikTokConfig({
        clientKey: body.clientKey.trim(),
        clientSecret: body.clientSecret.trim(),
      });
      return new Response(
        JSON.stringify({ success: true, message: "Credenciais do TikTok salvas com sucesso!", config: updated }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: err.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // 5. POST /api/tiktok/disconnect — Desconecta a conta do TikTok
  if (url.pathname === "/api/tiktok/disconnect" && request.method === "POST") {
    await saveTikTokConfig({
      accessToken: undefined,
      refreshToken: undefined,
      openId: undefined,
      displayName: undefined,
      avatarUrl: undefined,
      expiresAt: undefined,
    });
    return new Response(
      JSON.stringify({ success: true, message: "Conta do TikTok desconectada com sucesso." }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response("Not found", { status: 404 });
}

// Inicializa o agendador em background (apenas em ambiente Node / Desktop local de longa duração)
let isCronInitialized = false;
function initLocalCronIfApplicable() {
  if (isCronInitialized) return;

  // Evita execução de timers em ambientes Edge / Cloudflare Workers
  const isCloudflare =
    typeof WebSocketPair !== "undefined" ||
    (typeof caches !== "undefined" && typeof (caches as any).default !== "undefined") ||
    (typeof navigator !== "undefined" && navigator.userAgent?.includes("Cloudflare")) ||
    Boolean(
      typeof process !== "undefined" &&
        (process.env?.CF_PAGES || process.env?.WORKERS || process.env?.VERCEL || process.env?.NETLIFY),
    );

  if (isCloudflare) return;
  if (typeof process === "undefined" || !process.versions?.node || typeof setInterval !== "function") return;

  isCronInitialized = true;
  let lastServerCronDate = "";
  try {
    setInterval(async () => {
      // 1. Cron diário às 23:59 na tabela Historico_Seguidores
      try {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const todayStr = now.toISOString().slice(0, 10);

        if (hours === 23 && minutes >= 58 && lastServerCronDate !== todayStr) {
          lastServerCronDate = todayStr;
          console.log(`[Anti Gravity Cron] Executando rotina diária das 23:59 para salvar foto na tabela Historico_Seguidores...`);
          await runDailyFollowersCron();
          console.log(`[Anti Gravity Cron] Foto diária das 23:59 salva com sucesso!`);
        }
      } catch (err) {
        console.error(`[Anti Gravity Cron] Erro ao rodar rotina diária:`, err);
      }

      // 2. Worker Agendador Flash: verifica publicações com status == 'AGENDADO' e scheduled_time <= agora
      try {
        const metaConfig = await getSavedMetaConfig();
        if (metaConfig && metaConfig.accessToken && metaConfig.instagramAccountId) {
          const workerRes = await runAgendamentosWorker(metaConfig);
          if (workerRes.publishedCount > 0 || workerRes.failedCount > 0) {
            console.log(
              `[AgendadorFlash Worker] Ciclo concluído: ${workerRes.publishedCount} publicado(s), ${workerRes.failedCount} falha(s).`,
            );
          }
        }
      } catch (agendadorErr) {
        console.error(`[AgendadorFlash Worker] Erro no ciclo de agendamentos:`, agendadorErr);
      }
    }, 60 * 1000);
  } catch {
    // Ignorado se o ambiente não permitir timers
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    initLocalCronIfApplicable();
    const url = new URL(request.url);

    // Intercepta rotas de verificação de domínio do TikTok Developers
    if (
      url.pathname.includes("tiktokrNFSXvY0goH5yqN31kLC2Tz4HrOzpaJE") ||
      url.pathname.includes("tiktok-developers-site-verification") ||
      url.pathname.includes("tiktok-site-verification") ||
      (url.pathname.startsWith("/tiktok") && (url.pathname.endsWith(".txt") || !url.pathname.slice(1).includes("/")))
    ) {
      return new Response("tiktok-developers-site-verification=rNFSXvY0goH5yqN31kLC2Tz4HrOzpaJE", {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // Intercepta rotas da API do TikTok
    if (url.pathname.startsWith("/api/tiktok/")) {
      return handleTikTokApi(request);
    }

    // Intercepta requisições para o Agendador Flash de Publicações
    if (
      url.pathname === "/api/agendamentos" ||
      url.pathname.startsWith("/api/agendamentos/")
    ) {
      return handleAgendamentosApi(request);
    }

    // Intercepta requisições estáticas para mídias em /uploads/
    if (url.pathname.startsWith("/uploads/")) {
      return handleUploadsStatic(request);
    }

    // Intercepta requisições para a API Social e API do Supabase
    if (url.pathname.startsWith("/api/social/") || url.pathname.startsWith("/api/supabase/")) {
      return handleSocialApi(request);
    }

    // Intercepta requisições para a API nativa de renderização NVENC (RTX 3090)
    if (url.pathname === "/api/render-nvenc" || url.pathname.startsWith("/api/render-nvenc/")) {
      return handleNvencApi(request);
    }

    // Intercepta requisições para a API nativa de templates da pasta do projeto
    if (url.pathname === "/api/templates" || url.pathname.startsWith("/api/templates/")) {
      return handleTemplatesApi(request);
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      if (response.status >= 500) {
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          return new Response(renderErrorPage(), {
            status: 500,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
      }
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error("[Server Error]:", error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};

