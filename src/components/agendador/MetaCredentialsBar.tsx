import { useState, useEffect } from "react";
import {
  Instagram,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Key,
  Database,
  RefreshCw,
  Copy,
  Check,
  ShieldCheck,
  ChevronDown,
  Users,
  ExternalLink,
  Plus,
  Trash2,
  Layers,
  Sparkles,
} from "lucide-react";
import {
  type MetaApiConfig,
  type InstagramConnectedAccount,
  type MetaTokenValidation,
  type MetaConnection,
} from "@/lib/types";
import {
  fetchSupabaseSql,
  triggerCronWorkerApi,
  validateMetaTokenApi,
  saveServerMetaConfig,
  fetchMetaConnections,
  saveMetaConnectionApi,
  deleteMetaConnectionApi,
  fetchTikTokStatusApi,
  saveTikTokConfigApi,
  getTikTokAuthUrlApi,
  disconnectTikTokApi,
  linkProfileTikTokHandleApi,
  disconnectProfileTikTokApi,
  type TikTokStatusResponse,
} from "@/lib/agendador-client";

interface MetaCredentialsBarProps {
  metaConfig: MetaApiConfig | null;
  accounts: InstagramConnectedAccount[];
  connections?: MetaConnection[];
  selectedAccountId?: string | null | undefined;
  onSelectAccount: (account: InstagramConnectedAccount) => void;
  onUpdateConfig: (config: MetaApiConfig) => void;
  onRefreshQueue: () => void;
  onRefreshAccounts: () => void;
  onRefreshConnections?: () => void;
}

export function MetaCredentialsBar({
  metaConfig,
  accounts,
  connections,
  selectedAccountId,
  onSelectAccount,
  onUpdateConfig,
  onRefreshQueue,
  onRefreshAccounts,
  onRefreshConnections,
}: MetaCredentialsBarProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [accountsModalOpen, setAccountsModalOpen] = useState(false);
  const [sqlModalOpen, setSqlModalOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState(metaConfig?.accessToken || "");
  const [accountIdInput, setAccountIdInput] = useState(
    metaConfig?.instagramAccountId || "",
  );
  const [copiedSql, setCopiedSql] = useState(false);
  const [sqlContent, setSqlContent] = useState("");
  const [testingWorker, setTestingWorker] = useState(false);
  const [workerFeedback, setWorkerFeedback] = useState<string | null>(null);

  // Validação de Permissões Meta
  const [tokenValidation, setTokenValidation] = useState<MetaTokenValidation | null>(null);
  const [checkingValidation, setCheckingValidation] = useState(false);
  const [fixModalOpen, setFixModalOpen] = useState(false);
  const [newFixToken, setNewFixToken] = useState("");
  const [fixingToken, setFixingToken] = useState(false);
  const [fixError, setFixError] = useState<string | null>(null);
  const [fixSuccess, setFixSuccess] = useState<string | null>(null);

  // Gestão de Múltiplos Perfis / Tokens Meta
  const [connectionsList, setConnectionsList] = useState<MetaConnection[]>(connections || []);
  const [connectionsModalOpen, setConnectionsModalOpen] = useState(false);
  const [newConnLabel, setNewConnLabel] = useState("");
  const [newConnToken, setNewConnToken] = useState("");
  const [savingConn, setSavingConn] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);
  const [connSuccess, setConnSuccess] = useState<string | null>(null);
  const [deletingConnId, setDeletingConnId] = useState<string | null>(null);

  const loadConnections = async () => {
    try {
      const conns = await fetchMetaConnections();
      setConnectionsList(conns);
      if (onRefreshConnections) onRefreshConnections();
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadConnections();
  }, []);

  // TikTok Integration State
  const [tikTokModalOpen, setTikTokModalOpen] = useState(false);
  const [selectedProfileForTikTok, setSelectedProfileForTikTok] = useState<string>("conn_default");
  const [tikTokStatus, setTikTokStatus] = useState<TikTokStatusResponse | null>(null);
  const [tikTokKeyInput, setTikTokKeyInput] = useState("awskq2nyl73e2300");
  const [tikTokSecretInput, setTikTokSecretInput] = useState("zq1Y0l0kUFzyNxBqFg1fHsNrwgWn6id5");
  const [savingTikTok, setSavingTikTok] = useState(false);
  const [tikTokFeedback, setTikTokFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadTikTokStatus = async (profileId?: string) => {
    try {
      const pid = profileId || selectedProfileForTikTok;
      const st = await fetchTikTokStatusApi(pid);
      setTikTokStatus(st);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadTikTokStatus();
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === "TIKTOK_AUTH_SUCCESS") {
        loadTikTokStatus(e.data?.profileId);
        onRefreshAccounts();
        if (onRefreshConnections) onRefreshConnections();
        setTikTokFeedback({ type: "success", text: "Conta do TikTok conectada com sucesso ao perfil!" });
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [selectedProfileForTikTok]);

  const [editingTikTokConnId, setEditingTikTokConnId] = useState<string | null>(null);
  const [manualTikTokHandle, setManualTikTokHandle] = useState<string>("");
  const [savingTikTokHandle, setSavingTikTokHandle] = useState<boolean>(false);

  const handleSaveDirectTikTok = async (connId: string) => {
    if (!manualTikTokHandle.trim()) return;
    setSavingTikTokHandle(true);
    try {
      const res = await linkProfileTikTokHandleApi(connId, manualTikTokHandle.trim());
      setConnectionsList(res.connections);
      if (onRefreshConnections) onRefreshConnections();
      setEditingTikTokConnId(null);
      setManualTikTokHandle("");
    } catch (err: any) {
      alert(err.message || "Erro ao vincular TikTok");
    } finally {
      setSavingTikTokHandle(false);
    }
  };

  const handleDisconnectProfileTikTok = async (connId: string) => {
    if (!confirm("Deseja desvincular o TikTok deste perfil?")) return;
    try {
      const res = await disconnectProfileTikTokApi(connId);
      setConnectionsList(res.connections);
      if (onRefreshConnections) onRefreshConnections();
    } catch (err: any) {
      alert(err.message || "Erro ao desvincular TikTok");
    }
  };

  const handleConnectTikTok = async () => {
    try {
      setSavingTikTok(true);
      setTikTokFeedback(null);
      if (tikTokKeyInput.trim() && tikTokSecretInput.trim()) {
        await saveTikTokConfigApi({
          clientKey: tikTokKeyInput.trim(),
          clientSecret: tikTokSecretInput.trim(),
        });
      }
      const authRes = await getTikTokAuthUrlApi(
        tikTokKeyInput.trim() || undefined,
        selectedProfileForTikTok || undefined,
      );
      if (authRes.success && authRes.authUrl) {
        window.open(authRes.authUrl, "tiktok_oauth", "width=600,height=750");
      } else {
        setTikTokFeedback({ type: "error", text: authRes.message || "Erro ao obter URL de autenticação do TikTok." });
      }
    } catch (err: any) {
      setTikTokFeedback({ type: "error", text: err.message || "Erro ao conectar com TikTok." });
    } finally {
      setSavingTikTok(false);
    }
  };

  const handleDisconnectTikTok = async () => {
    try {
      await disconnectTikTokApi(selectedProfileForTikTok);
      await loadTikTokStatus(selectedProfileForTikTok);
      onRefreshAccounts();
      if (onRefreshConnections) onRefreshConnections();
      setTikTokFeedback({ type: "success", text: "Conta desconectada do TikTok neste perfil." });
    } catch (err: any) {
      setTikTokFeedback({ type: "error", text: err.message });
    }
  };


  const handleAddConnection = async () => {
    const raw = newConnToken.trim();
    if (!raw) {
      setConnError("Insira o Access Token da Meta.");
      return;
    }

    setSavingConn(true);
    setConnError(null);
    setConnSuccess(null);

    try {
      const check = await validateMetaTokenApi(raw);
      if (!check.isValid) {
        setConnError(check.message || "Token inválido ou recusado pela Meta Graph API.");
        setSavingConn(false);
        return;
      }

      const res = await saveMetaConnectionApi({
        label: newConnLabel.trim() || `Perfil Meta ${connectionsList.length + 1}`,
        accessToken: raw,
      });

      setConnectionsList(res.connections);
      setConnSuccess(`Perfil "${newConnLabel.trim() || "Novo Perfil"}" conectado com sucesso!`);
      setNewConnLabel("");
      setNewConnToken("");
      onRefreshAccounts();
      if (onRefreshConnections) onRefreshConnections();

      setTimeout(() => setConnSuccess(null), 4000);
    } catch (err: any) {
      setConnError(err.message || "Erro ao salvar nova conexão.");
    } finally {
      setSavingConn(false);
    }
  };

  const handleDeleteConnection = async (id: string, label: string) => {
    if (!confirm(`Tem certeza que deseja desconectar o perfil "${label}"? Suas contas vinculadas não serão mais listadas.`)) return;
    setDeletingConnId(id);
    try {
      const res = await deleteMetaConnectionApi(id);
      setConnectionsList(res.connections);
      onRefreshAccounts();
      if (onRefreshConnections) onRefreshConnections();
    } catch (err: any) {
      alert(err.message || "Erro ao excluir conexão.");
    } finally {
      setDeletingConnId(null);
    }
  };

  const runValidation = async (token?: string) => {
    setCheckingValidation(true);
    try {
      const res = await validateMetaTokenApi(token || metaConfig?.accessToken);
      setTokenValidation(res);
    } catch {
      // ignore
    } finally {
      setCheckingValidation(false);
    }
  };

  useEffect(() => {
    if (metaConfig?.accessToken) {
      runValidation(metaConfig.accessToken);
    }
  }, [metaConfig?.accessToken]);

  const handleValidateAndSaveFixToken = async () => {
    const raw = newFixToken.trim();
    if (!raw) return;
    setFixingToken(true);
    setFixError(null);
    setFixSuccess(null);

    try {
      const check = await validateMetaTokenApi(raw);
      if (!check.isValid) {
        setFixError(check.message || "Token inválido ou recusado pela Meta Graph API.");
        setFixingToken(false);
        return;
      }

      if (!check.hasPublishPermission) {
        setFixError(
          "Atenção: Esse novo token ainda NÃO possui a permissão instagram_content_publish! Certifique-se de adicioná-la em Permissions no Graph API Explorer antes de clicar em Generate Access Token.",
        );
        setFixingToken(false);
        return;
      }

      const savePayload: {
        accessToken: string;
        instagramAccountId?: string;
        accountUsername?: string;
        accountName?: string;
      } = {
        accessToken: raw,
      };
      if (metaConfig?.instagramAccountId) savePayload.instagramAccountId = metaConfig.instagramAccountId;
      if (metaConfig?.accountUsername) savePayload.accountUsername = metaConfig.accountUsername;
      if (metaConfig?.accountName) savePayload.accountName = metaConfig.accountName;

      await saveServerMetaConfig(savePayload);

      const updated: MetaApiConfig = {
        ...(metaConfig || {}),
        accessToken: raw,
        instagramAccountId: metaConfig?.instagramAccountId || "",
        connectedAt: new Date().toISOString(),
      };
      onUpdateConfig(updated);
      setTokenValidation(check);
      setFixSuccess("Token atualizado e verificado com sucesso! Permissão instagram_content_publish confirmada.");

      setTimeout(() => {
        setFixModalOpen(false);
        onRefreshAccounts();
        onRefreshQueue();
      }, 1500);
    } catch (err: any) {
      setFixError(err.message || "Erro ao validar o novo token.");
    } finally {
      setFixingToken(false);
    }
  };

  const isConnected = Boolean(
    metaConfig?.accessToken && metaConfig?.instagramAccountId,
  );

  const activeAccount =
    accounts.find(
      (a) => a.id === (selectedAccountId || metaConfig?.instagramAccountId),
    ) ||
    accounts.find((a) => a.username === metaConfig?.accountUsername) ||
    null;

  const handleSaveCredentials = async () => {
    const updated: MetaApiConfig = {
      ...(metaConfig || {}),
      accessToken: tokenInput.trim(),
      instagramAccountId: accountIdInput.trim(),
      connectedAt: new Date().toISOString(),
    };
    onUpdateConfig(updated);
    setModalOpen(false);
    onRefreshAccounts();
    runValidation(tokenInput.trim());
  };

  const handleOpenSqlModal = async () => {
    try {
      const sql = await fetchSupabaseSql();
      setSqlContent(sql);
      setSqlModalOpen(true);
    } catch {
      setSqlContent("-- Erro ao carregar script SQL.");
      setSqlModalOpen(true);
    }
  };

  const handleCopySql = () => {
    if (!sqlContent) return;
    navigator.clipboard.writeText(sqlContent);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleTriggerWorker = async () => {
    setTestingWorker(true);
    setWorkerFeedback(null);
    try {
      const res = await triggerCronWorkerApi();
      setWorkerFeedback(
        `Worker executado: ${res.checkedCount} verificados, ${res.publishedCount} publicados, ${res.failedCount} falhas.`,
      );
      onRefreshQueue();
      setTimeout(() => setWorkerFeedback(null), 5000);
    } catch (err: any) {
      setWorkerFeedback(err.message || "Erro ao acionar worker.");
      setTimeout(() => setWorkerFeedback(null), 6000);
    } finally {
      setTestingWorker(false);
    }
  };

  const formatFollowers = (count?: number | null) => {
    if (typeof count !== "number") return "0";
    if (count >= 1000000) return (count / 1000000).toFixed(1) + "M";
    if (count >= 1000) return (count / 1000).toFixed(1) + "k";
    return count.toString();
  };

  return (
    <>
      <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-r from-card/90 via-secondary/30 to-card/90 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Status Meta e Conta Ativa */}
          <div className="flex items-center gap-3">
            <div
              className={`grid size-11 place-items-center rounded-xl border ${
                isConnected
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-400"
              }`}
            >
              <Instagram className="size-6" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-tight text-foreground">
                  Instagram Content Publishing API (v22.0)
                </span>
                {isConnected ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                    <CheckCircle2 className="size-3" />
                    Conectado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400">
                    <AlertCircle className="size-3" />
                    Pendente
                  </span>
                )}
              </div>

              {/* Seletor / Indicador da Conta Conectada */}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                {activeAccount ? (
                  <button
                    type="button"
                    onClick={() => setAccountsModalOpen(true)}
                    className="group inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs text-foreground transition-all hover:bg-primary/20 hover:border-primary/50"
                  >
                    {activeAccount.profilePictureUrl ? (
                      <img
                        src={activeAccount.profilePictureUrl}
                        alt={activeAccount.username}
                        className="size-5 rounded-full object-cover ring-1 ring-primary/40"
                      />
                    ) : (
                      <div className="grid size-5 place-items-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                        @
                      </div>
                    )}
                    <span className="font-semibold text-primary">
                      @{activeAccount.username}
                    </span>
                    <span className="text-muted-foreground hidden sm:inline">
                      ({activeAccount.name})
                    </span>
                    {typeof activeAccount.followersCount === "number" && (
                      <span className="rounded bg-primary/20 px-1 text-[10px] font-medium text-primary">
                        {formatFollowers(activeAccount.followersCount)} seg.
                      </span>
                    )}
                    <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-hover:translate-y-0.5" />
                  </button>
                ) : metaConfig?.accountUsername ? (
                  <button
                    type="button"
                    onClick={() => setAccountsModalOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/60 px-2.5 py-1 text-xs text-foreground hover:bg-secondary"
                  >
                    <span className="font-semibold text-primary">
                      @{metaConfig.accountUsername}
                    </span>
                    <ChevronDown className="size-3 text-muted-foreground" />
                  </button>
                ) : (
                  <span className="text-muted-foreground">
                    Nenhuma conta selecionada.
                  </span>
                )}

                {accounts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setAccountsModalOpen(true)}
                    className="text-[11px] text-primary hover:underline font-medium flex items-center gap-1"
                  >
                    <Users className="size-3" />
                    Ver todas as {accounts.length} contas
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Botões de Ação da Barra */}
          <div className="flex flex-wrap items-center gap-2">
            {accounts.length > 0 && (
              <button
                onClick={() => setAccountsModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-all hover:bg-primary/20"
              >
                <Users className="size-3.5" />
                Trocar Conta ({accounts.length})
              </button>
            )}

            <button
              onClick={() => {
                setConnError(null);
                setConnSuccess(null);
                setConnectionsModalOpen(true);
              }}
              title="Gerenciar múltiplos perfis e marcas de clientes (Instagram, Facebook e TikTok isolados)"
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary transition-all hover:bg-primary/25 shadow-sm"
            >
              <Layers className="size-3.5" />
              Perfis & Clientes ({connectionsList.length || 1})
            </button>

            <button
              onClick={handleTriggerWorker}
              disabled={testingWorker || !isConnected}
              title="Executa a verificação manual da fila de agendamentos pendentes agora"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/60 px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:bg-secondary disabled:opacity-50"
            >
              <RefreshCw
                className={`size-3.5 ${testingWorker ? "animate-spin text-primary" : ""}`}
              />
              {testingWorker ? "Verificando..." : "Rodar Worker"}
            </button>

            <button
              onClick={handleOpenSqlModal}
              title="Ver estrutura SQL da tabela para Supabase"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/60 px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:bg-secondary"
            >
              <Database className="size-3.5 text-primary" />
              SQL Supabase
            </button>

            <button
              onClick={() => {
                setTokenInput(metaConfig?.accessToken || "");
                setAccountIdInput(metaConfig?.instagramAccountId || "");
                setModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/80 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground hover:bg-secondary"
            >
              <Key className="size-3.5" />
              Token Meta
            </button>

            <button
              onClick={() => {
                setTikTokFeedback(null);
                setTikTokModalOpen(true);
              }}
              title="Configurar integração oficial do TikTok Developer (Login Kit & Content Posting)"
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition-all hover:bg-cyan-500/20 shadow-sm"
            >
              <span className="size-3.5 rounded-full bg-black border border-cyan-400/50 grid place-items-center text-[9px] text-cyan-400 font-bold leading-none">
                🎵
              </span>
              <span>TikTok {tikTokStatus?.connected ? `(@${tikTokStatus.displayName || "Conectado"})` : "Conectar"}</span>
            </button>
          </div>
        </div>

        {/* Alerta de Permissão Faltando */}
        {tokenValidation && !tokenValidation.hasPublishPermission && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="size-4 shrink-0 text-amber-400" />
              <div>
                <span className="font-bold text-amber-300">Permissão Pendente no Token: </span>
                <span className="text-amber-100/90">
                  O token conectado não possui <code className="rounded bg-amber-950/80 px-1.5 py-0.5 font-mono text-amber-300 font-semibold text-[11px]">instagram_content_publish</code> ou <code className="rounded bg-amber-950/80 px-1.5 py-0.5 font-mono text-amber-300 font-semibold text-[11px]">pages_manage_posts</code>. A Meta rejeitará publicações sem essas permissões.
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setNewFixToken("");
                  setFixError(null);
                  setFixSuccess(null);
                  setFixModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 font-semibold text-black hover:bg-amber-400 transition-colors shadow-sm text-xs"
              >
                <Key className="size-3.5" />
                Como Corrigir em 1 Minuto
              </button>
            </div>
          </div>
        )}

        {/* Dica para postar também no Facebook quando só tem permissão de Instagram */}
        {tokenValidation && tokenValidation.hasInstagramPublish && !tokenValidation.hasFacebookPublish && (
          <div className="mt-2.5 flex items-center justify-between gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-200">
            <div className="flex items-center gap-2">
              <div className="size-4 rounded-full bg-blue-600 grid place-items-center text-[10px] text-white font-bold leading-none shrink-0">
                f
              </div>
              <span>
                <strong>Instagram Ativado!</strong> Deseja postar também na Página do Facebook? Basta adicionar a permissão <code className="rounded bg-blue-950/80 px-1 font-mono text-blue-300">pages_manage_posts</code> no Graph API Explorer.
              </span>
            </div>
          </div>
        )}

        {workerFeedback && (
          <div className="mt-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary-foreground">
            {workerFeedback}
          </div>
        )}
      </div>

      {/* Modal de Escolha de Contas do Instagram & Facebook */}
      {accountsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <Users className="size-5 text-primary" />
                <h3 className="text-base font-semibold text-foreground">
                  Suas Contas do Instagram & Páginas do Facebook
                </h3>
              </div>
              <button
                onClick={() => setAccountsModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <div className="mt-4">
              <p className="text-xs text-muted-foreground">
                Selecione qual conta ou página deseja utilizar como padrão para
                publicações e agendamentos:
              </p>

              <div className="mt-3 space-y-2 max-h-80 overflow-y-auto pr-1">
                {accounts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                    Nenhuma conta detectada. Verifique se o seu Token possui a
                    permissão <code>pages_show_list</code> e{" "}
                    <code>instagram_basic</code>.
                  </div>
                ) : (
                  accounts.map((acc) => {
                    const isSelected =
                      acc.id === (selectedAccountId || metaConfig?.instagramAccountId);
                    return (
                      <div
                        key={acc.id}
                        onClick={() => {
                          onSelectAccount(acc);
                          setAccountsModalOpen(false);
                        }}
                        className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3.5 transition-all ${
                          isSelected
                            ? "border-primary bg-primary/15 ring-2 ring-primary/40 shadow-sm"
                            : "border-border bg-secondary/30 hover:border-primary/40 hover:bg-secondary/60"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {acc.profilePictureUrl ? (
                            <img
                              src={acc.profilePictureUrl}
                              alt={acc.username}
                              className="size-11 rounded-full object-cover ring-1 ring-border"
                            />
                          ) : (
                            <div className="grid size-11 place-items-center rounded-full bg-secondary text-primary font-bold text-sm">
                              {acc.hasInstagram !== false ? "@" : "f"}
                            </div>
                          )}

                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-foreground">
                                {acc.hasInstagram !== false
                                  ? `@${acc.username}`
                                  : acc.pageName || acc.name}
                              </span>
                              {acc.hasInstagram !== false && (
                                <span className="rounded bg-pink-500/15 border border-pink-500/30 px-1.5 py-0.2 text-[9px] font-semibold text-pink-300">
                                  Instagram
                                </span>
                              )}
                              {acc.pageName && (
                                <span className="rounded bg-blue-500/15 border border-blue-500/30 px-1.5 py-0.2 text-[9px] font-semibold text-blue-300">
                                  FB: {acc.pageName}
                                </span>
                              )}
                              {isSelected && (
                                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                                  Ativa
                                </span>
                              )}
                              {acc.connectionLabel && (
                                <span className="rounded bg-secondary/80 border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  {acc.connectionLabel}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {acc.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                              ID: <code className="font-mono">{acc.id}</code>
                              {acc.pageName && ` · Página FB: ${acc.pageName}`}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          {typeof acc.followersCount === "number" && (
                            <span className="inline-block rounded-lg bg-secondary/80 px-2.5 py-1 text-xs font-semibold text-foreground">
                              {formatFollowers(acc.followersCount)} seg.
                            </span>
                          )}
                          <div className="mt-1">
                            <span
                              className={`text-[11px] font-medium ${
                                isSelected ? "text-primary font-bold" : "text-muted-foreground"
                              }`}
                            >
                              {isSelected ? "✓ Selecionada" : "Clique para usar"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
              <button
                onClick={() => setAccountsModalOpen(false)}
                className="rounded-lg bg-secondary px-4 py-2 text-xs font-semibold text-foreground hover:bg-secondary/80"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Gestão de Múltiplos Perfis / Tokens Meta */}
      {connectionsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2.5">
                <div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Layers className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    Perfis Meta Conectados (Multi-Contas & Multi-Tokens)
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Conecte perfis independentes do Facebook para gerenciar páginas do Instagram sem nenhum vínculo entre elas.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setConnectionsModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            {/* Lista de Perfis Conectados */}
            <div className="mt-4 space-y-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                Perfis Ativos ({connectionsList.length})
              </label>

              {connectionsList.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
                  Nenhum perfil cadastrado. Adicione seu primeiro token abaixo.
                </div>
              ) : (
                connectionsList.map((conn) => {
                  const connAccounts = accounts.filter(
                    (a) => a.connectionId === conn.id || (!a.connectionId && conn.id === "conn_default"),
                  );
                  return (
                    <div
                      key={conn.id}
                      className="rounded-xl border border-border bg-secondary/30 p-4 space-y-3 hover:border-primary/30 transition-all"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-foreground">
                            {conn.label}
                          </span>
                          <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                            {conn.hasPublishPermission !== false ? "✅ Pronto para Publicar" : "⚠️ Permissão Pendente"}
                          </span>
                          {conn.appName && (
                            <span className="text-[10px] text-muted-foreground hidden sm:inline">
                              App: {conn.appName}
                            </span>
                          )}
                        </div>

                        {connectionsList.length > 1 && (
                          <button
                            type="button"
                            disabled={deletingConnId === conn.id}
                            onClick={() => handleDeleteConnection(conn.id, conn.label)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="size-3.5" />
                            {deletingConnId === conn.id ? "Removendo..." : "Desconectar"}
                          </button>
                        )}
                      </div>

                      <div className="text-[11px] font-mono text-muted-foreground break-all bg-black/30 rounded-lg p-2">
                        Token: {conn.accessToken.slice(0, 15)}...{conn.accessToken.slice(-10)}
                      </div>

                      {/* Contas Vinculadas a Este Perfil */}
                      <div>
                        <div className="text-[11px] font-medium text-muted-foreground mb-1.5 flex items-center justify-between">
                          <span>Contas do Instagram vinculadas a este perfil ({connAccounts.length}):</span>
                        </div>
                        {connAccounts.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {connAccounts.map((a) => (
                              <div
                                key={a.id}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-xs text-foreground shadow-xs"
                              >
                                {a.profilePictureUrl ? (
                                  <img
                                    src={a.profilePictureUrl}
                                    alt={a.username}
                                    className="size-4 rounded-full object-cover"
                                  />
                                ) : (
                                  <span className="text-primary font-bold text-[10px]">@</span>
                                )}
                                <span className="font-semibold text-primary">@{a.username}</span>
                                {typeof a.followersCount === "number" && (
                                  <span className="text-[10px] text-muted-foreground">
                                    ({formatFollowers(a.followersCount)})
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground italic">
                            Nenhuma conta detectada com este token. Verifique se o perfil tem páginas vinculadas ao Instagram.
                          </span>
                        )}
                      </div>

                      {/* Canal TikTok Deste Perfil */}
                      <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="size-6 rounded-md bg-black border border-cyan-400/40 grid place-items-center text-xs text-cyan-400 font-bold">
                              🎵
                            </span>
                            <div>
                              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                <span>{conn.tikTok?.displayName ? `TikTok: @${conn.tikTok.displayName}` : "TikTok: Não Vinculado"}</span>
                                {conn.tikTok?.displayName && (
                                  <span className="rounded bg-cyan-500/15 border border-cyan-500/30 px-1.5 py-0.2 text-[9px] font-semibold text-cyan-300">
                                    {conn.tikTok.accessToken === "manual_linked" ? "Vinculado" : "OAuth Ativo"}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {conn.tikTok?.displayName
                                  ? "Pronto para receber publicações do agendador Flash"
                                  : "Vincule a conta TikTok deste cliente pelo @ ou login oficial"}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {conn.tikTok?.displayName ? (
                              <button
                                type="button"
                                onClick={() => handleDisconnectProfileTikTok(conn.id)}
                                className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-500/20 transition-all"
                              >
                                Desvincular
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTikTokConnId(conn.id);
                                  setManualTikTokHandle(conn.tikTok?.displayName ? `@${conn.tikTok.displayName}` : "");
                                }}
                                className="rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-2 py-1 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/25 transition-all shadow-xs"
                              >
                                Informar @ do Cliente
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedProfileForTikTok(conn.id);
                                loadTikTokStatus(conn.id);
                                setTikTokModalOpen(true);
                              }}
                              className="rounded-lg border border-border bg-secondary/60 px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
                            >
                              Login Oficial
                            </button>
                          </div>
                        </div>

                        {/* Campo para Informar @ do Cliente Diretamente */}
                        {editingTikTokConnId === conn.id && (
                          <div className="pt-2 border-t border-cyan-500/20 flex items-center gap-2">
                            <input
                              type="text"
                              value={manualTikTokHandle}
                              onChange={(e) => setManualTikTokHandle(e.target.value)}
                              placeholder="ex: @dachshunddiario ou @catalogueipravoce"
                              className="flex-1 rounded-lg border border-border bg-secondary/80 px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-cyan-500 focus:outline-none"
                            />
                            <button
                              type="button"
                              disabled={savingTikTokHandle || !manualTikTokHandle.trim()}
                              onClick={() => handleSaveDirectTikTok(conn.id)}
                              className="rounded-lg bg-cyan-600 px-3 py-1 text-xs font-semibold text-white hover:bg-cyan-500 transition-all disabled:opacity-50"
                            >
                              {savingTikTokHandle ? "Salvando..." : "Salvar @"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingTikTokConnId(null)}
                              className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"
                            >
                              Cancelar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Formulário para Adicionar Novo Perfil / Token Isolado */}
            <div className="mt-6 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <Plus className="size-4" />
                  Conectar Novo Perfil / Token Separado
                </h4>
                <a
                  href="https://developers.facebook.com/tools/explorer/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium"
                >
                  <ExternalLink className="size-3" />
                  Abrir Graph API Explorer
                </a>
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Você pode gerar um token no Meta for Developers com uma conta do Facebook diferente (ou de outro Gerenciador de Negócios). O Agendador manterá este perfil 100% isolado dos outros.
              </p>

              <div>
                <label className="block text-[11px] font-medium text-foreground">
                  Nome / Identificação deste Perfil (Ex: Perfil 2 - Contas Novas, Nicho Pets, etc.)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Perfil 2 - Nicho Separado"
                  value={newConnLabel}
                  onChange={(e) => {
                    setNewConnLabel(e.target.value);
                    setConnError(null);
                    setConnSuccess(null);
                  }}
                  className="mt-1 w-full rounded-lg border border-input bg-secondary/50 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-foreground">
                  Meta Access Token deste Perfil (EAA...)
                </label>
                <textarea
                  rows={3}
                  placeholder="Cole aqui o token gerado com o outro perfil..."
                  value={newConnToken}
                  onChange={(e) => {
                    setNewConnToken(e.target.value);
                    setConnError(null);
                    setConnSuccess(null);
                  }}
                  className="mt-1 w-full rounded-lg border border-input bg-secondary/50 p-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="mt-1 block text-[10px] text-muted-foreground">
                  Permissões necessárias: <code className="text-amber-300">instagram_content_publish</code>, <code>instagram_basic</code>, <code>pages_show_list</code>.
                </span>
              </div>

              {connError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-[11px] text-destructive">
                  {connError}
                </div>
              )}
              {connSuccess && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-[11px] text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>{connSuccess}</span>
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={!newConnToken.trim() || savingConn}
                  onClick={handleAddConnection}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
                >
                  {savingConn ? (
                    <>
                      <RefreshCw className="size-3.5 animate-spin" />
                      Validando e Conectando...
                    </>
                  ) : (
                    <>
                      <Plus className="size-3.5" />
                      Conectar Perfil Meta
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="mt-6 flex justify-end border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setConnectionsModalOpen(false)}
                className="rounded-lg bg-secondary px-4 py-2 text-xs font-semibold text-foreground hover:bg-secondary/80"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Correção Rápida de Permissão do Token */}
      {fixModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-amber-500/40 bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2 text-amber-400">
                <AlertTriangle className="size-5" />
                <h3 className="text-base font-semibold text-foreground">
                  Como Corrigir a Permissão instagram_content_publish
                </h3>
              </div>
              <button
                onClick={() => setFixModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <p className="text-muted-foreground leading-relaxed">
                O erro <strong className="text-destructive font-mono text-[11px]">(#10) Requires instagram_content_publish permission</strong> ocorre porque o Token foi gerado sem a caixinha de permissão de publicação marcada no Meta Developers.
              </p>

              <div className="rounded-xl border border-border bg-secondary/30 p-3.5 space-y-2">
                <p className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                  <span className="grid size-5 place-items-center rounded-full bg-primary/20 text-xs font-bold text-primary">1</span>
                  Acesse o Graph API Explorer do seu App
                </p>
                <p className="text-muted-foreground text-[11px]">
                  Abra a ferramenta oficial de desenvolvedores da Meta com o seu aplicativo <strong>Flash Dark</strong>:
                </p>
                <a
                  href="https://developers.facebook.com/tools/explorer/?app_id=1437178635181870"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                >
                  <ExternalLink className="size-3.5" />
                  Abrir Graph API Explorer (App Flash Dark)
                </a>
              </div>

              <div className="rounded-xl border border-border bg-secondary/30 p-3.5 space-y-2">
                <p className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                  <span className="grid size-5 place-items-center rounded-full bg-primary/20 text-xs font-bold text-primary">2</span>
                  Adicione as Permissões Necessárias
                </p>
                <p className="text-muted-foreground text-[11px]">
                  Na coluna à direita em <strong>Permissions</strong> (Permissões), clique em <em>Add a Permission</em> e adicione:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 font-mono text-[11px]">
                  <div className="flex items-center gap-1.5 rounded bg-amber-500/15 border border-amber-500/30 px-2 py-1 text-amber-300">
                    <Check className="size-3 shrink-0" />
                    <span>instagram_content_publish</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded bg-secondary/80 border border-border px-2 py-1 text-muted-foreground">
                    <Check className="size-3 shrink-0 text-emerald-400" />
                    <span>instagram_basic</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded bg-secondary/80 border border-border px-2 py-1 text-muted-foreground">
                    <Check className="size-3 shrink-0 text-emerald-400" />
                    <span>pages_show_list</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded bg-secondary/80 border border-border px-2 py-1 text-muted-foreground">
                    <Check className="size-3 shrink-0 text-emerald-400" />
                    <span>pages_read_engagement</span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-secondary/30 p-3.5 space-y-2">
                <p className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                  <span className="grid size-5 place-items-center rounded-full bg-primary/20 text-xs font-bold text-primary">3</span>
                  Cole o Novo Token Abaixo
                </p>
                <p className="text-muted-foreground text-[11px]">
                  Após clicar em <em>Generate Access Token</em> e confirmar na janela do Facebook, cole o novo token aqui:
                </p>
                <textarea
                  rows={3}
                  placeholder="Cole aqui o novo token EAA..."
                  value={newFixToken}
                  onChange={(e) => {
                    setNewFixToken(e.target.value);
                    setFixError(null);
                    setFixSuccess(null);
                  }}
                  className="w-full rounded-lg border border-input bg-secondary/50 p-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />

                {fixError && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-[11px] text-destructive">
                    {fixError}
                  </div>
                )}
                {fixSuccess && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-[11px] text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="size-4 shrink-0" />
                    <span>{fixSuccess}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setFixModalOpen(false)}
                className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                Fechar
              </button>
              <button
                type="button"
                disabled={!newFixToken.trim() || fixingToken}
                onClick={handleValidateAndSaveFixToken}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
              >
                {fixingToken ? (
                  <>
                    <RefreshCw className="size-3.5 animate-spin" />
                    Validando Permissões...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="size-3.5" />
                    Validar e Salvar Novo Token
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Configuração de Credenciais Meta */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" />
                <h3 className="text-base font-semibold text-foreground">
                  Configuração de Publicação Meta API v22.0
                </h3>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <p className="text-xs text-muted-foreground">
                Insira as credenciais da sua conta profissional conectada. A publicação
                ocorre diretamente sem necessidade de redirecionamento ou login externo.
              </p>

              <div>
                <label className="block text-xs font-medium text-foreground">
                  Instagram Business Account ID (Numérico)
                </label>
                <input
                  type="text"
                  placeholder="Ex: 17841400000000000"
                  value={accountIdInput}
                  onChange={(e) => setAccountIdInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-secondary/50 px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  Disponível no Meta Graph API Explorer ou nas configurações da Página vinculada.
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-foreground">
                    Meta Access Token
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setNewFixToken(tokenInput);
                      setFixModalOpen(true);
                      setModalOpen(false);
                    }}
                    className="text-[11px] text-amber-400 hover:underline flex items-center gap-1"
                  >
                    <AlertTriangle className="size-3" />
                    Gerar token com permissões
                  </button>
                </div>
                <textarea
                  rows={4}
                  placeholder="EAA..."
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-secondary/50 p-3 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    Obrigatório: <code className="text-amber-300">instagram_content_publish</code>
                  </span>
                  <button
                    type="button"
                    onClick={() => runValidation(tokenInput.trim())}
                    disabled={!tokenInput.trim() || checkingValidation}
                    className="rounded bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-secondary/80 flex items-center gap-1.5"
                  >
                    <RefreshCw className={`size-3 ${checkingValidation ? "animate-spin text-primary" : ""}`} />
                    Testar Permissões
                  </button>
                </div>

                {tokenValidation && (
                  <div className="mt-2 rounded-lg border border-border bg-secondary/40 p-2.5 text-[11px] space-y-1">
                    <div className="flex items-center justify-between font-semibold">
                      <span>Status do Token:</span>
                      <span className={tokenValidation.hasPublishPermission ? "text-emerald-400" : "text-amber-400"}>
                        {tokenValidation.hasPublishPermission ? "✅ Permissão para Publicar OK" : "⚠️ Sem Permissão de Publicação"}
                      </span>
                    </div>
                    <div className="text-muted-foreground text-[10px]">
                      App: {tokenValidation.appName} ({tokenValidation.appId}) | Tipo: {tokenValidation.tokenType}
                    </div>
                    <div className="text-[10px]">
                      Permissões: {tokenValidation.grantedPermissions.join(", ") || "Nenhuma"}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveCredentials}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90"
              >
                Salvar Credenciais
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de SQL para Supabase */}
      {sqlModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <Database className="size-5 text-primary" />
                <h3 className="text-base font-semibold text-foreground">
                  Tabela Agendamentos_Instagram (Supabase SQL)
                </h3>
              </div>
              <button
                onClick={() => setSqlModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <div className="mt-4">
              <p className="text-xs text-muted-foreground">
                Copie o comando SQL abaixo e execute no <strong>SQL Editor</strong> do
                seu painel Supabase para criar a tabela com os tipos e índices ideais:
              </p>

              <div className="relative mt-3">
                <pre className="max-h-72 overflow-x-auto rounded-lg border border-border bg-secondary/80 p-3 font-mono text-[11px] text-foreground">
                  {sqlContent}
                </pre>
                <button
                  onClick={handleCopySql}
                  className="absolute right-3 top-3 inline-flex items-center gap-1 rounded bg-card/90 px-2 py-1 text-xs font-medium text-foreground shadow border border-border hover:bg-secondary"
                >
                  {copiedSql ? (
                    <>
                      <Check className="size-3 text-emerald-400" /> Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" /> Copiar SQL
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
              <button
                onClick={() => setSqlModalOpen(false)}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal TikTok Developer Integration */}
      {tikTokModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-cyan-500/30 bg-card p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2.5">
                <span className="size-8 rounded-lg bg-black border border-cyan-400/40 grid place-items-center text-sm text-cyan-400 font-bold">
                  🎵
                </span>
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    TikTok Developer Integration
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Login Kit (OAuth 2.0) & Content Posting API
                  </p>
                </div>
              </div>
              <button
                onClick={() => setTikTokModalOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                ✕
              </button>
            </div>

            {/* Status Card */}
            <div className="mt-4 rounded-xl border border-border bg-secondary/30 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {tikTokStatus?.avatarUrl ? (
                    <img
                      src={tikTokStatus.avatarUrl}
                      alt={tikTokStatus.displayName || "TikTok Profile"}
                      className="size-10 rounded-full object-cover ring-2 ring-cyan-500/50"
                    />
                  ) : (
                    <div className="size-10 rounded-full bg-cyan-500/20 text-cyan-300 grid place-items-center font-bold text-sm">
                      TT
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      {tikTokStatus?.connected
                        ? tikTokStatus.displayName || "Perfil TikTok Vinculado"
                        : "Nenhum Perfil TikTok Conectado"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {tikTokStatus?.connected ? "Token OAuth 2.0 ativo" : "Aguardando autenticação"}
                    </div>
                  </div>
                </div>

                {tikTokStatus?.connected ? (
                  <button
                    onClick={handleDisconnectTikTok}
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/20"
                  >
                    Desconectar
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
                    Pendente
                  </span>
                )}
              </div>
            </div>

            {/* Feedback Message */}
            {tikTokFeedback && (
              <div
                className={`mt-4 rounded-lg border p-3 text-xs ${
                  tikTokFeedback.type === "success"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-red-500/30 bg-red-500/10 text-red-300"
                }`}
              >
                {tikTokFeedback.text}
              </div>
            )}

            {/* Seleção do Perfil / Marca Destino */}
            <div className="mt-4 rounded-xl border border-border bg-secondary/20 p-3">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Vincular ao Perfil / Marca:</span>
                <span className="text-[10px] text-cyan-400 font-normal">
                  {connectionsList.find((c) => c.id === selectedProfileForTikTok)?.label || "Perfil Atual"}
                </span>
              </label>
              <select
                value={selectedProfileForTikTok}
                onChange={(e) => {
                  setSelectedProfileForTikTok(e.target.value);
                  loadTikTokStatus(e.target.value);
                }}
                className="mt-1.5 w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-xs text-foreground focus:border-cyan-500 focus:outline-none"
              >
                {connectionsList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} {c.tikTok?.displayName ? `(TikTok: @${c.tikTok.displayName})` : "(Sem TikTok conectado)"}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Cada marca (ex: Dachshund Diário, Cataloguei Pra Você, Viral de Cinema) pode ter sua própria conta do TikTok vinculada independentemente.
              </p>
            </div>

            {/* Credenciais Form */}
            <div className="mt-3 space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  Client Key do TikTok (App Details):
                </label>
                <input
                  type="text"
                  value={tikTokKeyInput}
                  onChange={(e) => setTikTokKeyInput(e.target.value)}
                  placeholder={tikTokStatus?.clientKey ? `Atual: ${tikTokStatus.clientKey}` : "ex: awq123456789..."}
                  className="mt-1 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  Client Secret do TikTok (App Details):
                </label>
                <input
                  type="password"
                  value={tikTokSecretInput}
                  onChange={(e) => setTikTokSecretInput(e.target.value)}
                  placeholder={tikTokStatus?.hasSecret ? "•••••••••••••••••••••••••••••• (salvo)" : "Cole seu Client Secret do TikTok"}
                  className="mt-1 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              {/* Botão Conectar */}
              <button
                type="button"
                onClick={handleConnectTikTok}
                disabled={savingTikTok}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50"
              >
                {savingTikTok ? "Conectando..." : "Salvar e Conectar com TikTok"}
              </button>
            </div>

            {/* Informações para o Portal do Desenvolvedor (Guia do Vídeo) */}
            <div className="mt-5 rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-3.5 text-xs space-y-2">
              <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                <Sparkles className="size-3.5" /> Configuração no TikTok Developer Portal:
              </div>
              <div>
                <span className="text-muted-foreground">Redirect URI (Produção):</span>
                <code className="block mt-0.5 rounded bg-black/60 px-2 py-1 font-mono text-[11px] text-cyan-200 select-all">
                  https://video-flashdark.lovable.app/api/tiktok/callback
                </code>
              </div>
              <div>
                <span className="text-muted-foreground">Redirect URI (Local):</span>
                <code className="block mt-0.5 rounded bg-black/60 px-2 py-1 font-mono text-[11px] text-cyan-200 select-all">
                  http://localhost:8080/api/tiktok/callback
                </code>
              </div>
              <div className="pt-1 text-[11px] text-muted-foreground leading-relaxed">
                💡 <strong className="text-foreground">Dica do Vídeo:</strong> Em <em>Roles & Permissions &gt; Staging Testers</em> no Portal do TikTok, adicione seu nome de usuário TikTok para publicar e testar de imediato sem ter que aguardar aprovação de revisão pública!
              </div>
            </div>

            {/* Aviso e Solução do Erro client_key */}
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs space-y-2">
              <div className="font-bold text-amber-300 flex items-center gap-1.5">
                <AlertCircle className="size-4 shrink-0 text-amber-400" />
                <span>Por que o TikTok exibiu "client_key"?</span>
              </div>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Como seu aplicativo no TikTok ainda está <strong className="text-amber-200">Em Análise (In Review)</strong>, o TikTok bloqueia o login de qualquer conta que não esteja na lista de testadores.
              </p>
              <div className="rounded-lg bg-black/40 p-2.5 text-[11px] space-y-1.5 border border-border">
                <p className="font-semibold text-foreground">Como autorizar qualquer conta cliente agora:</p>
                <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
                  <li>No <a href="https://developers.tiktok.com/" target="_blank" rel="noreferrer" className="text-cyan-400 underline">TikTok Developer Portal</a>, vá no menu lateral em <strong>Roles & Permissions &gt; Staging Testers</strong>.</li>
                  <li>Clique em <strong>Add Tester</strong> e digite o <strong className="text-foreground">@usuario</strong> da conta do TikTok que você quer logar.</li>
                  <li>Abra o TikTok dessa conta no celular (aba Notificações &gt; Notificações do Sistema) e aceite o convite.</li>
                  <li>Pronto! Você poderá clicar em <strong>Salvar e Conectar com TikTok</strong> normalmente!</li>
                </ol>
                <p className="text-[10px] text-cyan-300 pt-1">
                  ⭐ <em>Você também pode vincular a conta do cliente diretamente sem login no botão <strong>Perfis & Clientes &gt; Informar @ do Cliente</strong>!</em>
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
              <button
                onClick={() => setTikTokModalOpen(false)}
                className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-secondary"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
