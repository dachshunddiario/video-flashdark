import { Instagram, Plus, History, Trash2, Calendar, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { formatFollowers, formatGrowth, formatPercent, formatDateBR, type PageMetrics } from "@/lib/metrics";
import { type FollowerSnapshot, type SocialPage } from "@/lib/types";

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

interface OwnPageCardProps {
  page: SocialPage;
  metrics: PageMetrics;
  recentSnapshots: FollowerSnapshot[];
  onRecordSnapshot: (pageId: string) => void;
  onViewHistory: (page: SocialPage) => void;
  onDelete: (pageId: string) => void;
}

export function OwnPageCard({
  page,
  metrics,
  recentSnapshots,
  onRecordSnapshot,
  onViewHistory,
  onDelete,
}: OwnPageCardProps) {
  const isInstagram = page.platform === "instagram";

  // Ordena cronologicamente para a trilha de evolução (ex: 1.000 -> 1.120 -> 1.250)
  const sortedSnaps = [...recentSnapshots].sort((a, b) => a.date.localeCompare(b.date));
  const distinctDateSnaps = sortedSnaps.filter((s, idx, arr) => idx === 0 || s.date !== arr[idx - 1]?.date);
  const recentTrail = distinctDateSnaps.slice(-4); // Últimos 4 registros
  const hasTrailVariation = recentTrail.length > 1 && recentTrail.some((s) => s.followers !== recentTrail[0]?.followers);

  return (
    <div className="group flex flex-col justify-between rounded-xl border border-border/80 bg-card p-5 transition-all duration-200 hover:border-primary/40 hover:shadow-lg">
      <div>
        {/* Topo do Card */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {page.avatarUrl ? (
              <img
                src={page.avatarUrl}
                alt={page.name}
                className="size-10 rounded-full object-cover border border-border/80 shrink-0 shadow-sm"
              />
            ) : null}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate font-semibold text-base text-foreground" title={page.name}>
                  {page.name}
                </h3>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${
                    isInstagram
                      ? "bg-pink-500/10 text-pink-400 border border-pink-500/20"
                      : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  }`}
                >
                  {isInstagram ? <Instagram className="size-2.5" /> : <FacebookIcon className="size-2.5" />}
                  {isInstagram ? "Instagram" : "Facebook"}
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground mt-0.5">@{page.handle}</p>
            </div>
          </div>

          <button
            onClick={() => onDelete(page.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-destructive rounded"
            title="Excluir página"
          >
            <Trash2 className="size-4" />
          </button>
        </div>

        {/* Número Atual de Seguidores & Posts */}
        <div className="mt-4 flex items-baseline justify-between">
          <div>
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
              Seguidores Atuais
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="font-mono text-2xl font-bold tracking-tight text-foreground">
                {formatFollowers(page.followersCount ?? (metrics.currentFollowers > 0 ? metrics.currentFollowers : 0))}
              </span>
              <span className="text-xs text-muted-foreground">seguidores</span>
            </div>
          </div>
          {page.postsCount ? (
            <div className="text-right">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                Publicações
              </span>
              <span className="font-mono text-sm font-semibold text-foreground">
                {page.postsCount.toLocaleString("pt-BR")} posts
              </span>
            </div>
          ) : null}
        </div>

        {/* Grade de Métricas: 7d, 30d e Percentual */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {/* 7 dias */}
          <div className="rounded-lg border border-border/60 bg-secondary/30 p-2.5">
            <span className="text-[10px] text-muted-foreground block truncate">Últimos 7 dias</span>
            <span
              className={`font-semibold text-xs mt-0.5 flex items-center gap-0.5 ${
                metrics.growth7d >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {metrics.growth7d >= 0 ? (
                <TrendingUp className="size-3 shrink-0" />
              ) : (
                <TrendingDown className="size-3 shrink-0" />
              )}
              {formatGrowth(metrics.growth7d)}
            </span>
          </div>

          {/* 30 dias */}
          <div className="rounded-lg border border-border/60 bg-secondary/30 p-2.5">
            <span className="text-[10px] text-muted-foreground block truncate">Últimos 30 dias</span>
            <span
              className={`font-semibold text-xs mt-0.5 flex items-center gap-0.5 ${
                metrics.growth30d >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {metrics.growth30d >= 0 ? (
                <TrendingUp className="size-3 shrink-0" />
              ) : (
                <TrendingDown className="size-3 shrink-0" />
              )}
              {formatGrowth(metrics.growth30d)}
            </span>
          </div>

          {/* Percentual Total */}
          <div className="rounded-lg border border-border/60 bg-secondary/30 p-2.5">
            <span className="text-[10px] text-muted-foreground block truncate">Crescimento %</span>
            <span
              className={`font-semibold text-xs mt-0.5 flex items-center gap-0.5 ${
                metrics.growth30dPercent >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {formatPercent(metrics.growth30dPercent)}
            </span>
          </div>
        </div>

        {/* Trilha de Evolução Recente: Ex: 1.000 → 1.120 → 1.250 */}
        {hasTrailVariation && (
          <div className="mt-4 rounded-lg bg-secondary/20 p-2.5 border border-border/40">
            <span className="text-[10px] text-muted-foreground block mb-1">
              Evolução recente:
            </span>
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono font-medium text-foreground">
              {recentTrail.map((snap, idx) => (
                <span key={snap.id} className="flex items-center gap-1.5">
                  <span className={idx === recentTrail.length - 1 ? "text-primary font-bold" : "text-muted-foreground"}>
                    {formatFollowers(snap.followers)}
                  </span>
                  {idx < recentTrail.length - 1 && (
                    <ArrowRight className="size-3 text-muted-foreground/60" />
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Rodapé: Data da última medição e Botões */}
      <div className="mt-5 pt-3.5 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 text-[11px]" title={`Atualizado em ${formatDateBR(metrics.lastUpdateDate)}`}>
          <Calendar className="size-3.5" />
          {formatDateBR(metrics.lastUpdateDate)}
        </span>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onViewHistory(page)}
            className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-secondary/60 text-foreground transition-colors flex items-center gap-1"
          >
            <History className="size-3 text-muted-foreground" />
            <span>Histórico</span>
          </button>
          <button
            onClick={() => onRecordSnapshot(page.id)}
            className="rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground px-2.5 py-1 text-xs font-medium transition-colors flex items-center gap-1 shadow-sm"
          >
            <Plus className="size-3.5" />
            <span>Atualizar</span>
          </button>
        </div>
      </div>
    </div>
  );
}
