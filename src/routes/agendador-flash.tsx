import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import {
  CalendarClock,
  Instagram,
  RefreshCw,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  type AgendamentoInstagram,
  type MetaApiConfig,
  type InstagramConnectedAccount,
  type MetaConnection,
} from "@/lib/types";
import { STORAGE_KEYS, useLocalState } from "@/lib/local-store";
import {
  fetchAgendamentos,
  fetchInstagramAccounts,
  fetchServerMetaConfig,
  saveServerMetaConfig,
  fetchMetaConnections,
} from "@/lib/agendador-client";
import { MetaCredentialsBar } from "@/components/agendador/MetaCredentialsBar";
import { AgendadorForm } from "@/components/agendador/AgendadorForm";
import { AgendamentosQueue } from "@/components/agendador/AgendamentosQueue";

export const Route = createFileRoute("/agendador-flash")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Agendador Flash · Publicações para Instagram" },
      {
        name: "description",
        content:
          "Agende e publique imagens e reels diretamente no Instagram com a Meta Graph API v22.0 de forma autônoma e programada.",
      },
    ],
  }),
  component: AgendadorFlashPage,
});

function AgendadorFlashPage() {
  // Configuração Meta persistida no cliente (localStorage)
  const { value: metaConfig, setValue: setMetaConfig } =
    useLocalState<MetaApiConfig | null>(STORAGE_KEYS.metaApiConfig, null);

  const [connections, setConnections] = useState<MetaConnection[]>([]);
  const [items, setItems] = useState<AgendamentoInstagram[]>([]);
  const [accounts, setAccounts] = useState<InstagramConnectedAccount[]>([]);
  const [selectedAccount, setSelectedAccount] =
    useState<InstagramConnectedAccount | null>(null);
  const [editingItem, setEditingItem] = useState<AgendamentoInstagram | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Carrega agendamentos
  const loadAgendamentos = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const data = await fetchAgendamentos();
      setItems(data);
    } catch (err) {
      console.warn("Erro ao buscar agendamentos:", err);
    } finally {
      setLoading(false);
      if (!isSilent) setRefreshing(false);
    }
  }, []);

  // Carrega conexões Meta cadastradas
  const loadConnections = useCallback(async () => {
    try {
      const conns = await fetchMetaConnections();
      setConnections(conns);
      return conns;
    } catch (err) {
      console.warn("Erro ao buscar conexões Meta:", err);
      return [];
    }
  }, []);

  // Carrega contas disponíveis na Meta API (agregadas de todas as conexões cadastradas)
  const loadAccounts = useCallback(
    async (token?: string) => {
      try {
        const list = await fetchInstagramAccounts(token || metaConfig?.accessToken);
        setAccounts(list);

        if (list.length > 0) {
          // Identifica conta atual ou seleciona a primeira
          setSelectedAccount((prev) => {
            if (prev) {
              const stillExists = list.find((a) => a.id === prev.id);
              if (stillExists) return stillExists;
            }
            const match =
              list.find((a) => a.id === metaConfig?.instagramAccountId) ||
              list.find((a) => a.username === metaConfig?.accountUsername) ||
              list[0];
            return match || null;
          });
        }
      } catch (err) {
        console.warn("Erro ao carregar lista de contas do Instagram:", err);
      }
    },
    [metaConfig?.instagramAccountId, metaConfig?.accountUsername],
  );

  // Inicialização: carrega agendamentos, conexões e contas
  useEffect(() => {
    loadAgendamentos();

    async function initSync() {
      try {
        await loadConnections();
        const serverConfig = await fetchServerMetaConfig();

        if (serverConfig && serverConfig.accessToken && !metaConfig?.accessToken) {
          // Servidor tem credenciais salvas, copia para o frontend
          setMetaConfig({
            accessToken: serverConfig.accessToken,
            instagramAccountId: serverConfig.instagramAccountId,
            accountUsername: serverConfig.accountUsername,
            accountName: serverConfig.accountName,
          });
        } else if (metaConfig && metaConfig.accessToken && !serverConfig?.accessToken) {
          // Frontend tem credenciais, salva no servidor
          const toSave: Partial<import("@/lib/meta-config-store").StoredMetaConfig> = {
            accessToken: metaConfig.accessToken,
            instagramAccountId: metaConfig.instagramAccountId,
          };
          if (metaConfig.accountUsername) toSave.accountUsername = metaConfig.accountUsername;
          if (metaConfig.accountName) toSave.accountName = metaConfig.accountName;
          await saveServerMetaConfig(toSave);
        }

        // Carrega todas as contas cadastradas nas conexões
        await loadAccounts();
      } catch (err) {
        console.warn("Falha na sincronização de credenciais Meta:", err);
      }
    }

    initSync();

    // Polling a cada 15 segundos para atualizar status da fila em tempo real
    const interval = setInterval(() => {
      loadAgendamentos(true);
    }, 15000);

    return () => clearInterval(interval);
  }, [loadAgendamentos, loadAccounts, loadConnections, metaConfig, setMetaConfig]);

  // Escolha de conta ativa pelo usuário
  const handleSelectAccount = async (acc: InstagramConnectedAccount) => {
    setSelectedAccount(acc);
    const updated: MetaApiConfig = {
      ...(metaConfig || { accessToken: "" }),
      instagramAccountId: acc.id,
      accountUsername: acc.username,
      accountName: acc.name,
      avatarUrl: acc.profilePictureUrl || undefined,
    };
    setMetaConfig(updated);

    try {
      const toSave: Partial<import("@/lib/meta-config-store").StoredMetaConfig> = {
        accessToken: updated.accessToken,
        instagramAccountId: acc.id,
        accountUsername: acc.username,
        accountName: acc.name,
      };
      if (acc.profilePictureUrl) toSave.avatarUrl = acc.profilePictureUrl;
      await saveServerMetaConfig(toSave);
    } catch (err) {
      console.warn("Erro ao salvar conta selecionada no servidor:", err);
    }
  };

  // Atualização geral de credenciais (Token)
  const handleUpdateMetaConfig = async (newConfig: MetaApiConfig) => {
    setMetaConfig(newConfig);
    try {
      const toSave: Partial<import("@/lib/meta-config-store").StoredMetaConfig> = {
        accessToken: newConfig.accessToken,
        instagramAccountId: newConfig.instagramAccountId,
      };
      if (newConfig.accountUsername) toSave.accountUsername = newConfig.accountUsername;
      if (newConfig.accountName) toSave.accountName = newConfig.accountName;
      await saveServerMetaConfig(toSave);
      loadAccounts(newConfig.accessToken);
    } catch (err) {
      console.warn("Erro ao salvar config no servidor:", err);
    }
  };

  const handleSavedItem = (saved: AgendamentoInstagram) => {
    setEditingItem(null);
    loadAgendamentos(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-16">
      {/* Top Header */}
      <header className="border-b border-border/80 bg-card/60 backdrop-blur-md sticky top-0 z-30 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-primary/15 ring-1 ring-primary/30 text-primary">
              <CalendarClock className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-foreground">
                  Agendador Flash
                </h1>
                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
                  Instagram API v22.0
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Publicação direta e agendada para qualquer uma das suas páginas conectadas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                loadAgendamentos(false);
                loadConnections();
                loadAccounts();
              }}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-all disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin text-primary" : ""}`} />
              Atualizar Dados
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 pt-6 space-y-6">
        {/* Barra de Conexão Meta Graph API e Seletor de Contas */}
        <MetaCredentialsBar
          metaConfig={metaConfig}
          accounts={accounts}
          connections={connections}
          selectedAccountId={selectedAccount?.id ?? null}
          onSelectAccount={handleSelectAccount}
          onUpdateConfig={handleUpdateMetaConfig}
          onRefreshQueue={() => loadAgendamentos(false)}
          onRefreshAccounts={() => loadAccounts()}
          onRefreshConnections={async () => {
            await loadConnections();
            await loadAccounts();
          }}
        />

        {/* Layout Dividido em Duas Colunas: Formulário (Esq) e Fila (Dir) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Coluna da Esquerda: Formulário de Criação / Edição */}
          <div className="lg:col-span-5">
            <AgendadorForm
              metaConfig={metaConfig}
              accounts={accounts}
              selectedAccount={selectedAccount}
              onSelectAccount={handleSelectAccount}
              editingItem={editingItem}
              onSaved={handleSavedItem}
              onCancelEdit={() => setEditingItem(null)}
            />
          </div>

          {/* Coluna da Direita: Fila de Agendamentos */}
          <div className="lg:col-span-7">
            <AgendamentosQueue
              items={items}
              metaConfig={metaConfig}
              onEdit={(item) => {
                setEditingItem(item);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              onRefresh={() => loadAgendamentos(false)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
