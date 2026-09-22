import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  FolderOpen,
  Play,
  Save,
  Trash2,
  Terminal,
  Sparkles,
  Loader2,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { STORAGE_KEYS, uid, useLocalState } from "@/lib/local-store";
import {
  DEFAULT_PRESET,
  DEFAULT_SETTINGS,
  type AppSettings,
  type EditorPreset,
  type QueueItem,
  type Template,
} from "@/lib/types";
import {
  buildFfmpegArgs,
  isDesktopRuntime,
  previewCommand,
  runFfmpegLocal,
} from "@/lib/ffmpeg-local";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/editor")({
  head: () => ({
    meta: [
      { title: "Editor em massa · Studio Local" },
      {
        name: "description",
        content:
          "Aplique presets de corte, velocidade, zoom e marca d'água em vários vídeos de uma vez com FFmpeg local.",
      },
      { property: "og:title", content: "Editor em massa · Studio Local" },
      {
        property: "og:description",
        content:
          "Fila de edição em massa com FFmpeg local — seus arquivos nunca saem do computador.",
      },
    ],
  }),
  component: EditorPage,
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-input bg-secondary/40 px-3 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-ring";

function EditorPage() {
  const { value: preset, setValue: setPreset } = useLocalState<EditorPreset>(
    STORAGE_KEYS.editorPrefs,
    DEFAULT_PRESET,
  );
  const { value: templates, setValue: setTemplates } = useLocalState<Template[]>(
    STORAGE_KEYS.templates,
    [],
  );
  const { value: settings, setValue: setSettings } = useLocalState<AppSettings>(
    STORAGE_KEYS.appSettings,
    DEFAULT_SETTINGS,
  );

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [running, setRunning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const desktop = isDesktopRuntime();

  const set = <K extends keyof EditorPreset>(key: K, v: EditorPreset[K]) =>
    setPreset({ ...preset, [key]: v });

  const command = useMemo(
    () => previewCommand(settings.ffmpegPath, queue[0]?.name ?? "entrada.mp4", preset),
    [settings.ffmpegPath, queue, preset],
  );

  function addFiles(files: FileList | null) {
    if (!files) return;
    const items: QueueItem[] = Array.from(files).map((f) => ({
      id: uid(),
      name: f.name,
      sizeMB: +(f.size / 1024 / 1024).toFixed(1),
      status: "pendente",
      progress: 0,
    }));
    setQueue((q) => [...q, ...items]);
  }

  async function processQueue() {
    setRunning(true);
    for (const item of queue) {
      if (item.status === "concluido") continue;
      setQueue((q) =>
        q.map((i) => (i.id === item.id ? { ...i, status: "processando", progress: 5 } : i)),
      );
      try {
        if (desktop) {
          const out = `${preset.outputDir}/${item.name.replace(/\.[^.]+$/, "")}_edit.${preset.outputFormat}`;
          await runFfmpegLocal(buildFfmpegArgs(item.name, out, preset));
        } else {
          for (let p = 20; p <= 100; p += 20) {
            await new Promise((r) => setTimeout(r, 180));
            setQueue((q) => q.map((i) => (i.id === item.id ? { ...i, progress: p } : i)));
          }
        }
        setQueue((q) =>
          q.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  status: "concluido",
                  progress: 100,
                  message: desktop ? "Salvo em " + preset.outputDir : "Simulado (modo navegador)",
                }
              : i,
          ),
        );
      } catch (e) {
        setQueue((q) =>
          q.map((i) =>
            i.id === item.id
              ? { ...i, status: "erro", message: (e as Error).message, progress: 0 }
              : i,
          ),
        );
      }
    }
    setRunning(false);
  }

  function saveTemplate() {
    const name = window.prompt("Nome do template:");
    if (!name) return;
    setTemplates([
      { id: uid(), name, createdAt: new Date().toISOString(), preset },
      ...templates,
    ]);
  }

  return (
    <div className="mx-auto max-w-[1400px] px-10 py-9">
      <PageHeader
        title="Editor em massa"
        subtitle="Aplique um preset a vários vídeos de uma vez. O processamento usa o FFmpeg instalado na sua máquina."
        actions={
          <>
            <button
              onClick={saveTemplate}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3.5 py-2 text-sm hover:bg-secondary"
            >
              <Save className="size-4" /> Salvar template
            </button>
            <button
              onClick={processQueue}
              disabled={running || queue.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:brightness-110 disabled:opacity-40"
            >
              {running ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              Processar {queue.length > 0 ? `(${queue.length})` : ""}
            </button>
          </>
        }
      />

      {!desktop && (
        <div className="mb-6 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Modo navegador: a fila roda em simulação. Ao empacotar como aplicativo desktop, o
          comando FFmpeg abaixo é executado de verdade nos seus arquivos locais.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="space-y-6">
          <section className="panel p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Arquivos locais</h2>
              <button
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-xs hover:bg-secondary"
              >
                <FolderOpen className="size-3.5" /> Selecionar vídeos
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              multiple
              hidden
              onChange={(e) => addFiles(e.target.files)}
            />

            {queue.length === 0 ? (
              <div className="mt-5 grid place-items-center rounded-lg border border-dashed border-border py-14 text-center">
                <Sparkles className="size-5 text-primary/70" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Nenhum vídeo na fila. Selecione arquivos do seu computador.
                </p>
              </div>
            ) : (
              <ul className="mt-5 space-y-2">
                {queue.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-lg border border-border bg-secondary/30 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="truncate text-sm">{item.name}</span>
                      <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                        {item.sizeMB} MB
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-md px-2 py-0.5 text-[11px]",
                          item.status === "concluido" && "bg-success/15 text-success",
                          item.status === "processando" && "bg-primary/15 text-primary",
                          item.status === "erro" && "bg-destructive/15 text-destructive",
                          item.status === "pendente" && "bg-muted text-muted-foreground",
                        )}
                      >
                        {item.status}
                      </span>
                      <button
                        onClick={() => setQueue((q) => q.filter((i) => i.id !== item.id))}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    {item.progress > 0 && item.status !== "concluido" && (
                      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    )}
                    {item.message && (
                      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <CheckCircle2 className="size-3" /> {item.message}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel p-6">
            <div className="flex items-center gap-2">
              <Terminal className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">Comando FFmpeg gerado</h2>
            </div>
            <pre className="scrollbar-slim mt-4 overflow-x-auto rounded-lg bg-background/70 p-4 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
              {command}
            </pre>
          </section>

          <section className="panel p-6">
            <h2 className="text-sm font-semibold">Templates salvos</h2>
            {templates.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Nenhum template. Ajuste o preset e salve para reutilizar.
              </p>
            ) : (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {templates.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 px-4 py-3"
                  >
                    <span className="truncate text-sm">{t.name}</span>
                    <button
                      onClick={() => setPreset(t.preset)}
                      className="ml-auto shrink-0 rounded-md bg-primary/15 px-2 py-1 text-[11px] text-primary hover:bg-primary/25"
                    >
                      Aplicar
                    </button>
                    <button
                      onClick={() => setTemplates(templates.filter((x) => x.id !== t.id))}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="panel space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Preset de edição</h2>
              <button
                onClick={() => setPreset(DEFAULT_PRESET)}
                className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="size-3" /> Padrão
              </button>
            </div>

            <Field label="Proporção">
              <select
                className={inputCls}
                value={preset.aspect}
                onChange={(e) => set("aspect", e.target.value as EditorPreset["aspect"])}
              >
                <option value="9:16">9:16 vertical</option>
                <option value="1:1">1:1 quadrado</option>
                <option value="16:9">16:9 horizontal</option>
                <option value="original">Original</option>
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={`Velocidade ${preset.speed}x`}>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={preset.speed}
                  onChange={(e) => set("speed", +e.target.value)}
                  className="w-full accent-[var(--primary)]"
                />
              </Field>
              <Field label={`Zoom ${preset.zoom}%`}>
                <input
                  type="range"
                  min={0}
                  max={30}
                  value={preset.zoom}
                  onChange={(e) => set("zoom", +e.target.value)}
                  className="w-full accent-[var(--primary)]"
                />
              </Field>
              <Field label={`Brilho ${preset.brightness.toFixed(2)}`}>
                <input
                  type="range"
                  min={-0.3}
                  max={0.3}
                  step={0.01}
                  value={preset.brightness}
                  onChange={(e) => set("brightness", +e.target.value)}
                  className="w-full accent-[var(--primary)]"
                />
              </Field>
              <Field label={`Saturação ${preset.saturation.toFixed(2)}`}>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={preset.saturation}
                  onChange={(e) => set("saturation", +e.target.value)}
                  className="w-full accent-[var(--primary)]"
                />
              </Field>
              <Field label="Cortar início (s)">
                <input
                  type="number"
                  min={0}
                  className={inputCls}
                  value={preset.trimStart}
                  onChange={(e) => set("trimStart", +e.target.value)}
                />
              </Field>
              <Field label="Cortar fim (s)">
                <input
                  type="number"
                  min={0}
                  className={inputCls}
                  value={preset.trimEnd}
                  onChange={(e) => set("trimEnd", +e.target.value)}
                />
              </Field>
              <Field label="FPS">
                <input
                  type="number"
                  min={15}
                  max={60}
                  className={inputCls}
                  value={preset.fps}
                  onChange={(e) => set("fps", +e.target.value)}
                />
              </Field>
              <Field label="Qualidade (CRF)">
                <input
                  type="number"
                  min={16}
                  max={32}
                  className={inputCls}
                  value={preset.crf}
                  onChange={(e) => set("crf", +e.target.value)}
                />
              </Field>
            </div>

            <Field label="Marca d'água (texto)">
              <input
                className={inputCls}
                placeholder="@seuperfil"
                value={preset.watermarkText}
                onChange={(e) => set("watermarkText", e.target.value)}
              />
            </Field>

            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={preset.mirror}
                  onChange={(e) => set("mirror", e.target.checked)}
                  className="size-4 accent-[var(--primary)]"
                />
                Espelhar
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={preset.removeAudio}
                  onChange={(e) => set("removeAudio", e.target.checked)}
                  className="size-4 accent-[var(--primary)]"
                />
                Remover áudio
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Formato">
                <select
                  className={inputCls}
                  value={preset.outputFormat}
                  onChange={(e) =>
                    set("outputFormat", e.target.value as EditorPreset["outputFormat"])
                  }
                >
                  <option value="mp4">MP4</option>
                  <option value="mov">MOV</option>
                  <option value="webm">WEBM</option>
                </select>
              </Field>
              <Field label="Pasta de saída">
                <input
                  className={inputCls}
                  value={preset.outputDir}
                  onChange={(e) => set("outputDir", e.target.value)}
                />
              </Field>
            </div>
          </section>

          <section className="panel space-y-4 p-6">
            <h2 className="text-sm font-semibold">Ambiente local</h2>
            <Field label="Caminho do FFmpeg">
              <input
                className={inputCls}
                value={settings.ffmpegPath}
                onChange={(e) => setSettings({ ...settings, ffmpegPath: e.target.value })}
              />
            </Field>
            <Field label="Processos simultâneos">
              <input
                type="number"
                min={1}
                max={8}
                className={inputCls}
                value={settings.concurrency}
                onChange={(e) => setSettings({ ...settings, concurrency: +e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.keepOriginals}
                onChange={(e) => setSettings({ ...settings, keepOriginals: e.target.checked })}
                className="size-4 accent-[var(--primary)]"
              />
              Manter arquivos originais
            </label>
          </section>
        </aside>
      </div>
    </div>
  );
}
