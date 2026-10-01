import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Users,
  TrendingUp,
  Plus,
  ArrowUpRight,
  Upload,
  Calendar,
  Swords,
  Sparkles,
  RefreshCw,
  FolderSync,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { AddPageModal } from "@/components/dashboard/AddPageModal";
import { AddSnapshotModal } from "@/components/dashboard/AddSnapshotModal";
import { ImportExportModal } from "@/components/dashboard/ImportExportModal";
import { PageHistoryModal } from "@/components/dashboard/PageHistoryModal";
import { MetaApiModal } from "@/components/dashboard/MetaApiModal";
import { OwnPageCard } from "@/components/dashboard/OwnPageCard";
import { CompetitorCard } from "@/components/dashboard/CompetitorCard";
import { GrowthChart } from "@/components/dashboard/GrowthChart";
import { ComparativeTable } from "@/components/dashboard/ComparativeTable";
import { CompetitorInsightsSection } from "@/components/dashboard/CompetitorInsightsSection";
import { calculatePageMetrics, formatFollowers, formatGrowth, formatPercent } from "@/lib/metrics";
import { INITIAL_DEMO_PAGES, INITIAL_DEMO_HISTORY, INITIAL_COMPETITOR_POSTS } from "@/lib/mock-data";
import { STORAGE_KEYS, uid, useLocalState } from "@/lib/local-store";
import { lookupInstagramProfile, testMetaConnection, saveHistoricoRecord } from "@/lib/social-api";
import {
  type FollowerSnapshot,
  type SocialPage,
  type PagePostInsight,
  type MetaApiConfig,
  type ConnectedProfileData,
} from "@/lib/types";
import { Zap, CheckCircle2, Loader2, Trash2, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard & Radar de Concorrentes · Studio Local" },
      {
        name: "description",
        content:
          "Acompanhe o crescimento de seguidores das suas páginas do Instagram e Facebook e analise posts e métricas de concorrentes de 1 a 90 dias 100% offline e privada.",
      },
      { property: "og:title", content: "Dashboard & Radar de Concorrentes · Studio Local" },
      {
        property: "og:description",
        content: "Acompanhe o crescimento das suas páginas e analise concorrentes.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { value: pages, setValue: setPages } = useLocalState<SocialPage[]>(
    STORAGE_KEYS.pages,
    INITIAL_DEMO_PAGES,
  );
  const { value: history, setValue: setHistory } = useLocalState<FollowerSnapshot[]>(
    STORAGE_KEYS.followerHistory,
    INITIAL_DEMO_HISTORY,
  );
  const { value: competitorPosts, setValue: setCompetitorPosts } = useLocalState<PagePostInsight[]>(
    STORAGE_KEYS.competitorPosts,
    INITIAL_COMPETITOR_POSTS,
  );

  // Estados de modais e integração Meta API
  const { value: metaConfig, setValue: setMetaConfig } = useLocalState<MetaApiConfig | null>(
    STORAGE_KEYS.metaApiConfig,
    null,
  );
  const [isMetaModalOpen, setIsMetaModalOpen] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const [isAddPageOpen, setIsAddPageOpen] = useState(false);
  const [isCompetitorDefault, setIsCompetitorDefault] = useState(false);
  const [isAddSnapshotOpen, setIsAddSnapshotOpen] = useState(false);
  const [snapshotDefaultPageId, setSnapshotDefaultPageId] = useState<string | null>(null);
  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
  const [historyModalPage, setHistoryModalPage] = useState<SocialPage | null>(null);
  const [isClearDashboardOpen, setIsClearDashboardOpen] = useState(false);

  // Separa páginas próprias e concorrentes
  const ownPages = useMemo(() => pages.filter((p) => !p.isCompetitor), [pages]);
  const competitors = useMemo(() => pages.filter((p) => p.isCompetitor), [pages]);

  // Calcula métricas para cada página de forma determinística
  const pagesMetrics = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculatePageMetrics>>();
    for (const page of pages) {
      const pageSnaps = history.filter((h) => h.pageId === page.id);
      map.set(
        page.id,
        calculatePageMetrics(pageSnaps, page.followersCount, page.initialFollowersCount),
      );
    }
    return map;
  }, [pages, history]);

  // Métricas agregadas das MINHAS PÁGINAS (Primeira linha)
  const aggregatedStats = useMemo(() => {
    let totalFollowers = 0;
    let totalGrowth7d = 0;
    let totalGrowth30d = 0;
    let baseline30dTotal = 0;

    for (const page of ownPages) {
      const m = pagesMetrics.get(page.id);
      const followers =
        page.followersCount ?? (m && m.currentFollowers > 0 ? m.currentFollowers : 0);
      totalFollowers += followers;
      if (m) {
        totalGrowth7d += m.growth7d;
        totalGrowth30d += m.growth30d;
        baseline30dTotal += Math.max(0, followers - m.growth30d);
      }
    }

    const growthPercent30d =
      baseline30dTotal > 0 ? (totalGrowth30d / baseline30dTotal) * 100 : 0;

    // Concorrente com maior ritmo absoluto de crescimento em 30 dias
    let topGrowingCompetitor: { name: string; growth: number } | null = null;
    for (const comp of competitors) {
      const m = pagesMetrics.get(comp.id);
      if (m && (!topGrowingCompetitor || m.growth30d > topGrowingCompetitor.growth)) {
        topGrowingCompetitor = { name: comp.name, growth: m.growth30d };
      }
    }

    return {
      totalFollowers,
      totalGrowth7d,
      totalGrowth30d,
      growthPercent30d,
      topGrowingCompetitor,
    };
  }, [ownPages, competitors, pagesMetrics]);

  // Sincroniza em lote as contas da Meta para o Dashboard de forma atômica e consistente
  const syncProfilesToDashboard = (profilesToSync: ConnectedProfileData[]) => {
    if (!profilesToSync || profilesToSync.length === 0) return;

    const today = new Date().toISOString().slice(0, 10);

    setPages((currentPages) => {
      // 1. Remove páginas demo de exemplo pré-cadastradas para não misturar com as reais do usuário
      let updatedPages = currentPages.filter(
        (p) =>
          p.id !== "page-1" &&
          p.id !== "page-2" &&
          p.handle.toLowerCase() !== "clubedodachshund" &&
          (!profilesToSync.some((sync) => sync.username.toLowerCase() === "dachshunddiario")
            ? p.handle.toLowerCase() !== "dachshunddiario"
            : true),
      );

      for (const profileData of profilesToSync) {
        if (!profileData || !profileData.username) continue;
        const cleanHandle = profileData.username.toLowerCase();
        const platform = profileData.platform || "instagram";
        const targetPageId = profileData.id
          ? platform === "facebook"
            ? `fb-${profileData.id}`
            : `ig-${profileData.id}`
          : `${platform}-${cleanHandle}`;

        const isFb = platform === "facebook";

        const newOrUpdatedPage: SocialPage = {
          id: targetPageId,
          name: profileData.name || profileData.username,
          handle: profileData.username,
          platform,
          niche: profileData.pageName
            ? isFb
              ? `Página Facebook: ${profileData.pageName}`
              : `Página: ${profileData.pageName}`
            : "Minha Página",
          isCompetitor: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          avatarUrl: profileData.avatarUrl,
          biography: profileData.biography,
          followersCount: profileData.followers ?? 0,
          postsCount: profileData.posts ?? 0,
          verified: true,
        };

        // Procura se já existe exatamente essa conta por ID ou por handle + plataforma
        const existingIdx = updatedPages.findIndex(
          (p) =>
            p.id === targetPageId ||
            (p.handle.toLowerCase() === cleanHandle && p.platform === platform),
        );

        if (existingIdx >= 0) {
          const old = updatedPages[existingIdx]!;
          updatedPages[existingIdx] = {
            ...old,
            ...newOrUpdatedPage,
            id: targetPageId,
            createdAt: old.createdAt,
          };
        } else {
          updatedPages.push(newOrUpdatedPage);
        }
      }

      // Deduplicação estrita: nunca permite cards duplicados com o mesmo handle e plataforma
      const seen = new Set<string>();
      return updatedPages.filter((p) => {
        const key = `${p.platform}:${p.handle.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });

    setHistory((currentHistory) => {
      // Remove medições mock de páginas de exemplo
      let updatedHistory = currentHistory.filter(
        (h) => !h.id.startsWith("s-1-") && !h.id.startsWith("s-2-"),
      );

      for (const profileData of profilesToSync) {
        if (!profileData || !profileData.username) continue;
        const cleanHandle = profileData.username.toLowerCase();
        const platform = profileData.platform || "instagram";
        const targetPageId = profileData.id
          ? platform === "facebook"
            ? `fb-${profileData.id}`
            : `ig-${profileData.id}`
          : `${platform}-${cleanHandle}`;

        const realFollowers = profileData.followers ?? 0;
        const realPosts = profileData.posts ?? 0;

        // Isola os registros de outras páginas
        const otherSnaps = updatedHistory.filter((h) => h.pageId !== targetPageId);

        // Limpa medições que tenham vindo de bugs anteriores (ordem de grandeza completamente divergente)
        const validExistingSnaps = updatedHistory.filter((h) => {
          if (h.pageId !== targetPageId || h.date === today) return false;
          if (realFollowers <= 50 && h.followers > 500) return false;
          if (realFollowers > 1000 && h.followers < 100) return false;
          return true;
        });

        // Adiciona histórico diário real obtido da Meta (se disponível)
        if (profileData.historicalSnapshots && profileData.historicalSnapshots.length > 0) {
          for (const hs of profileData.historicalSnapshots) {
            if (hs.date === today) continue;
            validExistingSnaps.push({
              id: `${targetPageId}-${hs.date}`,
              pageId: targetPageId,
              date: hs.date,
              followers: hs.followers,
              posts: realPosts,
            });
          }
        }

        // Adiciona a medição com o número oficial exato da Meta
        validExistingSnaps.push({
          id: `${targetPageId}-${today}`,
          pageId: targetPageId,
          date: today,
          followers: realFollowers,
          posts: realPosts,
        });

        updatedHistory = [...otherSnaps, ...validExistingSnaps];
      }

      return updatedHistory;
    });
  };

  // Salvar configuração da Meta vinda do modal com suporte a seleção múltipla
  const handleSaveMetaConfig = (
    newConfig: MetaApiConfig | null,
    profileData?: ConnectedProfileData,
    allDiscovered?: ConnectedProfileData[],
  ) => {
    setMetaConfig(newConfig);

    if (!newConfig) {
      setSyncFeedback("Conexão com a Meta API desvinculada.");
      setTimeout(() => setSyncFeedback(null), 5000);
      return;
    }

    const profiles =
      allDiscovered && allDiscovered.length > 0
        ? allDiscovered
        : profileData && profileData.username
          ? [profileData]
          : [];

    if (profiles.length > 0) {
      syncProfilesToDashboard(profiles);
      setSyncFeedback(
        `🎉 ${profiles.length} página${profiles.length > 1 ? "s" : ""} da Meta sincronizada${
          profiles.length > 1 ? "s" : ""
        } com seguidores e posts oficiais!`,
      );
      setTimeout(() => setSyncFeedback(null), 10000);
    }
  };

  // Limpa todas as informações do Dashboard e todo o cache de sincronização
  const handleClearAllData = () => {
    // 1. Limpa estados em memória
    setPages([]);
    setHistory([]);
    setCompetitorPosts([]);
    setMetaConfig(null);

    // 2. Limpa cache e dados locais persistidos no localStorage
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem("vlocal:" + STORAGE_KEYS.pages);
        window.localStorage.removeItem("vlocal:" + STORAGE_KEYS.competitors);
        window.localStorage.removeItem("vlocal:" + STORAGE_KEYS.followerHistory);
        window.localStorage.removeItem("vlocal:" + STORAGE_KEYS.competitorPosts);
        window.localStorage.removeItem("vlocal:" + STORAGE_KEYS.metaApiConfig);
      } catch (err) {
        console.warn("Erro ao limpar localStorage:", err);
      }
    }

    setIsClearDashboardOpen(false);
    setSyncFeedback("🗑️ Todas as páginas, histórico e caches da dashboard foram limpos com sucesso!");
    setTimeout(() => setSyncFeedback(null), 8000);
  };

  // Sincroniza todas as páginas com a Meta API
  const handleSyncAllPages = async () => {
    if (pages.length === 0 && !metaConfig?.accessToken) return;
    setIsSyncingAll(true);
    setSyncFeedback(null);
    let updatedCount = 0;
    const today = new Date().toISOString().slice(0, 10);
    const newSnapshots: FollowerSnapshot[] = [];

    // 1. Sincroniza todas as páginas próprias diretamente pela lista de contas da Meta
    if (metaConfig?.accessToken) {
      try {
        const testRes = await testMetaConnection({
          accessToken: metaConfig.accessToken,
          instagramAccountId: metaConfig.instagramAccountId,
        });

        if (testRes.success && testRes.accounts && testRes.accounts.length > 0) {
          // Pega apenas as páginas próprias que o usuário já tinha cadastradas
          const ownPageHandles = new Set(
            pages.filter((p) => !p.isCompetitor).map((p) => `${p.platform}:${p.handle.toLowerCase()}`),
          );

          const accountsToSync = testRes.accounts.filter((acc) =>
            ownPageHandles.has(`${acc.platform}:${acc.username.toLowerCase()}`),
          );

          if (accountsToSync.length > 0) {
            syncProfilesToDashboard(accountsToSync);
            updatedCount += accountsToSync.length;
          } else {
            // Se nenhuma estava cadastrada antes, sincroniza todas as descobertas
            syncProfilesToDashboard(testRes.accounts);
            updatedCount += testRes.accounts.length;
          }
        }
      } catch (err) {
        console.warn("Erro ao sincronizar contas oficiais da Meta:", err);
      }
    }

    // 2. Sincroniza apenas páginas de CONCORRENTES (se houver)
    const competitorPages = pages.filter((p) => p.isCompetitor);
    for (const comp of competitorPages) {
      try {
        const data = await lookupInstagramProfile(comp.handle, metaConfig);
        if (data.success && data.source === "meta_graph_api" && data.followers) {
          newSnapshots.push({
            id: `${comp.id}-${today}`,
            pageId: comp.id,
            date: today,
            followers: data.followers,
            posts: data.posts,
          });
          updatedCount++;
        }
      } catch (e) {
        console.warn("Falha ao sincronizar concorrente", comp.handle, e);
      }
    }

    if (newSnapshots.length > 0) {
      setPages((current) =>
        current.map((p) => {
          const snap = newSnapshots.find((s) => s.pageId === p.id);
          if (snap) {
            return {
              ...p,
              followersCount: snap.followers,
              postsCount: snap.posts ?? p.postsCount,
              updatedAt: new Date().toISOString(),
            };
          }
          return p;
        }),
      );

      setHistory((current) => {
        const filtered = current.filter(
          (h) => !newSnapshots.some((ns) => ns.pageId === h.pageId && ns.date === h.date),
        );
        return [...filtered, ...newSnapshots];
      });
    }

    if (updatedCount > 0) {
      setSyncFeedback(`Sincronização concluída! ${updatedCount} página(s) atualizada(s) com dados 100% reais.`);
    } else {
      setSyncFeedback("Páginas verificadas. Nenhum dado precisou de atualização.");
    }
    setIsSyncingAll(false);
    setTimeout(() => setSyncFeedback(null), 8000);
  };

  // Handlers para ações
  const handleSavePage = (newPage: SocialPage, initialSnapshot?: FollowerSnapshot) => {
    setPages([...pages, newPage]);
    if (initialSnapshot) {
      setHistory([...history, initialSnapshot]);
    }
    // Salva no banco de dados Historico_Seguidores
    const followersToSave = initialSnapshot?.followers ?? newPage.followersCount ?? 0;
    saveHistoricoRecord({
      profile_handle: newPage.handle,
      profile_name: newPage.name,
      date: initialSnapshot?.date || new Date().toISOString().slice(0, 10),
      followers_count: followersToSave,
      type: newPage.isCompetitor ? "Concorrente" : "Minha Página",
      page_id: newPage.id,
    }).catch((err) => console.warn("[Historico_Seguidores] Erro ao salvar página:", err.message));
  };

  const handleSaveSnapshot = (snap: FollowerSnapshot) => {
    // Se já existir snapshot para a mesma data na mesma página, substitui
    const filtered = history.filter(
      (h) => !(h.pageId === snap.pageId && h.date === snap.date),
    );
    const updatedHistory = [...filtered, snap];
    setHistory(updatedHistory);

    const targetPage = pages.find((p) => p.id === snap.pageId);
    if (targetPage) {
      saveHistoricoRecord({
        profile_handle: targetPage.handle,
        profile_name: targetPage.name,
        date: snap.date,
        followers_count: snap.followers,
        type: targetPage.isCompetitor ? "Concorrente" : "Minha Página",
        page_id: targetPage.id,
      }).catch((err) => console.warn("[Historico_Seguidores] Erro ao salvar snapshot:", err.message));
    }

    // Atualiza a página correspondente para manter os seguidores e marcos alinhados
    setPages((prevPages) =>
      prevPages.map((p) => {
        if (p.id === snap.pageId) {
          const pageSnaps = updatedHistory.filter((h) => h.pageId === p.id);
          const latestSnap = [...pageSnaps].sort((a, b) => b.date.localeCompare(a.date))[0];
          const earliestSnap = [...pageSnaps].sort((a, b) => a.date.localeCompare(b.date))[0];

          return {
            ...p,
            followersCount: latestSnap ? latestSnap.followers : p.followersCount,
            initialFollowersCount:
              p.initialFollowersCount !== undefined
                ? p.initialFollowersCount
                : earliestSnap
                  ? earliestSnap.followers
                  : undefined,
            updatedAt: new Date().toISOString(),
          };
        }
        return p;
      }),
    );
  };

  const handleDeleteSnapshot = (snapshotId: string) => {
    setHistory(history.filter((h) => h.id !== snapshotId));
  };

  const handleDeletePage = (pageId: string) => {
    setPages(pages.filter((p) => p.id !== pageId));
    setHistory(history.filter((h) => h.pageId !== pageId));
    if (historyModalPage?.id === pageId) {
      setHistoryModalPage(null);
    }
  };

  const openAddSnapshotForPage = (pageId: string) => {
    setSnapshotDefaultPageId(pageId);
    setIsAddSnapshotOpen(true);
  };

  const openAddCompetitor = () => {
    setIsCompetitorDefault(true);
    setIsAddPageOpen(true);
  };

  const openAddOwnPage = () => {
    setIsCompetitorDefault(false);
    setIsAddPageOpen(true);
  };

  // Dados para a tabela comparativa
  const comparativeTableData = useMemo(() => {
    return pages.map((page) => ({
      page,
      metrics: pagesMetrics.get(page.id) || calculatePageMetrics([]),
    }));
  }, [pages, pagesMetrics]);

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-8 sm:px-10 space-y-8">
      {/* TOPO: Cabeçalho com Título, Subtítulo e Ações Rápidas */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-border/60 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe o crescimento e métricas atualizadas das suas páginas e concorrentes.
          </p>
        </div>

        {/* Botões de Ação do Topo */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Botão Configurar Meta API */}
          <button
            onClick={() => setIsMetaModalOpen(true)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition ${
              metaConfig?.accessToken
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
            title="Conecte seu token da Meta Graph API para sincronização oficial ao vivo"
          >
            <Zap className={`size-3.5 ${metaConfig?.accessToken ? "text-emerald-400" : "text-primary"}`} />
            {metaConfig?.accessToken ? "Meta API Conectada" : "Conectar Meta API"}
          </button>

          {/* Botão Sincronizar com Meta */}
          <button
            onClick={handleSyncAllPages}
            disabled={isSyncingAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-medium text-foreground transition hover:bg-secondary hover:border-border/80 disabled:opacity-50"
            title="Atualizar seguidores e posts de todas as páginas agora"
          >
            {isSyncingAll ? (
              <Loader2 className="size-3.5 animate-spin text-primary" />
            ) : (
              <RefreshCw className="size-3.5 text-muted-foreground" />
            )}
            {isSyncingAll ? "Sincronizando..." : "Sincronizar Todas"}
          </button>

          <button
            onClick={() => setIsImportExportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-medium text-foreground transition hover:bg-secondary hover:border-border/80"
          >
            <FolderSync className="size-3.5 text-muted-foreground" />
            CSV
          </button>

          {/* Botão Limpar Dashboard */}
          <button
            onClick={() => setIsClearDashboardOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20 hover:border-rose-500/50"
            title="Limpar todas as informações, páginas e histórico da dashboard"
          >
            <Trash2 className="size-3.5 text-rose-400" />
            Limpar Dashboard
          </button>

          <button
            onClick={() => {
              setSnapshotDefaultPageId(null);
              setIsAddSnapshotOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3.5 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20"
          >
            <Plus className="size-3.5" />
            Medição Manual
          </button>

          <button
            onClick={openAddOwnPage}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
          >
            <Plus className="size-3.5" />
            Cadastrar Página
          </button>
        </div>
      </div>

      {/* Banner de Feedback de Sincronização */}
      {syncFeedback && (
        <div className="rounded-xl border border-emerald-500/50 bg-emerald-950/60 p-4 text-xs text-emerald-200 flex items-center justify-between shadow-lg transition animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="p-1 rounded-full bg-emerald-500/20 text-emerald-400">
              <CheckCircle2 className="size-5 shrink-0" />
            </div>
            <span className="text-sm font-medium text-foreground">{syncFeedback}</span>
          </div>
          <button
            onClick={() => setSyncFeedback(null)}
            className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold underline px-2 py-1 shrink-0"
          >
            Dispensar
          </button>
        </div>
      )}

      {/* PRIMEIRA LINHA: Cards de Métricas Principais */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Seguidores Atuais (Minhas Páginas) */}
        <StatCard
          label="Seguidores atuais"
          value={formatFollowers(aggregatedStats.totalFollowers)}
          hint={`${ownPages.length} página${ownPages.length === 1 ? "" : "s"} própria${ownPages.length === 1 ? "" : "s"}`}
          icon={Users}
        />

        {/* Crescimento nos últimos 7 dias */}
        <StatCard
          label="Crescimento (7 dias)"
          value={formatGrowth(aggregatedStats.totalGrowth7d)}
          hint="Total somado nas suas páginas"
          tone={aggregatedStats.totalGrowth7d >= 0 ? "up" : "down"}
          icon={TrendingUp}
        />

        {/* Crescimento nos últimos 30 dias */}
        <StatCard
          label="Crescimento (30 dias)"
          value={formatGrowth(aggregatedStats.totalGrowth30d)}
          hint="Variação absoluta no último mês"
          tone={aggregatedStats.totalGrowth30d >= 0 ? "up" : "down"}
          icon={TrendingUp}
        />

        {/* Crescimento Percentual (30 dias) */}
        <StatCard
          label="Crescimento percentual"
          value={formatPercent(aggregatedStats.growthPercent30d)}
          hint={
            aggregatedStats.topGrowingCompetitor
              ? `Maior concorrente 30d: +${formatFollowers(aggregatedStats.topGrowingCompetitor.growth)}`
              : "Baseado no histórico local"
          }
          tone={aggregatedStats.growthPercent30d >= 0 ? "up" : "down"}
          icon={ArrowUpRight}
        />
      </div>

      {/* SEGUNDA LINHA: Gráfico de Crescimento com Contadores Reais (Passos 1, 2, 3 e 4) */}
      <GrowthChart
        pages={pages}
        history={history}
        metaConfig={metaConfig}
        onRecordSnapshot={(id) => openAddSnapshotForPage(id || pages[0]?.id || "")}
        onUpdatePage={(updatedPage) => {
          setPages((current) => current.map((p) => (p.id === updatedPage.id ? updatedPage : p)));
        }}
        onRefreshData={handleSyncAllPages}
      />

      {/* TERCEIRA LINHA: Radar de Concorrentes & O Que as Grandes Fazem */}
      <CompetitorInsightsSection
        competitors={competitors}
        ownPages={ownPages}
        history={history}
        posts={competitorPosts}
        onAddPost={(newPost) => setCompetitorPosts([newPost, ...competitorPosts])}
      />

      {/* QUARTA LINHA: Minhas Páginas + Concorrentes */}
      <div className="space-y-8">
        {/* SEÇÃO: MINHAS PÁGINAS */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">Minhas páginas</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Páginas oficiais do Instagram e Facebook que você gerencia e acompanha.
              </p>
            </div>

            <button
              onClick={openAddOwnPage}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/30 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition"
            >
              <Plus className="size-3.5 text-primary" />
              Adicionar página
            </button>
          </div>

          {ownPages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/80 p-8 text-center bg-secondary/10">
              <p className="text-xs text-muted-foreground">
                Nenhuma página própria cadastrada ainda.
              </p>
              <button
                onClick={openAddOwnPage}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="size-3.5" /> Cadastrar minha primeira página
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ownPages.map((page) => (
                <OwnPageCard
                  key={page.id}
                  page={page}
                  metrics={pagesMetrics.get(page.id) || calculatePageMetrics([], page.followersCount)}
                  recentSnapshots={history.filter((h) => h.pageId === page.id)}
                  onRecordSnapshot={openAddSnapshotForPage}
                  onViewHistory={(p) => setHistoryModalPage(p)}
                  onDelete={handleDeletePage}
                />
              ))}
            </div>
          )}
        </section>

        {/* SEÇÃO: CONCORRENTES (Máximo 10) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-semibold text-foreground">Concorrentes</h2>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-mono font-medium ${
                  competitors.length >= 10
                    ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                    : "bg-secondary text-muted-foreground border border-border"
                }`}
              >
                {competitors.length}/10 páginas
              </span>
            </div>

            <button
              onClick={openAddCompetitor}
              disabled={competitors.length >= 10}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/30 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="size-3.5 text-primary" />
              + Adicionar concorrente
            </button>
          </div>

          {competitors.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/80 p-8 text-center bg-secondary/10">
              <p className="text-xs text-muted-foreground">
                Nenhum concorrente cadastrado ainda. Monitore até 10 perfis concorrentes.
              </p>
              <button
                onClick={openAddCompetitor}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="size-3.5" /> Adicionar primeiro concorrente
              </button>
            </div>
          ) : (
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {competitors.map((page) => (
                <CompetitorCard
                  key={page.id}
                  page={page}
                  metrics={pagesMetrics.get(page.id) || calculatePageMetrics([], page.followersCount)}
                  onRecordSnapshot={openAddSnapshotForPage}
                  onViewHistory={(p) => setHistoryModalPage(p)}
                  onDelete={handleDeletePage}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* QUARTA LINHA: Tabela Comparativa de Dados */}
      <ComparativeTable
        data={comparativeTableData}
        onRecordSnapshot={openAddSnapshotForPage}
        onViewHistory={(p) => setHistoryModalPage(p)}
      />

      <AddPageModal
        open={isAddPageOpen}
        onOpenChange={setIsAddPageOpen}
        isCompetitorDefault={isCompetitorDefault}
        competitorsCount={competitors.length}
        metaConfig={metaConfig}
        onOpenMetaSettings={() => setIsMetaModalOpen(true)}
        onSave={handleSavePage}
      />

      <MetaApiModal
        open={isMetaModalOpen}
        onOpenChange={setIsMetaModalOpen}
        config={metaConfig}
        onSaveConfig={handleSaveMetaConfig}
      />

      <AddSnapshotModal
        open={isAddSnapshotOpen}
        onOpenChange={setIsAddSnapshotOpen}
        pages={pages}
        history={history}
        defaultPageId={snapshotDefaultPageId}
        onSave={handleSaveSnapshot}
      />

      <ImportExportModal
        open={isImportExportOpen}
        onOpenChange={setIsImportExportOpen}
        pages={pages}
        history={history}
        onImportComplete={(newPages, newHistory) => {
          setPages(newPages);
          setHistory(newHistory);
        }}
      />

      <PageHistoryModal
        open={Boolean(historyModalPage)}
        onOpenChange={(open) => {
          if (!open) setHistoryModalPage(null);
        }}
        page={historyModalPage}
        history={history}
        onDeleteSnapshot={handleDeleteSnapshot}
      />

      {/* Modal de Confirmação para Limpar Todas as Informações da Dashboard */}
      <AlertDialog open={isClearDashboardOpen} onOpenChange={setIsClearDashboardOpen}>
        <AlertDialogContent className="border-destructive/30 sm:max-w-[480px]">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-destructive/15 p-2.5 text-destructive border border-destructive/20 shrink-0">
                <AlertTriangle className="size-5" />
              </div>
              <div>
                <AlertDialogTitle className="text-lg">Limpar todas as informações?</AlertDialogTitle>
                <AlertDialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Esta ação apagará todas as páginas, histórico e caches da dashboard.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          <div className="rounded-lg border border-border/80 bg-secondary/30 p-3.5 text-xs text-muted-foreground space-y-2">
            <p className="font-semibold text-foreground">O que será apagado e resetado:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Todas as páginas próprias e concorrentes cadastradas</li>
              <li>Histórico diário completo de seguidores (1 a 90 dias)</li>
              <li>Cache e token da sincronização com a Meta API</li>
            </ul>
            <p className="text-[11px] text-destructive pt-1 font-medium">
              ⚠️ Os dados não poderão ser recuperados após a confirmação.
            </p>
          </div>

          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="text-xs">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearAllData}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs font-semibold gap-1.5"
            >
              <Trash2 className="size-3.5" />
              Sim, Limpar Tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
