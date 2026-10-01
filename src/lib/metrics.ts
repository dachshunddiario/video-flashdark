import { type FollowerSnapshot, type SocialPage, type TimeRangePeriod } from "./types";

export interface PageMetrics {
  currentFollowers: number;
  lastUpdateDate: string | null;
  growth1d: number;
  growth1dPercent: number;
  growth3d: number;
  growth3dPercent: number;
  growth7d: number;
  growth7dPercent: number;
  growth15d: number;
  growth15dPercent: number;
  growth30d: number;
  growth30dPercent: number;
  growth90d: number;
  growth90dPercent: number;
  growth365d: number;
  growth365dPercent: number;
  growthAll: number;
  growthAllPercent: number;
  totalGrowth: number;
  totalGrowthPercent: number;
  avgGrowthPerDay: number;
  snapshotCount: number;
}

export function getGrowthForPeriod(
  metrics: PageMetrics,
  period: TimeRangePeriod,
): { growth: number; percent: number } {
  switch (period) {
    case "1d":
      return { growth: metrics.growth1d, percent: metrics.growth1dPercent };
    case "3d":
      return { growth: metrics.growth3d, percent: metrics.growth3dPercent };
    case "7d":
      return { growth: metrics.growth7d, percent: metrics.growth7dPercent };
    case "15d":
      return { growth: metrics.growth15d, percent: metrics.growth15dPercent };
    case "30d":
      return { growth: metrics.growth30d, percent: metrics.growth30dPercent };
    case "90d":
      return { growth: metrics.growth90d, percent: metrics.growth90dPercent };
    case "365d":
      return { growth: metrics.growth365d, percent: metrics.growth365dPercent };
    case "all":
      return { growth: metrics.growthAll, percent: metrics.growthAllPercent };
    default:
      return { growth: metrics.growth7d, percent: metrics.growth7dPercent };
  }
}

export function getPeriodLabel(period: TimeRangePeriod): string {
  switch (period) {
    case "1d":
      return "Diário (24h)";
    case "3d":
      return "3 Dias";
    case "7d":
      return "Semanal (7 Dias)";
    case "15d":
      return "15 Dias";
    case "30d":
      return "Mensal (30 Dias)";
    case "90d":
      return "Trimestral (90 Dias)";
    case "365d":
      return "Anual (1 Ano / 365D)";
    case "all":
      return "Desde a Criação (Completo)";
  }
}

/**
 * Calcula todas as métricas essenciais de crescimento a partir do histórico de medições.
 */
export function calculatePageMetrics(
  snapshots: FollowerSnapshot[],
  pageFollowersFallback?: number,
  initialFollowersFallback?: number,
): PageMetrics {
  if (!snapshots || snapshots.length === 0) {
    const cur = pageFollowersFallback ?? 0;
    const initial = initialFollowersFallback ?? cur;
    const diff = cur - initial;
    const pct = initial > 0 ? (diff / initial) * 100 : 0;

    return {
      currentFollowers: cur,
      lastUpdateDate: null,
      growth1d: 0,
      growth1dPercent: 0,
      growth3d: 0,
      growth3dPercent: 0,
      growth7d: 0,
      growth7dPercent: 0,
      growth15d: 0,
      growth15dPercent: 0,
      growth30d: 0,
      growth30dPercent: 0,
      growth90d: 0,
      growth90dPercent: 0,
      growth365d: 0,
      growth365dPercent: 0,
      growthAll: diff,
      growthAllPercent: pct,
      totalGrowth: diff,
      totalGrowthPercent: pct,
      avgGrowthPerDay: 0,
      snapshotCount: 0,
    };
  }

  // Ordena cronologicamente por data
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const first = sorted[0];

  const currentFollowers =
    pageFollowersFallback !== undefined && pageFollowersFallback > 0
      ? pageFollowersFallback
      : (latest?.followers ?? 0);

  if (!latest || !first) {
    return {
      currentFollowers,
      lastUpdateDate: "",
      growth1d: 0,
      growth1dPercent: 0,
      growth3d: 0,
      growth3dPercent: 0,
      growth7d: 0,
      growth7dPercent: 0,
      growth15d: 0,
      growth15dPercent: 0,
      growth30d: 0,
      growth30dPercent: 0,
      growth90d: 0,
      growth90dPercent: 0,
      growth365d: 0,
      growth365dPercent: 0,
      growthAll: 0,
      growthAllPercent: 0,
      totalGrowth: 0,
      totalGrowthPercent: 0,
      avgGrowthPerDay: 0,
      snapshotCount: 0,
    };
  }

  const latestTime = new Date(latest.date).getTime();
  const DAY_MS = 24 * 60 * 60 * 1000;

  // Baselines de cálculo para cada um dos períodos
  const snap1d = findClosestSnapshot(sorted, latestTime - 1 * DAY_MS, latest);
  const snap3d = findClosestSnapshot(sorted, latestTime - 3 * DAY_MS, latest);
  const snap7d = findClosestSnapshot(sorted, latestTime - 7 * DAY_MS, latest);
  const snap15d = findClosestSnapshot(sorted, latestTime - 15 * DAY_MS, latest);
  const snap30d = findClosestSnapshot(sorted, latestTime - 30 * DAY_MS, latest);
  const snap90d = findClosestSnapshot(sorted, latestTime - 90 * DAY_MS, latest);
  const snap365d = findClosestSnapshot(sorted, latestTime - 365 * DAY_MS, latest);

  const calc = (snap: FollowerSnapshot | null) => {
    if (!snap) return { g: 0, p: 0 };
    const diff = latest.followers - snap.followers;
    const pct = snap.followers > 0 ? (diff / snap.followers) * 100 : 0;
    return { g: diff, p: pct };
  };

  const res1d = calc(snap1d);
  const res3d = calc(snap3d);
  const res7d = calc(snap7d);
  const res15d = calc(snap15d);
  const res30d = calc(snap30d);
  const res90d = calc(snap90d);
  const res365d = calc(snap365d);

  // Crescimento total desde o primeiro registro ou baseline inicial
  const baselineInitial = initialFollowersFallback !== undefined ? initialFollowersFallback : first.followers;
  const totalGrowth = latest.followers - baselineInitial;
  const totalGrowthPercent =
    baselineInitial > 0 ? (totalGrowth / baselineInitial) * 100 : 0;

  // Dias decorridos entre o primeiro e o último registro
  const totalDays = Math.max(
    1,
    Math.round(
      (new Date(latest.date).getTime() - new Date(first.date).getTime()) / DAY_MS,
    ),
  );

  const avgGrowthPerDay =
    sorted.length > 1 ? Math.round((totalGrowth / totalDays) * 10) / 10 : 0;

  return {
    currentFollowers: latest.followers,
    lastUpdateDate: latest.date,
    growth1d: res1d.g,
    growth1dPercent: res1d.p,
    growth3d: res3d.g,
    growth3dPercent: res3d.p,
    growth7d: res7d.g,
    growth7dPercent: res7d.p,
    growth15d: res15d.g,
    growth15dPercent: res15d.p,
    growth30d: res30d.g,
    growth30dPercent: res30d.p,
    growth90d: res90d.g,
    growth90dPercent: res90d.p,
    growth365d: res365d.g,
    growth365dPercent: res365d.p,
    growthAll: totalGrowth,
    growthAllPercent: totalGrowthPercent,
    totalGrowth,
    totalGrowthPercent,
    avgGrowthPerDay,
    snapshotCount: sorted.length,
  };
}

/**
 * Encontra a medição no passado mais próxima do timestamp alvo (antes ou no mesmo dia).
 */
function findClosestSnapshot(
  sorted: FollowerSnapshot[],
  targetTime: number,
  latest: FollowerSnapshot,
): FollowerSnapshot | null {
  if (sorted.length <= 1) return null;

  // Procura o último snapshot cuja data seja <= targetTime
  let candidate: FollowerSnapshot | null = null;

  for (const s of sorted) {
    const sTime = new Date(s.date).getTime();
    if (sTime <= targetTime) {
      candidate = s;
    } else if (!candidate) {
      // Se não houver nenhum anterior a 7d/30d, pega o mais antigo disponível que não seja o próprio latest
      if (s.id !== latest.id) {
        candidate = s;
      }
      break;
    }
  }

  // Se o candidato for o próprio latest e tivermos outros registros, use o anterior mais recente
  if (candidate?.id === latest.id && sorted.length > 1) {
    return sorted[sorted.length - 2] ?? null;
  }

  return candidate ?? (sorted.length > 1 ? sorted[0] ?? null : null);
}

/**
 * Formata número de seguidores com separador de milhar brasileiro: 32.400
 */
export function formatFollowers(num: number): string {
  return Math.round(num).toLocaleString("pt-BR");
}

/**
 * Formata crescimento com sinal explícito: +1.250 ou -320 ou 0
 */
export function formatGrowth(num: number): string {
  const rounded = Math.round(num);
  if (rounded > 0) return `+${rounded.toLocaleString("pt-BR")}`;
  if (rounded < 0) return rounded.toLocaleString("pt-BR");
  return "0";
}

/**
 * Formata percentual: +3,4% ou -1,2% ou 0,0%
 */
export function formatPercent(num: number): string {
  const formatted = Math.abs(num).toFixed(1).replace(".", ",");
  if (num > 0) return `+${formatted}%`;
  if (num < 0) return `-${formatted}%`;
  return "0,0%";
}

/**
 * Converte 'yyyy-mm-dd' para 'dd/mm/aaaa'
 */
export function formatDateBR(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const parts = dateStr.slice(0, 10).split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Calcula a prévia do novo registro antes de salvar.
 */
export function previewUpdate(
  currentFollowers: number,
  newFollowers: number,
  lastDateStr?: string | null,
  newDateStr?: string,
) {
  const diff = newFollowers - currentFollowers;
  const pct = currentFollowers > 0 ? (diff / currentFollowers) * 100 : 0;

  let days = 1;
  if (lastDateStr && newDateStr) {
    const d1 = new Date(lastDateStr).getTime();
    const d2 = new Date(newDateStr).getTime();
    days = Math.max(1, Math.round(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)));
  }

  const avgPerDay = Math.round((diff / days) * 10) / 10;

  return {
    diff,
    pct,
    avgPerDay,
    days,
  };
}
