export type Platform = "instagram" | "tiktok" | "youtube" | "kwai" | "facebook";

export const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "kwai", label: "Kwai" },
  { id: "facebook", label: "Facebook" },
];

export type SocialPage = {
  id: string;
  handle: string;
  platform: Platform;
  niche?: string | undefined;
  isCompetitor: boolean;
  createdAt: string;
};

export type FollowerSnapshot = {
  id: string;
  pageId: string;
  date: string; // yyyy-mm-dd
  followers: number;
  posts?: number | undefined;
  engagement?: number | undefined; // %
};

export type Template = {
  id: string;
  name: string;
  createdAt: string;
  preset: EditorPreset;
};

export type EditorPreset = {
  aspect: "9:16" | "1:1" | "16:9" | "original";
  speed: number; // 1 = normal
  zoom: number; // % extra de zoom
  mirror: boolean;
  removeAudio: boolean;
  fps: number;
  crf: number; // qualidade (18 alta, 28 baixa)
  trimStart: number; // segundos
  trimEnd: number; // segundos
  brightness: number; // -0.3..0.3
  saturation: number; // 0..2
  watermarkText: string;
  outputFormat: "mp4" | "mov" | "webm";
  outputDir: string;
};

export const DEFAULT_PRESET: EditorPreset = {
  aspect: "9:16",
  speed: 1,
  zoom: 0,
  mirror: false,
  removeAudio: false,
  fps: 30,
  crf: 23,
  trimStart: 0,
  trimEnd: 0,
  brightness: 0,
  saturation: 1,
  watermarkText: "",
  outputFormat: "mp4",
  outputDir: "~/Videos/saida",
};

export type QueueItem = {
  id: string;
  name: string;
  sizeMB: number;
  status: "pendente" | "processando" | "concluido" | "erro";
  progress: number;
  message?: string | undefined;
};

export type AppSettings = {
  ffmpegPath: string;
  concurrency: number;
  keepOriginals: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  ffmpegPath: "ffmpeg",
  concurrency: 2,
  keepOriginals: true,
};
