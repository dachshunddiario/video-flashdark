import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Users,
  TrendingUp,
  Swords,
  Plus,
  Trash2,
  Instagram,
  BarChart3,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { STORAGE_KEYS, uid, useLocalState } from "@/lib/local-store";
import { PLATFORMS, type FollowerSnapshot, type Platform, type SocialPage } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · Studio Local" },
      {
        name: "description",
        content:
          "Acompanhe seguidores, engajamento e concorrentes das suas páginas de redes sociais, com dados salvos apenas no seu computador.",
      },
      { property: "og:title", content: "Dashboard · Studio Local" },
      {
        property: "og:description",
        content: "Análise local de páginas e concorrentes de redes sociais.",
      },
    ],
  }),
  component: Dashboard;
});

const inputCls =
  "w-full rounded-lg border border-input bg-secondary/40 px-3 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-ring";

function Dashboard() {
  const { value: pages, setValue: setPages } = useLocalState<SocialPage[]>(
    STORAGE_KEYS.pages,
    [],
  );
  const { value: history, setValue: setHistory } = useLocalState<FollowerSnapshot[]>(
    STORAGE_KEYS.followerHistory,
    [],
  );

  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [niche, setNiche] = useState("");
  const [isCompetitor, setIsCompetitor] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = pages.find((p) => p.id === selectedId) ?? pages[0] ?? null;

  const [snapDate, setSnapDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [snapFollowers, setSnapFollowers] = useState("");
  const [snapEngagement, setSnapEngagement] = useState("");

  const ownPages = pages.filter((p) => !p.isCompetitor);
  const competitors = pages.filter((p) => p.isCompetitor);

  const series = useMemo(() => {
    if (!selected) return [];
    return history
      .filter((h) => h.pageId === selected.id)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((h) => ({ date: h.date.slice(5), followers: h.followers, eng: h.engagement ?? 0 }));
  }, [history, selected]);

  const totalFollowers = useMemo(() => {
    return ownPages.reduce((sum, p) => {
      const last = history
        .filter((h) => h.pageId === p.id)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      return sum + (last?.followers ?? 0);
    }, 0);
  }, [ownPages, history]);

  const growth = useMemo(() => {
    if (series.length < 2) return 0;
    const first = series[0].followers;
    const last = series[series.length - 1].followers;
    return first ? ((last - first) / first) * 100 : 0;
  }, [series]);

  function addPage() {
    const clean = handle.trim().replace(/^@/, "");
    if (!clean) return;
    const page: SocialPage = {
      id: uid(),
      handle: clean,
      platform,
      niche: niche.trim() || undefined,
      isCompetitor,
      createdAt: new Date().toISOString(),
    };
    setPages([...pages, page]);
    setHandle("");
    setNiche("");
    setSelectedId(page.id);
  }

  function addSnapshot() {
    if (!selected || !snapFollowers) return;
    setHistory([
      ...history.filter((h) => !(h.pageId === selected.id && h.date === snapDate)),
      {
        id: uid(),
        pageId: selected.id,
        date: snapDate,
        followers: Number(snapFollowers),
        engagement: snapEngagement ? Number(snapEngagement) : undefined,
      },
    ]);
    setSnapFollowers("");
    setSnapEngagement("");
  }

  function removePage(id: string) {
    setPages(pages.filter((p) => p.id !== id));
    setHistory(history.filter((h) => h.pageId !== id));
  }

  return (
    <div className="mx-auto max-w-[1400px] px-10 py-9">
      <PageHeader
        title="Dashboard"
        subtitle="Suas páginas, concorrentes e histórico de seguidores — tudo armazenado localmente."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Páginas próprias" value={String(ownPages.length)} icon={Instagram} />
        <StatCard label="Concorrentes" value={String(competitors.length)} icon={Swords} />
        <StatCard
          label="Seguidores (última medição)"
          value={totalFollowers.toLocaleString("pt-BR")}
          icon={Users}
        />
        <StatCard
          label="Crescimento no período"
          value={`${growth >= 0 ? "+" : ""}${growth.toFixed(1)}%`}
          hint={selected ? `@${selected.handle}` : "Sem página selecionada"}
          tone={growth >= 0 ? "up" : "down"}
          icon={TrendingUp}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <section className="panel p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">
                Histórico de seguidores {selected ? `· @${selected.handle}` : ""}
              </h2>
            </div>
            {pages.length > 0 && (
              <select
                className="rounded-lg border border-input bg-secondary/40 px-3 py-1.5 text-xs outline-none focus:border-primary/60"
                value={selected?.id ?? ""}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    @{p.handle} {p.isCompetitor ? "(concorrente)" : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {series.length < 2 ? (
            <div className="mt-6 grid place-items-center rounded-lg border border-dashed border-border py-20 text-center">
              <p className="text-sm text-muted-foreground">
                Registre pelo menos duas medições para ver o gráfico de evolução.
              </p>
            </div>
          ) : (
            <div className="mt-6 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series}>
                  <defs>
                    <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="followers"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    fill="url(#fill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="mt-6 grid gap-3 border-t border-border pt-5 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <input
              type="date"
              className={inputCls}
              value={snapDate}
              onChange={(e) => setSnapDate(e.target.value)}
            />
            <input
              className={inputCls}
              placeholder="Seguidores"
              inputMode="numeric"
              value={snapFollowers}
              onChange={(e) => setSnapFollowers(e.target.value.replace(/\D/g, ""))}
            />
            <input
              className={inputCls}
              placeholder="Engajamento %"
              value={snapEngagement}
              onChange={(e) => setSnapEngagement(e.target.value)}
            />
            <button
              onClick={addSnapshot}
              disabled={!selected || !snapFollowers}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:brightness-110 disabled:opacity-40"
            >
              <Plus className="size-4" /> Registrar
            </button>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="panel space-y-3 p-6">
            <h2 className="text-sm font-semibold">Cadastrar página</h2>
            <input
              className={inputCls}
              placeholder="@perfil"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
            />
            <select
              className={inputCls}
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
            >
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <input
              className={inputCls}
              placeholder="Nicho (opcional)"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isCompetitor}
                onChange={(e) => setIsCompetitor(e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              É concorrente
            </label>
            <button
              onClick={addPage}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:brightness-110"
            >
              <Plus className="size-4" /> Adicionar
            </button>
          </section>

          <section className="panel p-6">
            <h2 className="text-sm font-semibold">Páginas cadastradas</h2>
            {pages.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">Nenhuma página ainda.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {pages.map((p) => {
                  const last = history
                    .filter((h) => h.pageId === p.id)
                    .sort((a, b) => b.date.localeCompare(a.date))[0];
                  return (
                    <li
                      key={p.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 transition",
                        selected?.id === p.id
                          ? "border-primary/40 bg-primary/10"
                          : "border-border bg-secondary/30 hover:bg-secondary/60",
                      )}
                      onClick={() => setSelectedId(p.id)}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm">@{p.handle}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {PLATFORMS.find((x) => x.id === p.platform)?.label}
                          {p.isCompetitor ? " · concorrente" : ""}
                          {p.niche ? ` · ${p.niche}` : ""}
                        </p>
                      </div>
                      <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                        {last ? last.followers.toLocaleString("pt-BR") : "—"}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removePage(p.id);
                        }}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
