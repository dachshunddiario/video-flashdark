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
  name: string;
  handle: string;
  platform: Platform;
  niche?: string | undefined;
  isCompetitor: boolean;
  createdAt: string;
  updatedAt?: string | undefined;
  avatarUrl?: string | undefined;
  biography?: string | undefined;
  postsCount?: number | undefined;
  followersCount?: number | undefined;
  followingCount?: number | undefined;
  verified?: boolean | undefined;
  initialFollowersCount?: number | undefined;
};

export interface MetaApiConfig {
  accessToken: string;
  instagramAccountId: string;
  accountUsername?: string | undefined;
  accountName?: string | undefined;
  avatarUrl?: string | undefined;
  followers?: number | undefined;
  posts?: number | undefined;
  biography?: string | undefined;
  connectedAt?: string | undefined;
}

export interface ConnectedProfileData {
  id: string;
  username: string;
  name: string;
  pageName?: string | undefined;
  pageId?: string | undefined;
  platform?: Platform | undefined;
  avatarUrl?: string | undefined;
  followers: number;
  posts: number;
  biography?: string | undefined;
  hasInstagram?: boolean | undefined;
  historicalSnapshots?: Array<{ date: string; followers: number }> | undefined;
}

export interface InstagramProfileLookupResult {
  success: boolean;
  handle: string;
  name: string;
  followers: number;
  posts: number;
  following?: number | undefined;
  biography?: string | undefined;
  avatarUrl?: string | undefined;
  verified?: boolean | undefined;
  isBusiness?: boolean | undefined;
  isReference?: boolean | undefined;
  source: "meta_graph_api" | "public_web" | "mock_database" | "reference_mode";
  recentPosts?: Array<{
    id: string;
    caption?: string | undefined;
    likes: number;
    comments: number;
    timestamp: string;
    mediaUrl?: string | undefined;
    permalink?: string | undefined;
  }> | undefined;
  message?: string | undefined;
}

export type FollowerSnapshot = {
  id: string;
  pageId: string;
  date: string; // yyyy-mm-dd
  followers: number;
  posts?: number | undefined;
  engagement?: number | undefined; // %
  notes?: string | undefined;
};

export type TimeRangePeriod = "1d" | "3d" | "7d" | "15d" | "30d" | "90d" | "365d" | "all";

export type ProfileType = "Minha Página" | "Concorrente";

export interface HistoricoSeguidoresRecord {
  id: string;
  profile_handle: string; // Ex: @seu_concorrente ou @sua_pagina
  profile_name: string;
  date: string; // YYYY-MM-DD
  followers_count: number;
  type: ProfileType;
  page_id?: string | undefined;
  created_at?: string | undefined;
}

export interface GrowthCalculationResult {
  profile_handle: string;
  profile_name: string;
  type: ProfileType;
  startDate: string;
  endDate: string;
  initialFollowers: number;
  finalFollowers: number;
  growth: number;
  percent: number;
  days: number;
  avgPerDay: number;
}

export interface CronRunResult {
  success: boolean;
  timestamp: string;
  executedAt: string;
  profilesProcessed: number;
  snapshotsSaved: number;
  details: Array<{
    profile_handle: string;
    followers_count: number;
    type: ProfileType;
    status: string;
  }>;
}

export interface PagePostInsight {
  id: string;
  pageId: string;
  date: string; // yyyy-mm-dd
  headline: string;
  captionPreview?: string | undefined;
  mediaType: "image" | "carousel" | "video";
  likes: number;
  comments: number;
  shares?: number | undefined;
  growthImpactFollowers?: number | undefined; // Seguidores estimados gerados por esta postagem
  viralScore?: number | undefined; // 0 - 100
  strategyTag?: string | undefined; // Ex: "Gancho Curioso", "Antes e Depois", "Tutorial Rápido"
  imageUrl?: string | undefined;
  url?: string | undefined;
}

export type Template = {
  id: string;
  name: string;
  createdAt: string;
  preset: EditorPreset;
  visual?: TemplateVisual;
};

export type FilterType =
  | "normal"
  | "contrast"
  | "brightness"
  | "saturation"
  | "blackwhite"
  | "vintage"
  | "sharp";

export interface TemplateVisual {
  id?: string | undefined;
  name: string;
  fileName?: string | undefined;
  background?: {
    color: string;
    type?: "solid" | "gradient";
  };
  profilePic: {
    enabled: boolean;
    imageUrl: string;
    size: number; // 20 a 320 px
    x: number; // 0 a 100 %
    y: number; // 0 a 100 %
    circular: boolean;
    borderEnabled: boolean;
    borderColor: string;
    borderWidth: number;
    zoom?: number; // 50 a 300 %
  };
  pageName: {
    enabled: boolean;
    text: string;
    fontSize: number; // 14 a 48
    fontWeight: "normal" | "600" | "bold";
    color: string;
    x: number;
    y: number;
    align: "left" | "center" | "right";
    fontFamily?: string;
  };
  badge: {
    enabled: boolean;
    size: number; // 12 a 36
    x: number;
    y: number;
  };
  headline: {
    enabled: boolean;
    text: string;
    fontSize: number; // 16 a 64
    fontWeight: "normal" | "600" | "bold";
    color: string;
    x: number;
    y: number;
    align: "left" | "center" | "right";
    maxWidth: number; // 40 a 95 %
    fontFamily?: string;
  };
  subHeadline: {
    enabled: boolean;
    text: string;
    fontSize: number; // 12 a 40
    fontWeight: "normal" | "600" | "bold";
    color: string;
    x: number;
    y: number;
    align: "left" | "center" | "right";
    maxWidth: number; // 40 a 95 %
    fontFamily?: string;
  };
  watermark: {
    enabled: boolean;
    type: "text" | "image";
    text: string;
    imageUrl: string;
    fontSize: number;
    size?: number | undefined;
    color?: string | undefined;
    x: number;
    y: number;
    opacity: number; // 0 a 100 %
    fontFamily?: string;
  };
}

export interface FontOption {
  id: string;
  name: string;
  fontFamily: string;
  category: "sans" | "serif" | "display" | "handwriting" | "mono";
}

export const AVAILABLE_FONTS: FontOption[] = [
  { id: "outfit", name: "Outfit (Moderna)", fontFamily: "'Outfit', sans-serif", category: "sans" },
  { id: "montserrat", name: "Montserrat (Impacto)", fontFamily: "'Montserrat', sans-serif", category: "sans" },
  { id: "poppins", name: "Poppins (Geométrica)", fontFamily: "'Poppins', sans-serif", category: "sans" },
  { id: "inter", name: "Inter (Clean)", fontFamily: "'Inter', sans-serif", category: "sans" },
  { id: "bebas", name: "Bebas Neue (Condensada)", fontFamily: "'Bebas Neue', sans-serif", category: "display" },
  { id: "anton", name: "Anton (Viral / Bold)", fontFamily: "'Anton', sans-serif", category: "display" },
  { id: "oswald", name: "Oswald (Notícias)", fontFamily: "'Oswald', sans-serif", category: "display" },
  { id: "syne", name: "Syne (Arrojada)", fontFamily: "'Syne', sans-serif", category: "display" },
  { id: "playfair", name: "Playfair (Editorial)", fontFamily: "'Playfair Display', serif", category: "serif" },
  { id: "cinzel", name: "Cinzel (Luxo)", fontFamily: "'Cinzel', serif", category: "serif" },
  { id: "roboto", name: "Roboto (Equilibrada)", fontFamily: "'Roboto', sans-serif", category: "sans" },
  { id: "caveat", name: "Caveat (Manuscrita)", fontFamily: "'Caveat', cursive", category: "handwriting" },
  { id: "pacifico", name: "Pacifico (Retro)", fontFamily: "'Pacifico', cursive", category: "handwriting" },
  { id: "fira", name: "Fira Code (Tech)", fontFamily: "'Fira Code', monospace", category: "mono" },
];

export const GOOGLE_FONTS_CATALOG = AVAILABLE_FONTS;

// Formatos Oficiais do Instagram Reels e Timeline
export const INSTAGRAM_FORMATS = {
  // 9:16 Tela Cheia (1080 x 1920)
  full916: {
    width: 1080,
    height: 1920,
    topPct: 0,
    bottomPct: 100,
    heightPct: 100,
    label: "9:16 Tela Cheia (1080x1920)",
  },
  // 4:5 Visualização do post na timeline / feed (1080 x 1350) - CELULAR DO MEIO
  timeline45: {
    width: 1080,
    height: 1350,
    topPct: 14.84375, // 285px do topo em 1920px
    bottomPct: 85.15625, // 1635px da base em 1920px
    heightPct: 70.3125, // 1350px de altura útil
    label: "4:5 Timeline Feed (1080x1350)",
  },
  // 3:5 Thumbnail no feed do Reels (1080 x 1800) - CELULAR DA DIREITA
  reelsFeed35: {
    width: 1080,
    height: 1800,
    topPct: 3.125,
    bottomPct: 96.875,
    heightPct: 93.75,
    label: "3:5 Feed Reels (1080x1800)",
  },
  // 1:1 Grade do perfil (1080 x 1080)
  profileGrid11: {
    width: 1080,
    height: 1080,
    topPct: 21.875,
    bottomPct: 78.125,
    heightPct: 56.25,
    label: "1:1 Grade Perfil (1080x1080)",
  },
} as const;

// Posições Padrão Harmônicas organizadas dentro do quadrado central 4:5 (1080 x 1350)
export const DEFAULT_4_5_ORGANIZATION = {
  profilePic: { x: 14, y: 18, size: 54 },
  pageName: { x: 23, y: 18, align: "left" as const },
  badge: { x: 52, y: 18, size: 20 },
  headline: { x: 50, y: 24, align: "center" as const, maxWidth: 88 },
  subHeadline: { x: 50, y: 29, align: "center" as const, maxWidth: 84 },
  watermark: { x: 50, y: 81 },
};

export const DEFAULT_TEMPLATE_VISUAL: TemplateVisual = {
  name: "Padrão Reels / Shorts (9:16)",
  background: {
    color: "#000000",
    type: "solid",
  },
  profilePic: {
    enabled: true,
    imageUrl: "",
    size: 54,
    x: 14,
    y: 18, // Dentro do 4:5 (inicia em 14.84%)
    circular: true,
    borderEnabled: true,
    borderColor: "#ffffff",
    borderWidth: 2,
    zoom: 100,
  },
  pageName: {
    enabled: true,
    text: "Minha Página",
    fontSize: 22,
    fontWeight: "bold",
    color: "#ffffff",
    x: 23,
    y: 18, // Dentro do 4:5
    align: "left",
    fontFamily: "'Outfit', sans-serif",
  },
  badge: {
    enabled: true,
    size: 20,
    x: 52,
    y: 18, // Dentro do 4:5
  },
  headline: {
    enabled: true,
    text: "Título impactante para seu vídeo",
    fontSize: 26,
    fontWeight: "bold",
    color: "#ffffff",
    x: 50,
    y: 24, // Dentro do 4:5
    align: "center",
    maxWidth: 88,
    fontFamily: "'Outfit', sans-serif",
  },
  subHeadline: {
    enabled: true,
    text: "Subtítulo explicativo com detalhes essenciais",
    fontSize: 17,
    fontWeight: "normal",
    color: "#e2e8f0",
    x: 50,
    y: 29, // Dentro do 4:5
    align: "center",
    maxWidth: 84,
    fontFamily: "'Outfit', sans-serif",
  },
  watermark: {
    enabled: true,
    type: "text",
    text: "@minhapagina",
    imageUrl: "",
    fontSize: 16,
    x: 50,
    y: 81, // Dentro do 4:5 (termina em 85.16%)
    opacity: 65,
    fontFamily: "'Outfit', sans-serif",
  },
};

export interface ManualMaskStroke {
  id: string;
  type: "add" | "remove";
  points: { x: number; y: number }[]; // 0 to 100% coordenadas relativas ao frame
  brushSize: number; // 5 a 100 px
  brushSoftness: number; // 0 a 100%
}

export interface ContentBoundingBox {
  x: number; // 0 a 100%
  y: number; // 0 a 100%
  width: number; // 0 a 100%
  height: number; // 0 a 100%
}

export interface BackgroundRemovalSettings {
  enabled: boolean;
  status: "idle" | "processing" | "done" | "error";
  progress: number; // 0 a 100%
  errorMessage?: string | undefined;

  // Visualização no Preview
  showOriginal: boolean; // Alternar entre original e recortado
  isolatePreview: boolean; // Fundo xadrez (quadriculado) vs template

  // Refinamento de Máscara
  edgeSoftness: number; // 0 a 100
  maskExpansion: number; // -20 a +20 (expansão / redução)
  feather: number; // 0 a 50 px
  opacity: number; // 0 a 100%

  // Correção Manual por Pincel
  manualCorrectionEnabled: boolean;
  currentTool: "add" | "remove";
  brushSize: number; // 5 a 100 px
  brushSoftness: number; // 0 a 100%
  manualStrokes: ManualMaskStroke[];

  // Recorte ao Conteúdo
  cropToContent: boolean;
  cropMargin: number; // 0 a 100 px
  contentBoundingBox?: ContentBoundingBox | undefined;
  detectedBoundingBox?: ContentBoundingBox | undefined;
}

export const DEFAULT_BG_REMOVAL: BackgroundRemovalSettings = {
  enabled: false,
  status: "idle",
  progress: 0,
  showOriginal: false,
  isolatePreview: false,
  edgeSoftness: 30,
  maskExpansion: 0,
  feather: 8,
  opacity: 100,
  manualCorrectionEnabled: false,
  currentTool: "add",
  brushSize: 30,
  brushSoftness: 50,
  manualStrokes: [],
  cropToContent: false,
  cropMargin: 16,
};

export type LayerId =
  | "template"
  | "video"
  | "headline"
  | "subHeadline"
  | "watermark"
  | "profile"
  | "pageName";

export const DEFAULT_LAYER_ORDER: LayerId[] = [
  "template",
  "video",
  "headline",
  "subHeadline",
  "watermark",
  "profile",
  "pageName",
];

/**
 * Estrutura dedicada para a Camada Independente de Vídeo.
 * O crop, zoom, rotação e posicionamento operam exclusivamente sobre esta camada,
 * NUNCA utilizando o canvas total ou elementos do template como referência.
 */
export interface VideoCropSettings {
  top: number; // 0 a 48% (referência: altura nativa do vídeo)
  bottom: number; // 0 a 48% (referência: altura nativa do vídeo)
  left: number; // 0 a 48% (referência: largura nativa do vídeo)
  right: number; // 0 a 48% (referência: largura nativa do vídeo)
}

export interface VideoLayerData {
  source?: string | File | null;
  originalWidth: number; // Largura nativa do vídeo (ex: 1920)
  originalHeight: number; // Altura nativa do vídeo (ex: 1080)
  x: number; // Posição X dentro do template (0 a 100%, padrão 50)
  y: number; // Posição Y dentro do template (0 a 100%, padrão 53)
  width: number; // Largura relativa da camada (30 a 140%, padrão 96)
  scale: number; // Zoom do vídeo (0.5 a 3.0)
  crop: VideoCropSettings;
  rotation: number; // -180 a 180 graus
  opacity: number; // 0 a 100%
  panX: number; // Deslocamento interno X (-50 a 50)
  panY: number; // Deslocamento interno Y (-50 a 50)
  borderRadius: number; // 0 a 32px
  mirror: boolean;
  speed: number; // 0.5 a 2.0
  filter: FilterType;
  filterIntensity: number;
}

export interface TemplateLayerData {
  width: number; // Largura padrão da composição (1080)
  height: number; // Altura padrão da composição (1920)
  visual: TemplateVisual;
}

/**
 * Validação interna que impede que funções de crop recebam o canvas do template como fonte.
 * O crop deve utilizar exclusivamente dimensões do vídeo original.
 */
export function validateVideoOnlyCrop(
  srcW: number,
  srcH: number,
  cropTop: number,
  cropBottom: number,
  cropLeft: number,
  cropRight: number,
): { valid: boolean; error?: string } {
  if (srcW <= 0 || srcH <= 0) {
    return { valid: false, error: "Dimensões do vídeo inválidas para crop." };
  }
  if (cropTop + cropBottom >= 100 || cropLeft + cropRight >= 100) {
    return { valid: false, error: "Soma das margens de crop não pode cobrir 100% do vídeo." };
  }
  return { valid: true };
}

/**
 * Converte porcentagens relativas de corte (0-100%) para pixels reais do vídeo nativo.
 * Garante números pares (exigência estrita de codecs como H.264/FFmpeg no pixel exato).
 */
export function calculateNativePixelCrop(
  nativeWidth: number,
  nativeHeight: number,
  cropTop: number = 0,
  cropBottom: number = 0,
  cropLeft: number = 0,
  cropRight: number = 0,
): {
  x: number;
  y: number;
  width: number;
  height: number;
  ffmpegFilter: string;
} {
  const cTop = Math.min(48, Math.max(0, cropTop)) / 100;
  const cBottom = Math.min(48, Math.max(0, cropBottom)) / 100;
  const cLeft = Math.min(48, Math.max(0, cropLeft)) / 100;
  const cRight = Math.min(48, Math.max(0, cropRight)) / 100;

  let x = Math.round(nativeWidth * cLeft);
  let y = Math.round(nativeHeight * cTop);
  let w = Math.round(nativeWidth * (1 - cLeft - cRight));
  let h = Math.round(nativeHeight * (1 - cTop - cBottom));

  // Alinhamento para números pares (exigência de encoders YUV420p)
  if (w % 2 !== 0) w -= 1;
  if (h % 2 !== 0) h -= 1;
  if (x % 2 !== 0) x = Math.max(0, x - 1);
  if (y % 2 !== 0) y = Math.max(0, y - 1);

  w = Math.max(2, w);
  h = Math.max(2, h);
  x = Math.max(0, Math.min(nativeWidth - w, x));
  y = Math.max(0, Math.min(nativeHeight - h, y));

  return {
    x,
    y,
    width: w,
    height: h,
    ffmpegFilter: `crop=${w}:${h}:${x}:${y}`,
  };
}

export interface VideoAdjustment {
  zoom: number; // 0.5 a 3.0
  speed: number; // 0.5 a 2.0
  filter: FilterType;
  filterIntensity: number; // 0 a 100
  cropMode: "auto" | "manual";
  cropPanX: number; // -50 a 50
  cropPanY: number; // -50 a 50
  keepAudio: boolean;
  mirror: boolean;
  // Recorte das Margens / Bordas do Vídeo (Crop exclusivo da Camada de Vídeo)
  cropTop?: number; // 0 a 48%
  cropBottom?: number; // 0 a 48%
  cropLeft?: number; // 0 a 48%
  cropRight?: number; // 0 a 48%
  // Posicionamento, tamanho e enquadramento do vídeo como camada independente
  videoX?: number; // 0 a 100% (padrão 50%)
  videoY?: number; // 0 a 100% (padrão 53%, centralizado no espaço do template)
  videoWidth?: number; // 30 a 140% da largura útil
  videoFit?: "contain" | "cover";
  borderRadius?: number; // 0 a 32px
  rotation?: number; // -180 a 180 graus
  opacity?: number; // 0 a 100%
  // Remoção de Fundo Opcional
  bgRemoval?: BackgroundRemovalSettings;
  // Modo de exportação: apenas a filmagem recortada (sem elementos gráficos de template)
  exportOnlyVideoFootage?: boolean;
  // Ordem e Visibilidade de Camadas
  layerOrder?: LayerId[];
  hiddenLayers?: string[];
}

export const DEFAULT_ADJUSTMENT: VideoAdjustment = {
  zoom: 1,
  speed: 1,
  filter: "normal",
  filterIntensity: 50,
  cropMode: "auto",
  cropPanX: 0,
  cropPanY: 0,
  keepAudio: true,
  mirror: false,
  cropTop: 0,
  cropBottom: 0,
  cropLeft: 0,
  cropRight: 0,
  videoX: 50,
  videoY: 53,
  videoWidth: 96,
  videoFit: "contain",
  borderRadius: 8,
  rotation: 0,
  exportOnlyVideoFootage: false,
  bgRemoval: DEFAULT_BG_REMOVAL,
  layerOrder: ["template", "video", "headline", "subHeadline", "watermark", "profile", "pageName"],
  hiddenLayers: [],
};

export interface VideoQueueItem {
  id: string;
  file: File;
  name: string;
  sizeMB: number;
  durationSec: number;
  thumbnailUrl?: string | undefined;
  status: "pendente" | "processando" | "concluido" | "erro";
  progress: number;
  errorMessage?: string | undefined;
  processedBlob?: Blob | undefined;
  customAdjustment?: VideoAdjustment | undefined;
  customTemplate?: TemplateVisual | undefined;
}

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

// ==========================================
// TIPOS EXCLUSIVOS DO IMAGEM FLASH
// ==========================================

export type InstagramImageFormat = "portrait_4_5" | "square_1_1" | "story_9_16";

export interface ImageFormatSpec {
  id: InstagramImageFormat;
  label: string;
  subLabel: string;
  description: string;
  aspectRatio: string;
  width: number;
  height: number;
  recommendedTag?: string;
}

export const INSTAGRAM_IMAGE_FORMATS: ImageFormatSpec[] = [
  {
    id: "portrait_4_5",
    label: "Feed 4:5 Retrato",
    subLabel: "1080 x 1350 px",
    description: "Formato vertical no feed do Instagram. Ocupa o maior espaço na tela e gera mais retenção e cliques.",
    aspectRatio: "4/5",
    width: 1080,
    height: 1350,
    recommendedTag: "Maior Engajamento",
  },
  {
    id: "square_1_1",
    label: "Feed 1:1 Quadrado",
    subLabel: "1080 x 1080 px",
    description: "Formato quadrado clássico. Ideal para manter grade e posts universais.",
    aspectRatio: "1/1",
    width: 1080,
    height: 1080,
  },
  {
    id: "story_9_16",
    label: "Stories 9:16",
    subLabel: "1080 x 1920 px",
    description: "Formato vertical tela inteira para Stories, Status e destaques.",
    aspectRatio: "9/16",
    width: 1080,
    height: 1920,
  },
];

export interface ImageCropConfig {
  enabled: boolean;
  top: number; // 0 a 90% de corte a partir do topo
  bottom: number; // 0 a 90% de corte a partir da base
  left: number; // 0 a 90% de corte a partir da esquerda
  right: number; // 0 a 90% de corte a partir da direita
}

export const DEFAULT_IMAGE_CROP: ImageCropConfig = {
  enabled: false,
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
};

export type ImageLayerOrder = "behind" | "overlay";

export interface ImageFlashAdjustment {
  imageX: number; // 0 a 100%
  imageY: number; // 0 a 100%
  imageWidth: number; // 30 a 140%
  imageFit: "contain" | "cover";
  borderRadius: number; // 0 a 48px
  zoom: number; // 0.5 a 3.0
  filter: FilterType;
  filterIntensity: number;
  format: InstagramImageFormat;
  crop?: ImageCropConfig | undefined;
  layerOrder?: ImageLayerOrder | undefined;
}

export const DEFAULT_IMAGE_ADJUSTMENT: ImageFlashAdjustment = {
  imageX: 50,
  imageY: 56,
  imageWidth: 94,
  imageFit: "cover",
  borderRadius: 14,
  zoom: 1,
  filter: "normal",
  filterIntensity: 50,
  format: "portrait_4_5",
  crop: DEFAULT_IMAGE_CROP,
  layerOrder: "behind",
};

export interface ImageQueueItem {
  id: string;
  file: File;
  name: string;
  sizeMB: number;
  previewUrl: string;
  width: number;
  height: number;
  adjustment?: ImageFlashAdjustment | undefined;
  crop?: ImageCropConfig | undefined;
  croppedPreviewUrl?: string | undefined;
  status: "idle" | "rendering" | "done" | "error";
  renderedBlob?: Blob | undefined;
  renderedDataUrl?: string | undefined;
  errorMessage?: string | undefined;
}

// ==========================================
// MÓDULO AGENDADOR FLASH (INSTAGRAM & FACEBOOK PUBLISHING)
// ==========================================

export type AgendamentoMediaType = "IMAGE" | "REELS";
export type AgendamentoStatus = "AGENDADO" | "PUBLICANDO" | "PUBLICADO" | "ERRO";
export type DestinationPlatform = "INSTAGRAM" | "FACEBOOK" | "BOTH";

export interface MetaConnection {
  id: string; // Identificador único da conexão (ex: conn_1, conn_default)
  label: string; // Nome descritivo (ex: "Perfil Principal", "Nichos Cinema", "Perfil Pessoal")
  accessToken: string;
  connectedAt: string;
  appId?: string | null;
  appName?: string | null;
  accountsCount?: number;
  hasPublishPermission?: boolean;
}

export interface InstagramConnectedAccount {
  id: string; // Instagram Business Account ID ou identificador único
  username: string;
  name: string;
  profilePictureUrl?: string | null;
  followersCount?: number | null;
  pageName?: string | null;
  pageId?: string | null;
  pageAccessToken?: string | null;
  connectionId?: string | null;
  connectionLabel?: string | null;
  hasInstagram?: boolean; // True se tem perfil profissional do Instagram
  hasFacebook?: boolean; // True se tem Página do Facebook vinculada
}

export interface MetaTokenValidation {
  success: boolean;
  isValid: boolean;
  hasPublishPermission: boolean;
  hasInstagramPublish?: boolean;
  hasFacebookPublish?: boolean;
  appId?: string | null;
  appName?: string | null;
  tokenType?: string | null;
  grantedPermissions: string[];
  missingPermissions: string[];
  expiresAt?: number | null;
  message?: string | null;
}

export interface AgendamentoInstagram {
  id: string;
  media_type: AgendamentoMediaType;
  media_url: string;
  caption: string;
  scheduled_time: string; // ISO 8601
  status: AgendamentoStatus;
  destination_platform?: DestinationPlatform; // "INSTAGRAM" | "FACEBOOK" | "BOTH"
  instagram_account_id?: string | null;
  target_username?: string | null;
  facebook_page_id?: string | null;
  facebook_page_name?: string | null;
  facebook_post_id?: string | null;
  connection_id?: string | null;
  creation_id?: string | null;
  post_id?: string | null;
  error_message?: string | null;
  created_at: string; // ISO 8601
  updated_at?: string | null;
}

export interface WorkerRunResult {
  executedAt: string;
  checkedCount: number;
  publishedCount: number;
  failedCount: number;
  items: Array<{
    id: string;
    mediaType: AgendamentoMediaType;
    status: AgendamentoStatus;
    postId?: string | null;
    facebookPostId?: string | null;
    error?: string | null;
  }>;
}


