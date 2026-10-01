import { useState, useMemo } from "react";
import {
  ArrowUpDown,
  Instagram,
  Plus,
  History,
  TrendingUp,
  TrendingDown,
  Search,
  Filter,
} from "lucide-react";
import { formatFollowers, formatGrowth, formatPercent, formatDateBR, type PageMetrics } from "@/lib/metrics";
import { type Platform, type SocialPage } from "@/lib/types";

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

interface TableRowData {
  page: SocialPage;
  metrics: PageMetrics;
}

interface ComparativeTableProps {
  data: TableRowData[];
  onRecordSnapshot: (pageId: string) => void;
  onViewHistory: (page: SocialPage) => void;
}

type SortField = "name" | "platform" | "followers" | "growth7d" | "growth30d" | "lastUpdate";
type SortOrder = "asc" | "desc";

export function ComparativeTable({
  data,
  onRecordSnapshot,
  onViewHistory,
}: ComparativeTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("followers");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const filteredAndSortedData = useMemo(() => {
    return data
      .filter(({ page }) => {
        const matchesSearch =
          page.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          page.handle.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesPlatform = platformFilter === "all" || page.platform === platformFilter;
        const matchesType =
          typeFilter === "all" ||
          (typeFilter === "own" && !page.isCompetitor) ||
          (typeFilter === "competitor" && page.isCompetitor);

        return matchesSearch && matchesPlatform && matchesType;
      })
      .sort((a, b) => {
        let diff = 0;
        switch (sortField) {
          case "name":
            diff = a.page.name.localeCompare(b.page.name);
            break;
          case "platform":
            diff = a.page.platform.localeCompare(b.page.platform);
            break;
          case "followers":
            diff =
              (a.page.followersCount ?? (a.metrics.currentFollowers > 0 ? a.metrics.currentFollowers : 0)) -
              (b.page.followersCount ?? (b.metrics.currentFollowers > 0 ? b.metrics.currentFollowers : 0));
            break;
          case "growth7d":
            diff = a.metrics.growth7d - b.metrics.growth7d;
            break;
          case "growth30d":
            diff = a.metrics.growth30d - b.metrics.growth30d;
            break;
          case "lastUpdate":
            diff = (a.metrics.lastUpdateDate || "").localeCompare(b.metrics.lastUpdateDate || "");
            break;
        }
        return sortOrder === "asc" ? diff : -diff;
      });
  }, [data, searchTerm, platformFilter, typeFilter, sortField, sortOrder]);

  return (
    <div className="panel p-6">
      {/* Topo da Tabela: Título e Filtros */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="font-semibold text-sm text-foreground">Tabela Comparativa de Dados</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Visão unificada das suas páginas e concorrentes para análise de métricas e evolução.
          </p>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Busca por texto */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filtrar por nome ou @..."
              className="h-8 rounded-lg border border-input bg-secondary/40 pl-8 pr-3 text-xs outline-none focus:border-primary/60"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Filtro de Tipo */}
          <select
            className="h-8 rounded-lg border border-input bg-secondary/40 px-2.5 text-xs outline-none focus:border-primary/60"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">Todas as Páginas</option>
            <option value="own">Apenas Minhas Páginas</option>
            <option value="competitor">Apenas Concorrentes</option>
          </select>

          {/* Filtro de Plataforma */}
          <select
            className="h-8 rounded-lg border border-input bg-secondary/40 px-2.5 text-xs outline-none focus:border-primary/60"
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
          >
            <option value="all">Todas as Plataformas</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
          </select>
        </div>
      </div>

      {/* Conteúdo da Tabela */}
      <div className="mt-5 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-secondary/40 text-muted-foreground border-b border-border">
            <tr>
              <th
                onClick={() => handleSort("name")}
                className="py-3 px-4 font-medium cursor-pointer hover:text-foreground transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Página</span>
                  <ArrowUpDown className="size-3" />
                </div>
              </th>

              <th
                onClick={() => handleSort("platform")}
                className="py-3 px-3 font-medium cursor-pointer hover:text-foreground transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Plataforma</span>
                  <ArrowUpDown className="size-3" />
                </div>
              </th>

              <th
                onClick={() => handleSort("followers")}
                className="py-3 px-3 font-medium cursor-pointer hover:text-foreground transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Seguidores</span>
                  <ArrowUpDown className="size-3" />
                </div>
              </th>

              <th
                onClick={() => handleSort("growth7d")}
                className="py-3 px-3 font-medium cursor-pointer hover:text-foreground transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Crescimento 7d</span>
                  <ArrowUpDown className="size-3" />
                </div>
              </th>

              <th
                onClick={() => handleSort("growth30d")}
                className="py-3 px-3 font-medium cursor-pointer hover:text-foreground transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Crescimento 30d</span>
                  <ArrowUpDown className="size-3" />
                </div>
              </th>

              <th
                onClick={() => handleSort("lastUpdate")}
                className="py-3 px-3 font-medium cursor-pointer hover:text-foreground transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Última Atualização</span>
                  <ArrowUpDown className="size-3" />
                </div>
              </th>

              <th className="py-3 px-4 text-right font-medium">Ações</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border/60">
            {filteredAndSortedData.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground text-xs">
                  Nenhuma página encontrada com os filtros selecionados.
                </td>
              </tr>
            ) : (
              filteredAndSortedData.map(({ page, metrics }) => {
                const isInstagram = page.platform === "instagram";
                const isOwn = !page.isCompetitor;

                return (
                  <tr
                    key={page.id}
                    className={`transition-colors ${
                      isOwn ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-secondary/20"
                    }`}
                  >
                    {/* Página e Identificador */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-foreground truncate">{page.name}</span>
                            <span
                              className={`rounded-full px-1.5 py-0.2 text-[9px] font-medium uppercase tracking-wider ${
                                isOwn
                                  ? "bg-primary/20 text-primary border border-primary/30"
                                  : "bg-secondary text-muted-foreground border border-border"
                              }`}
                            >
                              {isOwn ? "Minha Página" : "Concorrente"}
                            </span>
                          </div>
                          <span className="text-[11px] text-muted-foreground block truncate">
                            @{page.handle}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Plataforma */}
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          isInstagram
                            ? "bg-pink-500/10 text-pink-400 border border-pink-500/20"
                            : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                        }`}
                      >
                        {isInstagram ? <Instagram className="size-2.5" /> : <FacebookIcon className="size-2.5" />}
                        {isInstagram ? "Instagram" : "Facebook"}
                      </span>
                    </td>

                    {/* Seguidores Atuais */}
                    <td className="py-3 px-3 font-mono font-bold text-foreground">
                      {formatFollowers(page.followersCount ?? (metrics.currentFollowers > 0 ? metrics.currentFollowers : 0))}
                    </td>

                    {/* Crescimento 7 dias */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1">
                        <span
                          className={`font-semibold flex items-center gap-0.5 ${
                            metrics.growth7d >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {metrics.growth7d >= 0 ? (
                            <TrendingUp className="size-3" />
                          ) : (
                            <TrendingDown className="size-3" />
                          )}
                          {formatGrowth(metrics.growth7d)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          ({formatPercent(metrics.growth7dPercent)})
                        </span>
                      </div>
                    </td>

                    {/* Crescimento 30 dias */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1">
                        <span
                          className={`font-semibold flex items-center gap-0.5 ${
                            metrics.growth30d >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {metrics.growth30d >= 0 ? (
                            <TrendingUp className="size-3" />
                          ) : (
                            <TrendingDown className="size-3" />
                          )}
                          {formatGrowth(metrics.growth30d)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          ({formatPercent(metrics.growth30dPercent)})
                        </span>
                      </div>
                    </td>

                    {/* Data Última Atualização */}
                    <td className="py-3 px-3 text-muted-foreground">
                      {formatDateBR(metrics.lastUpdateDate)}
                    </td>

                    {/* Ações */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onViewHistory(page)}
                          className="rounded p-1 text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors"
                          title="Ver histórico de medições"
                        >
                          <History className="size-3.5" />
                        </button>
                        <button
                          onClick={() => onRecordSnapshot(page.id)}
                          className="rounded bg-primary/10 hover:bg-primary/20 text-primary px-2 py-1 font-medium transition-colors flex items-center gap-1 text-[11px]"
                          title="Registrar nova medição"
                        >
                          <Plus className="size-3" />
                          <span>Atualizar</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
