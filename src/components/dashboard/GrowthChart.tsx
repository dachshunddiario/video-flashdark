import { useState, useMemo, useEffect, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Users,
  Calendar,
  Check,
  Plus,
  Activity,
  Layers,
  Sparkles,
  Settings2,
  ArrowUpDown,
  History,
  Clock,
  Play,
  Database,
  Table as TableIcon,
  Calculator,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Filter,
  FileSpreadsheet,
  ArrowRight,
  ExternalLink,
  Cloud,
  Copy,
} from "lucide-react";
import {
  formatFollowers,
  formatGrowth,
  formatPercent,
  formatDateBR,
  calculatePageMetrics,
  getGrowthForPeriod,
} from "@/lib/metrics";
import {
  type FollowerSnapshot,
  type SocialPage,
  type TimeRangePeriod,
  type HistoricoSeguidoresRecord,
  type GrowthCalculationResult,
  type MetaApiConfig,
  type ProfileType,
} from "@/lib/types";
import {
  fetchHistoricoSeguidores,
  saveHistoricoRecord,
  saveHistoricoBatch,
  runDailyCronNow,
  fetchCronStatus,
  fetchSupabaseStatus,
  saveSupabaseConfigApi,
  triggerSupabaseSync,
} from "@/lib/social-api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface GrowthChartProps {
  pages: SocialPage[];
  history: FollowerSnapshot[];
  metaConfig?: MetaApiConfig | null;
  onRecordSnapshot?: (pageId?: string) => void;
  onUpdatePage?: (page: SocialPage) => void;
  onRefreshData?: () => void;
}

const LINE_COLORS = [
  "#a855f7", // Vivid Purple
  "#3b82f6", // Vivid Blue
  "#10b981", // Emerald Green
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#f97316", // Orange
  "#84cc16", // Lime
  "#6366f1", // Indigo
  "#14b8a6", // Teal
  "#ef4444", // Coral Red
  "#d946ef", // Fuchsia
];

const PERIOD_OPTIONS: { id: TimeRangePeriod; label: string; shortLabel: string; days: number }[] = [
  { id: "1d", label: "1D (Diário)", shortLabel: "24h", days: 1 },
  { id: "7d", label: "7D (Semanal)", shortLabel: "7D", days: 7 },
  { id: "15d", label: "15D", shortLabel: "15D", days: 15 },
  { id: "30d", label: "30D (Mensal)", shortLabel: "30D", days: 30 },
  { id: "90d", label: "90D (Trimestral)", shortLabel: "90D", days: 90 },
  { id: "365d", label: "1A (Anual)", shortLabel: "1 Ano", days: 365 },
  { id: "all", label: "Desde a Criação (Completo)", shortLabel: "Tudo", days: 9999 },
];

function getPastDateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/**
 * Calcula os seguidores interpolados em uma data específica para gerar uma curva
 * de crescimento contínua e realista entre os marcos conhecidos.
 */
function getInterpolatedFollowers(
  page: SocialPage,
  history: FollowerSnapshot[],
  targetDateStr: string,
): number {
  const pageSnaps = history.filter((h) => h.pageId === page.id);
  const sorted = [...pageSnaps].sort((a, b) => a.date.localeCompare(b.date));

  // Conjunto de âncoras cronológicas conhecidas (data -> seguidores)
  const anchors: Array<{ date: string; followers: number }> = [];

  // Se a página possuir data de criação e marco inicial de seguidores
  const creationDateStr = page.createdAt ? page.createdAt.slice(0, 10) : "";
  const initialCount = page.initialFollowersCount;

  if (creationDateStr && initialCount !== undefined) {
    anchors.push({ date: creationDateStr, followers: initialCount });
  }

  // Adiciona todas as medições do histórico
  for (const s of sorted) {
    if (!anchors.some((a) => a.date === s.date)) {
      anchors.push({ date: s.date, followers: s.followers });
    }
  }

  // Se não houver âncoras registradas, usa os seguidores atuais
  if (anchors.length === 0) {
    return page.followersCount ?? 0;
  }

  // Ordena as âncoras em ordem cronológica estrita
  anchors.sort((a, b) => a.date.localeCompare(b.date));

  // 1. Data exata coincidente com um marco
  const exact = anchors.find((a) => a.date === targetDateStr);
  if (exact) return exact.followers;

  // 2. Data anterior ao primeiro marco conhecido
  if (targetDateStr <= anchors[0]!.date) {
    return anchors[0]!.followers;
  }

  // 3. Data posterior ao último marco conhecido
  if (targetDateStr >= anchors[anchors.length - 1]!.date) {
    return anchors[anchors.length - 1]!.followers;
  }

  // 4. Interpolação linear progressiva entre o marco anterior (a1) e posterior (a2)
  for (let i = 0; i < anchors.length - 1; i++) {
    const a1 = anchors[i]!;
    const a2 = anchors[i + 1]!;
    if (targetDateStr >= a1.date && targetDateStr <= a2.date) {
      const t1 = new Date(a1.date + "T12:00:00").getTime();
      const t2 = new Date(a2.date + "T12:00:00").getTime();
      const tc = new Date(targetDateStr + "T12:00:00").getTime();

      if (t2 > t1) {
        const ratio = (tc - t1) / (t2 - t1);
        const val = Math.round(a1.followers + ratio * (a2.followers - a1.followers));
        return Math.max(0, val);
      }
      return a1.followers;
    }
  }

  return anchors[anchors.length - 1]!.followers;
}

export function GrowthChart({
  pages,
  history,
  metaConfig,
  onRecordSnapshot,
  onUpdatePage,
  onRefreshData,
}: GrowthChartProps) {
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Passo 3: Filtros de Data na Interface (Data Inicial e Data Final)
  const [startDate, setStartDate] = useState<string>(() => getPastDateStr(7));
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [selectedPeriod, setSelectedPeriod] = useState<TimeRangePeriod>("7d");

  const [viewMode, setViewMode] = useState<"own" | "comparison">("own");
  const [chartMetric, setChartMetric] = useState<"total" | "net">("total");
  const [sortByGrowth, setSortByGrowth] = useState<boolean>(true);

  // Estados para Passo 1 (Tabela Historico_Seguidores no Banco de Dados)
  const [dbRecords, setDbRecords] = useState<HistoricoSeguidoresRecord[]>([]);
  const [isDbLoading, setIsDbLoading] = useState<boolean>(false);
  const [isTableModalOpen, setIsTableModalOpen] = useState<boolean>(false);
  const [tableSearchFilter, setTableSearchFilter] = useState<string>("");
  const [tableTypeFilter, setTableTypeFilter] = useState<string>("all");

  // Modal para inserir linha manual na tabela Historico_Seguidores
  const [isNewRecordModalOpen, setIsNewRecordModalOpen] = useState<boolean>(false);
  const [newRecordHandle, setNewRecordHandle] = useState<string>("");
  const [newRecordName, setNewRecordName] = useState<string>("");
  const [newRecordDate, setNewRecordDate] = useState<string>(todayStr);
  const [newRecordFollowers, setNewRecordFollowers] = useState<string>("");
  const [newRecordType, setNewRecordType] = useState<ProfileType>("Minha Página");

  // Estados para Passo 2 (Rotina Automatizada / Cron Job Agendado às 23:59)
  const [cronStatus, setCronStatus] = useState<{
    active: boolean;
    schedule: string;
    targetTime: string;
    lastExecution?: string;
    totalRecordsInDb: number;
  }>({
    active: true,
    schedule: "Diariamente às 23:59 (0 23:59 * * *)",
    targetTime: "23:59",
    lastExecution: "Agendado para hoje às 23:59",
    totalRecordsInDb: 0,
  });
  const [isCronRunning, setIsCronRunning] = useState<boolean>(false);
  const [cronFeedback, setCronFeedback] = useState<string | null>(null);

  // Estados para Integração com Supabase
  const [isSupabaseModalOpen, setIsSupabaseModalOpen] = useState<boolean>(false);
  const [supabaseStatus, setSupabaseStatus] = useState<{
    connected: boolean;
    tableFound: boolean;
    count: number;
    message: string;
    config: { url: string; hasKey: boolean; maskedKey?: string } | null;
  } | null>(null);
  const [supabaseUrlInput, setSupabaseUrlInput] = useState<string>("");
  const [supabaseKeyInput, setSupabaseKeyInput] = useState<string>("");
  const [isTestingSupabase, setIsTestingSupabase] = useState<boolean>(false);
  const [isSyncingSupabase, setIsSyncingSupabase] = useState<boolean>(false);
  const [supabaseFeedback, setSupabaseFeedback] = useState<string | null>(null);
  const [isCopiedSql, setIsCopiedSql] = useState<boolean>(false);

  // Modal para configurar ponto de partida / criação da página
  const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false);
  const [milestonePageId, setMilestonePageId] = useState<string>("");
  const [milestoneDate, setMilestoneDate] = useState<string>("");
  const [milestoneFollowers, setMilestoneFollowers] = useState<string>("");

  // Aba ativa na seção Matemática do Crescimento
  const [mathTab, setMathTab] = useState<"all" | "own" | "competitor">("all");

  // Páginas próprias e concorrentes
  const ownPages = useMemo(() => pages.filter((p) => !p.isCompetitor), [pages]);
  const competitorPages = useMemo(() => pages.filter((p) => p.isCompetitor), [pages]);

  // Conjunto de IDs de páginas selecionadas para exibição no gráfico
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(() => {
    return new Set(pages.filter((p) => !p.isCompetitor).map((p) => p.id));
  });

  const knownPageIdsRef = useRef<Set<string>>(new Set(pages.map((p) => p.id)));

  // Atualiza seleção ao receber novas páginas
  useEffect(() => {
    const currentIds = new Set(pages.map((p) => p.id));
    const newPageIds = pages.filter((p) => !knownPageIdsRef.current.has(p.id)).map((p) => p.id);

    if (newPageIds.length > 0) {
      setSelectedPageIds((prev) => {
        const next = new Set(prev);
        newPageIds.forEach((id) => next.add(id));
        return next;
      });
    }

    setSelectedPageIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of next) {
        if (!currentIds.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    if (selectedPageIds.size === 0 && pages.length > 0 && knownPageIdsRef.current.size === 0) {
      setSelectedPageIds(new Set(pages.filter((p) => !p.isCompetitor).map((p) => p.id)));
    }

    knownPageIdsRef.current = currentIds;
  }, [pages, selectedPageIds.size]);

  // Atribuição de cores estáveis para cada página
  const pageColorMap = useMemo(() => {
    const map = new Map<string, string>();
    pages.forEach((p, idx) => {
      map.set(p.id, LINE_COLORS[idx % LINE_COLORS.length]!);
    });
    return map;
  }, [pages]);

  // Sincronização inicial com o banco de dados Historico_Seguidores (Passo 1 e Passo 2)
  const refreshDbRecords = async () => {
    setIsDbLoading(true);
    try {
      const res = await fetchHistoricoSeguidores();
      if (res.success) {
        setDbRecords(res.records);

        // Se o banco estiver vazio mas houver páginas no app, popula o banco inicial
        if (res.totalRecords === 0 && pages.length > 0) {
          const batchToInsert: Array<{
            profile_handle: string;
            profile_name: string;
            date: string;
            followers_count: number;
            type: ProfileType;
            page_id: string;
          }> = [];

          for (const p of pages) {
            const handle = p.handle.startsWith("@") ? p.handle : `@${p.handle}`;
            const type: ProfileType = p.isCompetitor ? "Concorrente" : "Minha Página";

            // Snapshot de hoje
            batchToInsert.push({
              profile_handle: handle,
              profile_name: p.name,
              date: todayStr,
              followers_count: p.followersCount ?? 0,
              type,
              page_id: p.id,
            });

            // Snapshots anteriores
            const pSnaps = history.filter((h) => h.pageId === p.id);
            for (const s of pSnaps) {
              if (s.date !== todayStr) {
                batchToInsert.push({
                  profile_handle: handle,
                  profile_name: p.name,
                  date: s.date,
                  followers_count: s.followers,
                  type,
                  page_id: p.id,
                });
              }
            }
          }

          if (batchToInsert.length > 0) {
            await saveHistoricoBatch(batchToInsert);
            const refetched = await fetchHistoricoSeguidores();
            if (refetched.success) {
              setDbRecords(refetched.records);
            }
          }
        }
      }

      // Atualiza status do Cron
      const statusRes = await fetchCronStatus();
      if (statusRes.success) {
        setCronStatus(statusRes.status);
      }

      // Atualiza status do Supabase
      try {
        const sbRes = await fetchSupabaseStatus();
        if (sbRes.success) {
          setSupabaseStatus(sbRes);
          if (sbRes.config?.url) {
            setSupabaseUrlInput((prev) => prev || sbRes.config?.url || "");
          }
        }
      } catch {
        // segue
      }
    } catch (err) {
      console.warn("Erro ao buscar tabela Historico_Seguidores:", err);
    } finally {
      setIsDbLoading(false);
    }
  };

  useEffect(() => {
    refreshDbRecords();
  }, [pages.length, history.length]);

  // Alterna visibilidade da página
  const togglePage = (pageId: string) => {
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedPageIds(new Set(pages.map((p) => p.id)));
    setViewMode("comparison");
  };

  const handleDeselectAll = () => {
    setSelectedPageIds(new Set());
  };

  const handleSelectOnlyOwn = () => {
    setSelectedPageIds(new Set(ownPages.map((p) => p.id)));
    setViewMode("own");
  };

  const handleSelectOnlyCompetitors = () => {
    setSelectedPageIds(new Set(competitorPages.map((p) => p.id)));
    setViewMode("comparison");
  };

  // Atualiza as datas quando o usuário clica em um atalho de período
  const handleSelectPeriodPreset = (period: TimeRangePeriod) => {
    setSelectedPeriod(period);
    const end = todayStr;
    setEndDate(end);

    if (period === "1d") {
      setStartDate(getPastDateStr(1));
    } else if (period === "7d") {
      setStartDate(getPastDateStr(7));
    } else if (period === "15d") {
      setStartDate(getPastDateStr(15));
    } else if (period === "30d") {
      setStartDate(getPastDateStr(30));
    } else if (period === "90d") {
      setStartDate(getPastDateStr(90));
    } else if (period === "365d") {
      setStartDate(getPastDateStr(365));
    } else if (period === "all") {
      // Data mais antiga conhecida
      let earliest = todayStr;
      for (const p of pages) {
        if (p.createdAt && p.createdAt.slice(0, 10) < earliest) {
          earliest = p.createdAt.slice(0, 10);
        }
      }
      for (const h of history) {
        if (h.date < earliest) earliest = h.date;
      }
      for (const r of dbRecords) {
        if (r.date < earliest) earliest = r.date;
      }
      setStartDate(earliest);
    }
  };

  // Alteração manual do campo Data Inicial (Passo 3)
  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    if (val > endDate) {
      setEndDate(val);
    }
  };

  // Alteração manual do campo Data Final (Passo 3)
  const handleEndDateChange = (val: string) => {
    setEndDate(val);
    if (val < startDate) {
      setStartDate(val);
    }
  };

  // Páginas ativas para o gráfico
  const activePages = useMemo(() => {
    return pages.filter((p) => selectedPageIds.has(p.id));
  }, [pages, selectedPageIds]);

  // =========================================================================
  // PASSO 4: A MATEMÁTICA DO CRESCIMENTO (A LÓGICA EXATA)
  // Para cada página:
  // 1. Buscar Total Inicial: seguidores na Data Inicial
  // 2. Buscar Total Final: seguidores na Data Final
  // 3. Cálculo de Crescimento: Total Final - Total Inicial
  // =========================================================================
  const growthCalculations = useMemo(() => {
    return pages.map((page) => {
      const handle = page.handle.startsWith("@") ? page.handle.toLowerCase() : `@${page.handle.toLowerCase()}`;
      const type: ProfileType = page.isCompetitor ? "Concorrente" : "Minha Página";

      // 1. Busca registros no banco Historico_Seguidores
      const matchingDbRecords = dbRecords
        .filter((r) => r.profile_handle.toLowerCase() === handle)
        .sort((a, b) => a.date.localeCompare(b.date));

      // Medições do histórico local para complementar
      const pageSnaps = history
        .filter((h) => h.pageId === page.id)
        .sort((a, b) => a.date.localeCompare(b.date));

      // Combina todas as âncoras cronológicas conhecidas
      const allAnchors: Array<{ date: string; followers: number }> = [];

      if (page.createdAt && page.initialFollowersCount !== undefined) {
        allAnchors.push({ date: page.createdAt.slice(0, 10), followers: page.initialFollowersCount });
      }

      for (const r of matchingDbRecords) {
        if (!allAnchors.some((a) => a.date === r.date)) {
          allAnchors.push({ date: r.date, followers: r.followers_count });
        }
      }

      for (const s of pageSnaps) {
        if (!allAnchors.some((a) => a.date === s.date)) {
          allAnchors.push({ date: s.date, followers: s.followers });
        }
      }

      // Adiciona o valor atual de seguidores para a data de hoje se ainda não estiver
      if (page.followersCount !== undefined && !allAnchors.some((a) => a.date === todayStr)) {
        allAnchors.push({ date: todayStr, followers: page.followersCount });
      }

      allAnchors.sort((a, b) => a.date.localeCompare(b.date));

      // 1. Total Inicial (na Data Inicial)
      let initialFollowers = page.followersCount ?? 0;
      if (allAnchors.length > 0) {
        const exactInitial = allAnchors.find((a) => a.date === startDate);
        if (exactInitial) {
          initialFollowers = exactInitial.followers;
        } else {
          // Registro mais próximo menor ou igual à data inicial
          const prior = allAnchors.filter((a) => a.date <= startDate).pop();
          if (prior) {
            initialFollowers = prior.followers;
          } else {
            // Se a data inicial for anterior a qualquer medição, usa a primeira conhecida
            initialFollowers = allAnchors[0]!.followers;
          }
        }
      }

      // 2. Total Final (na Data Final)
      let finalFollowers = page.followersCount ?? initialFollowers;
      if (allAnchors.length > 0) {
        const exactFinal = allAnchors.find((a) => a.date === endDate);
        if (exactFinal) {
          finalFollowers = exactFinal.followers;
        } else {
          // Registro mais próximo menor ou igual à data final
          const priorFinal = allAnchors.filter((a) => a.date <= endDate).pop();
          if (priorFinal) {
            finalFollowers = priorFinal.followers;
          } else {
            finalFollowers = allAnchors[allAnchors.length - 1]!.followers;
          }
        }
      }

      // 3. Cálculo de Crescimento: Total Final - Total Inicial
      const growth = finalFollowers - initialFollowers;
      const percent = initialFollowers > 0 ? (growth / initialFollowers) * 100 : 0;

      // Dias no período
      const tStart = new Date(`${startDate}T12:00:00`).getTime();
      const tEnd = new Date(`${endDate}T12:00:00`).getTime();
      const days = Math.max(1, Math.round(Math.abs(tEnd - tStart) / (24 * 60 * 60 * 1000)));
      const avgPerDay = Math.round((growth / days) * 10) / 10;

      return {
        page,
        profile_handle: handle,
        profile_name: page.name,
        type,
        startDate,
        endDate,
        initialFollowers,
        finalFollowers,
        growth,
        percent,
        days,
        avgPerDay,
      };
    });
  }, [pages, dbRecords, history, startDate, endDate, todayStr]);

  // Lista de cálculos filtrada pela aba de matemática
  const filteredGrowthCalculations = useMemo(() => {
    let list = growthCalculations;
    if (mathTab === "own") {
      list = list.filter((item) => item.type === "Minha Página");
    } else if (mathTab === "competitor") {
      list = list.filter((item) => item.type === "Concorrente");
    }

    if (sortByGrowth) {
      return [...list].sort((a, b) => b.growth - a.growth);
    }
    return list;
  }, [growthCalculations, mathTab, sortByGrowth]);

  // Totais agregados do período selecionado
  const aggregatePeriodMath = useMemo(() => {
    const ownCalcs = growthCalculations.filter((c) => c.type === "Minha Página");
    let totalInitial = 0;
    let totalFinal = 0;
    let totalGrowth = 0;

    for (const c of ownCalcs) {
      totalInitial += c.initialFollowers;
      totalFinal += c.finalFollowers;
      totalGrowth += c.growth;
    }

    const totalPercent = totalInitial > 0 ? (totalGrowth / totalInitial) * 100 : 0;
    const tStart = new Date(`${startDate}T12:00:00`).getTime();
    const tEnd = new Date(`${endDate}T12:00:00`).getTime();
    const days = Math.max(1, Math.round(Math.abs(tEnd - tStart) / (24 * 60 * 60 * 1000)));
    const avgDay = Math.round((totalGrowth / days) * 10) / 10;

    return {
      totalInitial,
      totalFinal,
      totalGrowth,
      totalPercent,
      days,
      avgDay,
      ownCount: ownCalcs.length,
    };
  }, [growthCalculations, startDate, endDate]);

  // Métricas calculadas para cada página
  const activePagesMetrics = useMemo(() => {
    return activePages.map((page) => {
      const pageSnaps = history.filter((h) => h.pageId === page.id);
      return {
        page,
        metrics: calculatePageMetrics(pageSnaps, page.followersCount, page.initialFollowersCount),
      };
    });
  }, [activePages, history]);

  // Ordenação das páginas em ordem de crescimento (maior ganho primeiro)
  const orderedPages = useMemo(() => {
    if (!sortByGrowth) return activePages;

    return [...activePages].sort((a, b) => {
      const calcA = growthCalculations.find((item) => item.page.id === a.id);
      const calcB = growthCalculations.find((item) => item.page.id === b.id);
      const gA = calcA ? calcA.growth : 0;
      const gB = calcB ? calcB.growth : 0;
      return gB - gA;
    });
  }, [activePages, growthCalculations, sortByGrowth]);

  // Dataset temporal contínuo e interpolado limitado a [startDate, endDate]
  const chartData = useMemo(() => {
    if (activePages.length === 0) return [];

    const [ey, em, ed] = endDate.split("-").map(Number);
    const [sy, sm, sd] = startDate.split("-").map(Number);
    const startDateTime = new Date(sy!, sm! - 1, sd!, 12, 0, 0).getTime();
    const endDateTime = new Date(ey!, em! - 1, ed!, 12, 0, 0).getTime();
    const diffDays = Math.max(1, Math.round((endDateTime - startDateTime) / (24 * 60 * 60 * 1000)));

    const dateSet = new Set<string>();
    dateSet.add(startDate);
    dateSet.add(endDate);

    const step =
      diffDays <= 3 ? 1 : diffDays <= 7 ? 1 : diffDays <= 15 ? 2 : diffDays <= 30 ? 3 : diffDays <= 90 ? 7 : diffDays <= 365 ? 14 : 30;

    for (let offset = diffDays; offset >= 0; offset -= step) {
      const pointDate = new Date(endDateTime - offset * 24 * 60 * 60 * 1000);
      const str = pointDate.toISOString().slice(0, 10);
      if (str >= startDate && str <= endDate) {
        dateSet.add(str);
      }
    }

    // Inclui medições do histórico que estejam dentro do período
    const activePageIds = new Set(activePages.map((p) => p.id));
    for (const h of history) {
      if (activePageIds.has(h.pageId) && h.date >= startDate && h.date <= endDate) {
        dateSet.add(h.date);
      }
    }

    // Inclui registros do banco que estejam dentro do período
    for (const r of dbRecords) {
      if (r.date >= startDate && r.date <= endDate) {
        dateSet.add(r.date);
      }
    }

    const sortedDates = Array.from(dateSet).sort();

    // Calcula os valores interpolados para cada data
    const rawPoints = sortedDates.map((dateStr) => {
      const point: Record<string, string | number> = {
        date: dateStr,
        formattedDate: formatDateBR(dateStr),
      };

      for (const page of activePages) {
        // Tenta achar snapshot exato no banco primeiro
        const handle = page.handle.startsWith("@") ? page.handle.toLowerCase() : `@${page.handle.toLowerCase()}`;
        const dbExact = dbRecords.find(
          (r) => r.profile_handle.toLowerCase() === handle && r.date === dateStr,
        );

        if (dbExact) {
          point[page.id] = dbExact.followers_count;
        } else {
          point[page.id] = getInterpolatedFollowers(page, history, dateStr);
        }
      }

      return point;
    });

    // Se for modo "Ganho Líquido", subtrai o patamar inicial do primeiro ponto
    if (chartMetric === "net" && rawPoints.length > 0) {
      const firstPoint = rawPoints[0]!;
      return rawPoints.map((pt) => {
        const netPt: Record<string, string | number> = {
          date: pt["date"] as string,
          formattedDate: pt["formattedDate"] as string,
        };
        for (const page of activePages) {
          const base = Number(firstPoint[page.id] ?? 0);
          const current = Number(pt[page.id] ?? 0);
          netPt[page.id] = current - base;
        }
        return netPt;
      });
    }

    return rawPoints;
  }, [activePages, history, dbRecords, startDate, endDate, chartMetric]);

  // Formata o eixo Y
  const formatYAxis = (val: number) => {
    if (chartMetric === "net") {
      const sign = val > 0 ? "+" : "";
      if (Math.abs(val) >= 1_000_000) return `${sign}${(val / 1_000_000).toFixed(1)}M`;
      if (Math.abs(val) >= 1_000) return `${sign}${(val / 1_000).toFixed(0)}k`;
      return `${sign}${val}`;
    }
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `${(val / 1_000).toFixed(0)}k`;
    return String(val);
  };

  // =========================================================================
  // PASSO 2: DISPARO DA ROTINA AUTOMATIZADA (CRON JOB) SOB DEMANDA
  // =========================================================================
  const handleTriggerCronNow = async () => {
    setIsCronRunning(true);
    setCronFeedback(null);
    try {
      const result = await runDailyCronNow({
        accessToken: metaConfig?.accessToken,
        pages: pages.map((p) => ({
          id: p.id,
          handle: p.handle,
          name: p.name,
          platform: p.platform,
          isCompetitor: p.isCompetitor,
          followersCount: p.followersCount ?? 0,
        })),
      });

      if (result.success) {
        setCronFeedback(
          `🎉 Rotina das 23:59 executada com sucesso! ${result.cronResult.snapshotsSaved} fotos diárias salvas na tabela Historico_Seguidores.`,
        );
        await refreshDbRecords();
        if (onRefreshData) onRefreshData();
      }
    } catch (err: any) {
      setCronFeedback(`⚠️ Erro ao disparar rotina agendada: ${err.message}`);
    } finally {
      setIsCronRunning(false);
      setTimeout(() => setCronFeedback(null), 10000);
    }
  };

  // Abre modal para configurar o marco inicial de criação da página
  const handleOpenMilestoneModal = (pageId?: string) => {
    const target = pages.find((p) => p.id === (pageId || activePages[0]?.id || pages[0]?.id));
    if (!target) return;
    setMilestonePageId(target.id);
    setMilestoneDate(target.createdAt ? target.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setMilestoneFollowers(target.initialFollowersCount !== undefined ? String(target.initialFollowersCount) : "10");
    setIsMilestoneModalOpen(true);
  };

  // Salva o marco inicial da página
  const handleSaveMilestone = (e: React.FormEvent) => {
    e.preventDefault();
    const count = parseInt(milestoneFollowers.replace(/\D/g, ""), 10);
    if (isNaN(count) || !milestonePageId) return;

    const target = pages.find((p) => p.id === milestonePageId);
    if (target && onUpdatePage) {
      onUpdatePage({
        ...target,
        createdAt: milestoneDate,
        initialFollowersCount: count,
      });
    }

    if (onRecordSnapshot) {
      onRecordSnapshot(milestonePageId);
    }

    setIsMilestoneModalOpen(false);
  };

  // Salva uma linha manual na tabela Historico_Seguidores (Passo 1)
  const handleSaveManualRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    const followers = parseInt(newRecordFollowers.replace(/\D/g, ""), 10);
    if (!newRecordHandle || isNaN(followers)) return;

    try {
      await saveHistoricoRecord({
        profile_handle: newRecordHandle,
        profile_name: newRecordName || newRecordHandle,
        date: newRecordDate,
        followers_count: followers,
        type: newRecordType,
      });
      await refreshDbRecords();
      setIsNewRecordModalOpen(false);
      setNewRecordFollowers("");
      setNewRecordHandle("");
    } catch (err: any) {
      alert(`Erro ao salvar na tabela: ${err.message}`);
    }
  };

  // Salva credenciais do Supabase e testa a conexão
  const handleTestAndSaveSupabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseUrlInput.trim() || !supabaseKeyInput.trim()) return;
    setIsTestingSupabase(true);
    setSupabaseFeedback(null);
    try {
      const res = await saveSupabaseConfigApi({
        url: supabaseUrlInput.trim(),
        anonKey: supabaseKeyInput.trim(),
      });
      setSupabaseFeedback(res.message);
      const statusRes = await fetchSupabaseStatus();
      setSupabaseStatus(statusRes);
      if (res.connected && res.tableFound) {
        await refreshDbRecords();
      }
    } catch (err: any) {
      setSupabaseFeedback(`⚠️ Erro: ${err.message}`);
    } finally {
      setIsTestingSupabase(false);
    }
  };

  // Dispara sincronização em lote para o Supabase
  const handleManualSupabaseSync = async () => {
    setIsSyncingSupabase(true);
    setSupabaseFeedback(null);
    try {
      const res = await triggerSupabaseSync();
      setSupabaseFeedback(`✅ ${res.message}`);
      await refreshDbRecords();
    } catch (err: any) {
      setSupabaseFeedback(`⚠️ Erro ao sincronizar: ${err.message}`);
    } finally {
      setIsSyncingSupabase(false);
    }
  };

  // Copia o script SQL para a área de transferência
  const handleCopySql = () => {
    const sql = `-- 1. Tabela Historico_Seguidores no Supabase
CREATE TABLE IF NOT EXISTS public.historico_seguidores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_handle TEXT NOT NULL,
    profile_name TEXT,
    date DATE NOT NULL,
    followers_count BIGINT NOT NULL DEFAULT 0,
    type TEXT NOT NULL DEFAULT 'Minha Página' CHECK (type IN ('Minha Página', 'Concorrente')),
    page_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_profile_date UNIQUE (profile_handle, date)
);

CREATE INDEX IF NOT EXISTS idx_historico_handle_date ON public.historico_seguidores (profile_handle, date);

ALTER TABLE public.historico_seguidores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso Total Historico" ON public.historico_seguidores;
CREATE POLICY "Acesso Total Historico" ON public.historico_seguidores FOR ALL TO public USING (true) WITH CHECK (true);`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(sql);
      setIsCopiedSql(true);
      setTimeout(() => setIsCopiedSql(false), 3000);
    }
  };

  // Registros filtrados para a visualização da tabela Historico_Seguidores (Passo 1)
  const filteredDbRecords = useMemo(() => {
    return dbRecords.filter((r) => {
      const matchSearch =
        !tableSearchFilter ||
        r.profile_handle.toLowerCase().includes(tableSearchFilter.toLowerCase()) ||
        r.profile_name.toLowerCase().includes(tableSearchFilter.toLowerCase());
      const matchType =
        tableTypeFilter === "all" || r.type === tableTypeFilter;
      return matchSearch && matchType;
    });
  }, [dbRecords, tableSearchFilter, tableTypeFilter]);

  return (
    <div className="panel p-6 space-y-6">
      {/* 1. CABEÇALHO COM TÍTULO, SUBTÍTULO E AÇÕES GLOBAIS */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-border/50 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="size-5 text-primary" />
            <h3 className="font-bold text-base text-foreground tracking-tight">
              Evolução e Velocidade de Crescimento dos Seguidores
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Curva contínua de crescimento, filtros por data e cálculo da matemática de ganho no período selecionado.
          </p>
        </div>

        {/* Ações do Topo */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Botão Supabase Cloud Sync */}
          <button
            type="button"
            onClick={() => setIsSupabaseModalOpen(true)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition shadow-xs cursor-pointer ${
              supabaseStatus?.connected && supabaseStatus.tableFound
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                : "border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"
            }`}
            title="Conectar e sincronizar com o banco de dados Supabase"
          >
            <Cloud className="size-3.5" />
            {supabaseStatus?.connected && supabaseStatus.tableFound ? "Supabase Conectado" : "Conectar Supabase"}
            <span
              className={`size-2 rounded-full inline-block ${
                supabaseStatus?.connected && supabaseStatus.tableFound
                  ? "bg-emerald-400 animate-pulse"
                  : "bg-muted-foreground/40"
              }`}
            />
          </button>

          {/* Botão Passo 1: Abrir Modal da Tabela Historico_Seguidores */}
          <button
            type="button"
            onClick={() => setIsTableModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-500/10 px-3 py-1.5 text-xs font-semibold text-purple-300 hover:bg-purple-500/20 transition shadow-xs cursor-pointer"
            title="Visualizar a tabela Historico_Seguidores salva no banco de dados"
          >
            <Database className="size-3.5 text-purple-400" />
            Tabela Historico_Seguidores
            <span className="rounded-full bg-purple-500/30 px-1.5 py-0.2 text-[10px] font-mono text-purple-200">
              {dbRecords.length}
            </span>
          </button>

          {/* Botão Passo 2: Disparar Rotina Agendada das 23:59 sob demanda */}
          <button
            type="button"
            onClick={handleTriggerCronNow}
            disabled={isCronRunning}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition shadow-xs cursor-pointer disabled:opacity-50"
            title="Executar agora o Workflow Agendado diário das 23:59"
          >
            {isCronRunning ? (
              <RefreshCw className="size-3.5 animate-spin text-emerald-400" />
            ) : (
              <Clock className="size-3.5 text-emerald-400" />
            )}
            {isCronRunning ? "Fotografando..." : "Disparar Rotina (23:59)"}
          </button>

          {/* Botão Registrar Nova Medição Manual */}
          {onRecordSnapshot && (
            <button
              type="button"
              onClick={() => onRecordSnapshot(activePages[0]?.id)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition shadow-xs cursor-pointer"
              title="Registrar medição histórica de seguidores"
            >
              <Plus className="size-3.5 stroke-[2.5]" />
              Medição
            </button>
          )}

          {/* Botão Definir Marco de Criação */}
          <button
            type="button"
            onClick={() => handleOpenMilestoneModal()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-secondary/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition cursor-pointer"
            title="Configurar a data de criação e seguidores iniciais da página"
          >
            <Settings2 className="size-3.5 text-muted-foreground" />
            Marco
          </button>

          {/* Alternador de Modo: Seguidores Totais vs Ganho Líquido */}
          <div className="flex rounded-lg border border-border bg-secondary/40 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setChartMetric("total")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                chartMetric === "total"
                  ? "bg-secondary text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Seguidores Totais
            </button>
            <button
              type="button"
              onClick={() => setChartMetric("net")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                chartMetric === "net"
                  ? "bg-secondary text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Ganho Líquido (+)
            </button>
          </div>
        </div>
      </div>

      {/* FEEDBACK DO PASSO 2: EXECUÇÃO DO CRON */}
      {cronFeedback && (
        <div className="rounded-xl border border-emerald-500/50 bg-emerald-950/60 p-3.5 text-xs text-emerald-200 flex items-center justify-between shadow-lg transition animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
            <span className="font-medium">{cronFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setCronFeedback(null)}
            className="text-[11px] text-emerald-400 hover:underline font-semibold"
          >
            Fechar
          </button>
        </div>
      )}

      {/* 2. PASSO 2: STATUS DO WORKFLOW AGENDADO (CRON JOB DIÁRIO DAS 23:59) */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="relative p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shrink-0">
              <Clock className="size-4" />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-foreground">
                  Workflow Agendado (Passo 2): Cron Diário às 23:59
                </h4>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/30">
                  <Check className="size-2.5 stroke-[3]" /> Ativo no Anti Gravity
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Puxa todas as páginas monitoradas diariamente, consulta a API da Meta e cria uma nova linha na tabela <strong className="text-foreground">Historico_Seguidores</strong> com o <code className="text-[10px] bg-secondary/80 px-1 py-0.5 rounded text-emerald-300">followers_count</code>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
            <div className="text-right hidden md:block">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                Último Registro
              </span>
              <span className="font-mono text-xs font-semibold text-foreground">
                {cronStatus.lastExecution || "Hoje às 23:59"}
              </span>
            </div>
            <button
              type="button"
              onClick={handleTriggerCronNow}
              disabled={isCronRunning}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-emerald-950 hover:bg-emerald-400 transition shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Play className="size-3 fill-current" />
              Disparar Agora (Teste)
            </button>
          </div>
        </div>
      </div>

      {/* 3. PASSO 3: FILTROS DE DATA NA INTERFACE (DATA INICIAL E DATA FINAL) */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-primary" />
            <div>
              <h4 className="text-xs font-bold text-foreground">
                Filtros de Data na Interface (Passo 3)
              </h4>
              <p className="text-[11px] text-muted-foreground">
                Selecione o período exato para o Anti Gravity buscar no banco e calcular o crescimento:
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span>Período:</span>
            <span className="font-mono font-bold text-primary">
              {formatDateBR(startDate)}
            </span>
            <span>até</span>
            <span className="font-mono font-bold text-primary">
              {formatDateBR(endDate)}
            </span>
            <span className="rounded-md bg-secondary/80 px-2 py-0.5 text-[10px] font-semibold text-foreground">
              {aggregatePeriodMath.days} dia{aggregatePeriodMath.days === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {/* Campos Interativos Data Inicial & Data Final */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-center">
          {/* Campo Data Inicial */}
          <div className="space-y-1">
            <Label htmlFor="date-start" className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
              <Calendar className="size-3 text-primary" />
              Data Inicial
            </Label>
            <Input
              id="date-start"
              type="date"
              value={startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              className="bg-background/90 text-xs font-mono font-semibold"
            />
          </div>

          {/* Campo Data Final */}
          <div className="space-y-1">
            <Label htmlFor="date-end" className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
              <Calendar className="size-3 text-primary" />
              Data Final
            </Label>
            <Input
              id="date-end"
              type="date"
              value={endDate}
              onChange={(e) => handleEndDateChange(e.target.value)}
              className="bg-background/90 text-xs font-mono font-semibold"
            />
          </div>

          {/* Atalhos de Período Rápidos */}
          <div className="sm:col-span-2 space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground block">
              Atalhos Rápidos:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelectPeriodPreset(opt.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                    selectedPeriod === opt.id
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground border border-border/40"
                  }`}
                >
                  {opt.shortLabel}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 4. PASSO 4: A MATEMÁTICA DO CRESCIMENTO (A LÓGICA) */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-2">
          <div className="flex items-center gap-2">
            <Calculator className="size-4 text-primary" />
            <div>
              <h4 className="text-xs font-bold text-foreground">
                Matemática do Crescimento (A Lógica · Passo 4)
              </h4>
              <p className="text-[11px] text-muted-foreground">
                Conta aplicada: <strong>Total Final - Total Inicial = Novos Seguidores Ganhos no Período</strong>
              </p>
            </div>
          </div>

          {/* Abas: Todas, Minhas Páginas, Concorrentes */}
          <div className="flex rounded-lg border border-border bg-secondary/30 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMathTab("all")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                mathTab === "all" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Todas ({pages.length})
            </button>
            <button
              type="button"
              onClick={() => setMathTab("own")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                mathTab === "own" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Minhas ({ownPages.length})
            </button>
            <button
              type="button"
              onClick={() => setMathTab("competitor")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                mathTab === "competitor" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Concorrentes ({competitorPages.length})
            </button>
          </div>
        </div>

        {/* Exemplo Prático de Destaque da Lógica */}
        <div className="rounded-lg border border-border/70 bg-secondary/15 px-3.5 py-2 text-[11px] text-muted-foreground flex items-center justify-between flex-wrap gap-2">
          <span>
            💡 <strong className="text-foreground">Exemplo prático da lógica:</strong> No período de {formatDateBR(startDate)} a {formatDateBR(endDate)}, o app busca o total na data inicial, o total na data final e subtrai: <code className="bg-secondary px-1.5 py-0.5 rounded text-primary font-bold">Total Final - Total Inicial</code>.
          </span>
          <span className="font-mono text-xs font-bold text-foreground">
            {aggregatePeriodMath.ownCount > 0 && (
              <>Minhas Páginas: {formatFollowers(aggregatePeriodMath.totalFinal)} - {formatFollowers(aggregatePeriodMath.totalInitial)} = <span className="text-emerald-400">+{formatFollowers(aggregatePeriodMath.totalGrowth)} ({formatPercent(aggregatePeriodMath.totalPercent)})</span></>
            )}
          </span>
        </div>

        {/* Cards de Cada Página com a Matemática Explícita */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredGrowthCalculations.map((calc) => {
            const isOwn = calc.type === "Minha Página";
            const color = pageColorMap.get(calc.page.id) || "#a855f7";

            return (
              <div
                key={calc.page.id}
                className="rounded-xl border border-border/70 bg-secondary/20 p-3.5 space-y-2.5 transition hover:border-border hover:bg-secondary/35"
              >
                {/* Cabeçalho do Perfil */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full inline-block"
                      style={{ backgroundColor: color }}
                    />
                    <div>
                      <h5 className="text-xs font-bold text-foreground leading-none">
                        {calc.profile_name}
                      </h5>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {calc.profile_handle}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-semibold border ${
                      isOwn
                        ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                        : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                    }`}
                  >
                    {calc.type}
                  </span>
                </div>

                {/* As 3 Etapas da Matemática */}
                <div className="rounded-lg bg-background/80 p-2.5 border border-border/40 space-y-1.5 font-mono text-xs">
                  <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                    <span>Total Inicial ({formatDateBR(startDate)}):</span>
                    <strong className="text-foreground">{formatFollowers(calc.initialFollowers)}</strong>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                    <span>Total Final ({formatDateBR(endDate)}):</span>
                    <strong className="text-foreground">{formatFollowers(calc.finalFollowers)}</strong>
                  </div>
                  <div className="border-t border-border/50 pt-1.5 flex items-center justify-between font-bold">
                    <span className="text-[11px] text-muted-foreground">Crescimento:</span>
                    <span className={calc.growth >= 0 ? "text-emerald-400" : "text-rose-400"}>
                      {calc.growth >= 0 ? "+" : ""}
                      {formatFollowers(calc.growth)} ({formatPercent(calc.percent)})
                    </span>
                  </div>
                </div>

                {/* Resumo da Equação em Linha */}
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="font-mono">
                    {formatFollowers(calc.finalFollowers)} - {formatFollowers(calc.initialFollowers)} = {calc.growth >= 0 ? "+" : ""}{formatFollowers(calc.growth)}
                  </span>
                  <span>
                    Ritmo: <strong className="text-foreground">{calc.avgPerDay >= 0 ? "+" : ""}{calc.avgPerDay}</strong> seg/dia
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. BARRA DE SELEÇÃO E COMPARAÇÃO DE PÁGINAS NO GRÁFICO */}
      {pages.length > 0 && (
        <div className="rounded-xl border border-border/70 bg-secondary/15 p-3.5 transition-all">
          <div className="flex flex-wrap items-center justify-between gap-2.5 mb-2.5">
            <div className="flex items-center gap-2">
              <Users className="size-3.5 text-primary" />
              <span className="text-xs font-semibold text-foreground">
                Páginas no Gráfico:
              </span>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                <span className="font-bold text-foreground">{activePages.length}</span> de {pages.length} visíveis
              </span>
              <button
                type="button"
                onClick={() => setSortByGrowth(!sortByGrowth)}
                className="inline-flex items-center gap-1 rounded bg-secondary/50 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground border border-border/40 transition cursor-pointer ml-1"
                title="Alternar ordenação por maior crescimento"
              >
                <ArrowUpDown className="size-2.5" />
                {sortByGrowth ? "Ordem: Maior Crescimento" : "Ordem Padrão"}
              </button>
            </div>

            {/* Ações Rápidas de Seleção */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={handleSelectAll}
                className="rounded-md border border-border/70 bg-background/80 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-secondary hover:border-primary/50 transition cursor-pointer"
              >
                Marcar Todas
              </button>
              <button
                type="button"
                onClick={handleDeselectAll}
                className="rounded-md border border-border/70 bg-background/80 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition cursor-pointer"
              >
                Desmarcar Todas
              </button>
              {competitorPages.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleSelectOnlyOwn}
                    className="rounded-md border border-border/70 bg-background/80 px-2 py-1 text-[11px] font-medium text-purple-400 hover:bg-purple-500/10 hover:border-purple-500/40 transition cursor-pointer"
                  >
                    Apenas Minhas
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectOnlyCompetitors}
                    className="rounded-md border border-border/70 bg-background/80 px-2 py-1 text-[11px] font-medium text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/40 transition cursor-pointer"
                  >
                    Apenas Concorrentes
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Chips interativos de cada página em ordem de crescimento */}
          <div className="flex flex-wrap gap-2 pt-1">
            {orderedPages.map((p, idx) => {
              const isSelected = selectedPageIds.has(p.id);
              const color = pageColorMap.get(p.id) || "#a855f7";
              const followers = p.followersCount ?? 0;
              const calc = growthCalculations.find((item) => item.page.id === p.id);
              const growth = calc ? calc.growth : 0;

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePage(p.id)}
                  title={
                    isSelected
                      ? `Clique para desmarcar ${p.name} e ocultar do gráfico`
                      : `Clique para marcar ${p.name} e exibir no gráfico`
                  }
                  className={`group relative flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? "shadow-xs font-medium"
                      : "border-border/40 bg-secondary/20 text-muted-foreground/60 opacity-60 hover:opacity-100 hover:border-border/80 hover:bg-secondary/40"
                  }`}
                  style={
                    isSelected
                      ? {
                          borderColor: `${color}90`,
                          backgroundColor: `${color}18`,
                          color: "var(--foreground)",
                        }
                      : undefined
                  }
                >
                  {sortByGrowth && isSelected && (
                    <span className="font-mono text-[10px] font-bold text-muted-foreground">
                      #{idx + 1}
                    </span>
                  )}

                  <div
                    className={`size-3.5 rounded-full flex items-center justify-center transition-all ${
                      isSelected
                        ? "shadow-xs ring-2 ring-offset-1 ring-offset-background"
                        : "border border-muted-foreground/50"
                    }`}
                    style={{
                      backgroundColor: isSelected ? color : "transparent",
                    }}
                  >
                    {isSelected ? (
                      <Check className="size-2 text-white stroke-[3.5]" />
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1.5 text-left">
                    <span
                      className={`font-semibold transition ${
                        isSelected ? "text-foreground" : "text-muted-foreground line-through decoration-muted-foreground/50"
                      }`}
                    >
                      {p.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      @{p.handle}
                    </span>
                  </div>

                  {p.isCompetitor ? (
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-amber-400 border border-amber-500/30">
                      Concorrente
                    </span>
                  ) : (
                    <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-purple-400 border border-purple-500/30">
                      Minha
                    </span>
                  )}

                  <span
                    className={`font-mono text-[11px] font-bold ml-0.5 ${
                      growth > 0 ? "text-emerald-400" : growth < 0 ? "text-rose-400" : "text-muted-foreground"
                    }`}
                  >
                    {growth > 0 ? "+" : ""}
                    {formatGrowth(growth)}
                  </span>

                  <span className="font-mono text-[10px] text-muted-foreground/80">
                    ({formatFollowers(followers)})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. ÁREA DO GRÁFICO RECHARTS COM CURVA INTERPOLADA E ORDEM CRESCENTE */}
      {pages.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 py-16 text-center">
          <Calendar className="size-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm font-medium text-foreground">
            Nenhuma página cadastrada
          </p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Conecte sua conta da Meta API ou cadastre páginas manualmente para visualizar a evolução e o comparativo.
          </p>
        </div>
      ) : activePages.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 py-16 text-center">
          <Users className="size-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm font-medium text-foreground">
            Nenhuma página selecionada para exibição
          </p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mb-3">
            Marque uma ou mais páginas nos botões acima para comparar as curvas e taxas de crescimento no gráfico.
          </p>
          <button
            type="button"
            onClick={handleSelectAll}
            className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition shadow-xs cursor-pointer"
          >
            Marcar Todas as Páginas
          </button>
        </div>
      ) : (
        <div className="mt-4 h-88 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 12, right: 16, left: -10, bottom: 4 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} opacity={0.5} />
              <XAxis
                dataKey="date"
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickLine={false}
                tickFormatter={(date) => {
                  const parts = date.split("-");
                  if (parts.length === 3) {
                    if (selectedPeriod === "all" || selectedPeriod === "365d") {
                      return `${parts[2]}/${parts[1]}/${parts[0]?.slice(2)}`;
                    }
                    return `${parts[2]}/${parts[1]}`;
                  }
                  return date;
                }}
              />
              <YAxis
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickLine={false}
                tickFormatter={formatYAxis}
                domain={
                  chartMetric === "net"
                    ? ["auto", "auto"]
                    : [
                        (dataMin: number) => Math.max(0, Math.floor(dataMin * 0.9)),
                        (dataMax: number) => Math.max(10, Math.ceil(dataMax * 1.05)),
                      ]
                }
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;

                  const sortedPayload = [...payload].sort((a, b) => Number(b.value) - Number(a.value));

                  return (
                    <div className="rounded-xl border border-border bg-popover/95 p-3.5 shadow-xl backdrop-blur-md text-xs min-w-[230px]">
                      <p className="font-semibold text-foreground border-b border-border/60 pb-1.5 mb-2 flex items-center justify-between">
                        <span>{formatDateBR(label as string)}</span>
                        <span className="text-[10px] text-muted-foreground font-normal">
                          {chartMetric === "net" ? "Ganho Líquido" : "Seguidores Totais"}
                        </span>
                      </p>
                      <div className="space-y-2">
                        {sortedPayload.map((entry) => {
                          const page = pages.find((p) => p.id === entry.dataKey);
                          if (!page) return null;
                          const color = pageColorMap.get(page.id) || entry.color;
                          const val = Number(entry.value);

                          return (
                            <div key={page.id} className="flex items-center justify-between gap-4">
                              <span className="flex items-center gap-1.5 font-medium" style={{ color }}>
                                <span
                                  className="size-2 rounded-full inline-block"
                                  style={{ backgroundColor: color }}
                                />
                                <span className="max-w-[130px] truncate">{page.name}</span>
                                {page.isCompetitor && (
                                  <span className="text-[9px] text-amber-400 font-normal">
                                    (concorrente)
                                  </span>
                                )}
                              </span>
                              <span className="font-mono font-bold text-foreground">
                                {chartMetric === "net"
                                  ? `${val >= 0 ? "+" : ""}${formatFollowers(val)}`
                                  : formatFollowers(val)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value) => {
                  const page = pages.find((p) => p.id === value);
                  if (!page) return value;
                  return (
                    <span className="text-xs text-muted-foreground hover:text-foreground">
                      {page.name} {page.isCompetitor ? "· Concorrente" : ""}
                    </span>
                  );
                }}
              />
              {activePages.map((page) => {
                const color = pageColorMap.get(page.id) || "#a855f7";
                const isOwn = !page.isCompetitor;

                return (
                  <Line
                    key={page.id}
                    type="monotone"
                    dataKey={page.id}
                    name={page.id}
                    stroke={color}
                    strokeWidth={isOwn ? 3 : 2}
                    strokeDasharray={isOwn ? undefined : "4 4"}
                    dot={{ r: isOwn ? 3.5 : 2.5, fill: color }}
                    activeDot={{ r: 5.5, stroke: color, strokeWidth: 2, fill: "var(--background)" }}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 7. PASSO 1: MODAL DA TABELA HISTORICO_SEGUIDORES NO BANCO DE DADOS */}
      <Dialog open={isTableModalOpen} onOpenChange={setIsTableModalOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="size-4 text-purple-400" />
              Tabela: Historico_Seguidores (Passo 1)
            </DialogTitle>
            <DialogDescription>
              Coleção com a "foto diária" de cada perfil monitorado no Anti Gravity. Salva em <code className="text-xs font-mono bg-secondary px-1 py-0.5 rounded">data/historico_seguidores.json</code>.
            </DialogDescription>
          </DialogHeader>

          {/* Barra de Filtro e Ação da Tabela */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <div className="relative flex-1">
                <Search className="size-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  placeholder="Filtrar por @handle ou nome..."
                  value={tableSearchFilter}
                  onChange={(e) => setTableSearchFilter(e.target.value)}
                  className="pl-8 text-xs h-8"
                />
              </div>

              <select
                value={tableTypeFilter}
                onChange={(e) => setTableTypeFilter(e.target.value)}
                className="rounded-lg border border-input bg-secondary/40 px-2 py-1.5 text-xs outline-none"
              >
                <option value="all">Todos os tipos</option>
                <option value="Minha Página">Minha Página</option>
                <option value="Concorrente">Concorrente</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => setIsNewRecordModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition shadow-xs cursor-pointer"
            >
              <Plus className="size-3 stroke-[2.5]" />
              Inserir Linha
            </button>
          </div>

          {/* Listagem da Tabela */}
          <div className="mt-3 flex-1 overflow-auto rounded-lg border border-border/80 bg-secondary/10">
            {filteredDbRecords.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                Nenhum registro encontrado na tabela Historico_Seguidores.
              </div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="bg-secondary/40 text-muted-foreground uppercase text-[10px] font-semibold sticky top-0 border-b border-border/60">
                  <tr>
                    <th className="px-3 py-2">Nome do Perfil</th>
                    <th className="px-3 py-2">Data do Registro</th>
                    <th className="px-3 py-2 text-right">Total de Seguidores</th>
                    <th className="px-3 py-2">Tipo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-mono">
                  {filteredDbRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-secondary/30 transition">
                      <td className="px-3 py-2">
                        <span className="font-bold text-foreground block">
                          {r.profile_handle}
                        </span>
                        {r.profile_name && r.profile_name !== r.profile_handle && (
                          <span className="text-[10px] text-muted-foreground font-sans block">
                            {r.profile_name}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatDateBR(r.date)} ({r.date})
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-foreground">
                        {formatFollowers(r.followers_count)}
                      </td>
                      <td className="px-3 py-2 font-sans">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-semibold border ${
                            r.type === "Minha Página"
                              ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                              : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                          }`}
                        >
                          {r.type}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <DialogFooter className="mt-4 flex items-center justify-between sm:justify-between">
            <span className="text-[11px] text-muted-foreground">
              Total de registros: <strong>{filteredDbRecords.length}</strong> de {dbRecords.length}
            </span>
            <button
              type="button"
              onClick={() => setIsTableModalOpen(false)}
              className="rounded-lg border border-border px-4 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition cursor-pointer"
            >
              Fechar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 8. MODAL PARA INSERIR UMA NOVA LINHA NA TABELA HISTORICO_SEGUIDORES */}
      <Dialog open={isNewRecordModalOpen} onOpenChange={setIsNewRecordModalOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <form onSubmit={handleSaveManualRecord}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="size-4 text-primary" />
                Nova Linha na Tabela Historico_Seguidores
              </DialogTitle>
              <DialogDescription>
                Adicione uma medição manual diretamente à base de dados.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-3">
              <div className="space-y-1">
                <Label htmlFor="rec-handle" className="text-xs">
                  Nome do Perfil (@handle)
                </Label>
                <Input
                  id="rec-handle"
                  placeholder="Ex: @seu_concorrente ou @sua_pagina"
                  value={newRecordHandle}
                  onChange={(e) => setNewRecordHandle(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="rec-date" className="text-xs">
                  Data do Registro
                </Label>
                <Input
                  id="rec-date"
                  type="date"
                  value={newRecordDate}
                  onChange={(e) => setNewRecordDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="rec-count" className="text-xs">
                  Total de Seguidores
                </Label>
                <Input
                  id="rec-count"
                  placeholder="Ex: 10500"
                  value={newRecordFollowers}
                  onChange={(e) => setNewRecordFollowers(e.target.value.replace(/\D/g, ""))}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="rec-type" className="text-xs">
                  Tipo
                </Label>
                <select
                  id="rec-type"
                  value={newRecordType}
                  onChange={(e) => setNewRecordType(e.target.value as ProfileType)}
                  className="w-full rounded-lg border border-input bg-secondary/40 px-3 py-2 text-sm outline-none"
                >
                  <option value="Minha Página">Minha Página</option>
                  <option value="Concorrente">Concorrente</option>
                </select>
              </div>
            </div>

            <DialogFooter className="mt-5">
              <button
                type="button"
                onClick={() => setIsNewRecordModalOpen(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Salvar na Tabela
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 9. MODAL PARA CONFIGURAR MARCO DE CRIAÇÃO / SEGUIDORES INICIAIS */}
      <Dialog open={isMilestoneModalOpen} onOpenChange={setIsMilestoneModalOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <form onSubmit={handleSaveMilestone}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings2 className="size-4 text-primary" />
                Configurar Ponto de Criação da Página
              </DialogTitle>
              <DialogDescription>
                Defina quando sua página foi criada e com quantos seguidores ela começou (ex: 0 ou 10).
                Isso permite traçar a ordem de crescimento real desde o primeiro dia!
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="milestone-page" className="text-xs">
                  Selecione a Página
                </Label>
                <select
                  id="milestone-page"
                  className="w-full rounded-lg border border-input bg-secondary/40 px-3 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-ring"
                  value={milestonePageId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setMilestonePageId(id);
                    const p = pages.find((item) => item.id === id);
                    if (p) {
                      setMilestoneDate(p.createdAt ? p.createdAt.slice(0, 10) : "");
                      setMilestoneFollowers(p.initialFollowersCount !== undefined ? String(p.initialFollowersCount) : "10");
                    }
                  }}
                >
                  {pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (@{p.handle})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="milestone-date" className="text-xs flex items-center gap-1.5">
                    <Calendar className="size-3.5 text-primary" /> Data de Criação / Início
                  </Label>
                  <Input
                    id="milestone-date"
                    type="date"
                    value={milestoneDate}
                    onChange={(e) => setMilestoneDate(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="milestone-followers" className="text-xs flex items-center gap-1.5">
                    <History className="size-3.5 text-primary" /> Seguidores no Início
                  </Label>
                  <Input
                    id="milestone-followers"
                    placeholder="Ex: 10"
                    value={milestoneFollowers}
                    onChange={(e) => setMilestoneFollowers(e.target.value.replace(/\D/g, ""))}
                    required
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <button
                type="button"
                onClick={() => setIsMilestoneModalOpen(false)}
                className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition shadow-xs cursor-pointer"
              >
                Salvar Marco de Criação
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 10. MODAL DE INTEGRAÇÃO & SINCRONIZAÇÃO COM O SUPABASE */}
      <Dialog open={isSupabaseModalOpen} onOpenChange={setIsSupabaseModalOpen}>
        <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cloud className="size-5 text-sky-400" />
              Sincronização com o Supabase (Banco de Dados em Nuvem)
            </DialogTitle>
            <DialogDescription>
              Conecte sua conta do Supabase para armazenar a tabela <code className="bg-secondary px-1 py-0.5 rounded text-xs font-mono text-foreground">historico_seguidores</code> e permitir que os snapshots diários fiquem sincronizados na nuvem.
            </DialogDescription>
          </DialogHeader>

          {/* Status Atual da Conexão */}
          <div
            className={`rounded-xl border p-3.5 text-xs transition ${
              supabaseStatus?.connected && supabaseStatus.tableFound
                ? "border-emerald-500/50 bg-emerald-950/30 text-emerald-200"
                : supabaseStatus?.connected && !supabaseStatus.tableFound
                  ? "border-amber-500/50 bg-amber-950/30 text-amber-200"
                  : "border-border/70 bg-secondary/30 text-muted-foreground"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold">
                <span
                  className={`size-2.5 rounded-full inline-block ${
                    supabaseStatus?.connected && supabaseStatus.tableFound
                      ? "bg-emerald-400"
                      : supabaseStatus?.connected
                        ? "bg-amber-400"
                        : "bg-muted-foreground"
                  }`}
                />
                <span>
                  {supabaseStatus?.connected && supabaseStatus.tableFound
                    ? "Supabase Conectado & Tabela Ativa"
                    : supabaseStatus?.connected
                      ? "Conectado ao Supabase (Aguardando criação da tabela)"
                      : "Supabase Não Configurado"}
                </span>
              </div>
              {supabaseStatus?.connected && (
                <span className="font-mono text-[11px] bg-background/50 px-2 py-0.5 rounded border border-border/40">
                  {supabaseStatus.count} registro(s) no Supabase
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] opacity-90">
              {supabaseStatus?.message || "Insira suas credenciais abaixo para ativar a sincronização em nuvem."}
            </p>
          </div>

          {/* Mensagem de Feedback */}
          {supabaseFeedback && (
            <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-xs text-foreground flex items-center justify-between">
              <span>{supabaseFeedback}</span>
              <button
                type="button"
                onClick={() => setSupabaseFeedback(null)}
                className="text-[11px] text-primary hover:underline font-semibold"
              >
                Dispensar
              </button>
            </div>
          )}

          {/* Formulário de Configuração das Credenciais */}
          <form onSubmit={handleTestAndSaveSupabase} className="space-y-3.5 pt-1">
            <div className="space-y-1">
              <Label htmlFor="sb-url" className="text-xs font-semibold text-foreground">
                Project URL (URL do Projeto Supabase)
              </Label>
              <Input
                id="sb-url"
                placeholder="https://xyzcompany.supabase.co"
                value={supabaseUrlInput}
                onChange={(e) => setSupabaseUrlInput(e.target.value)}
                className="text-xs font-mono"
                required
              />
              <span className="text-[10px] text-muted-foreground block">
                Encontrado em: <strong>Project Settings</strong> &gt; <strong>API</strong> &gt; <strong>Project URL</strong>
              </span>
            </div>

            <div className="space-y-1">
              <Label htmlFor="sb-key" className="text-xs font-semibold text-foreground">
                Anon Public Key (Chave Anônima Pública)
              </Label>
              <Input
                id="sb-key"
                type="password"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={supabaseKeyInput}
                onChange={(e) => setSupabaseKeyInput(e.target.value)}
                className="text-xs font-mono"
                required
              />
              <span className="text-[10px] text-muted-foreground block">
                Encontrado em: <strong>Project Settings</strong> &gt; <strong>API</strong> &gt; <strong>Project API keys (anon / public)</strong>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={isTestingSupabase}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isTestingSupabase ? (
                  <RefreshCw className="size-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-3.5" />
                )}
                {isTestingSupabase ? "Testando Conexão..." : "Testar & Salvar Conexão"}
              </button>

              {supabaseStatus?.connected && (
                <button
                  type="button"
                  onClick={handleManualSupabaseSync}
                  disabled={isSyncingSupabase}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition shadow-xs cursor-pointer disabled:opacity-50"
                  title="Enviar todos os registros da tabela Historico_Seguidores para o Supabase"
                >
                  {isSyncingSupabase ? (
                    <RefreshCw className="size-3.5 animate-spin" />
                  ) : (
                    <Cloud className="size-3.5" />
                  )}
                  {isSyncingSupabase ? "Sincronizando..." : "Sincronizar Dados Locais para o Supabase"}
                </button>
              )}
            </div>
          </form>

          {/* Script SQL para Rodar no Supabase */}
          <div className="space-y-2 border-t border-border/60 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <h5 className="text-xs font-bold text-foreground">
                  Passo Obrigatório: Executar Script SQL no Supabase
                </h5>
                <p className="text-[11px] text-muted-foreground">
                  Copie o script abaixo e execute na aba <strong>SQL Editor</strong> do seu painel Supabase:
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopySql}
                className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-secondary/60 px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-secondary transition cursor-pointer"
              >
                {isCopiedSql ? (
                  <Check className="size-3 text-emerald-400" />
                ) : (
                  <Copy className="size-3" />
                )}
                {isCopiedSql ? "Copiado!" : "Copiar SQL"}
              </button>
            </div>

            <pre className="rounded-lg bg-black/60 p-3 text-[10px] font-mono text-zinc-300 overflow-x-auto max-h-36 border border-border/50">
              {`-- Script de Criação no Supabase (Execute no SQL Editor)
CREATE TABLE IF NOT EXISTS public.historico_seguidores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_handle TEXT NOT NULL,
    profile_name TEXT,
    date DATE NOT NULL,
    followers_count BIGINT NOT NULL DEFAULT 0,
    type TEXT NOT NULL DEFAULT 'Minha Página' CHECK (type IN ('Minha Página', 'Concorrente')),
    page_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_profile_date UNIQUE (profile_handle, date)
);

CREATE INDEX IF NOT EXISTS idx_historico_handle_date ON public.historico_seguidores (profile_handle, date);

ALTER TABLE public.historico_seguidores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso Total Historico" ON public.historico_seguidores;
CREATE POLICY "Acesso Total Historico" ON public.historico_seguidores FOR ALL TO public USING (true) WITH CHECK (true);`}
            </pre>

            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-semibold"
            >
              Abrir Dashboard do Supabase <ExternalLink className="size-3" />
            </a>
          </div>

          <DialogFooter className="mt-4 border-t border-border/40 pt-3">
            <button
              type="button"
              onClick={() => setIsSupabaseModalOpen(false)}
              className="rounded-lg border border-border px-4 py-1.5 text-xs text-muted-foreground hover:bg-secondary"
            >
              Fechar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
