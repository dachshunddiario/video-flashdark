import { useState, useRef } from "react";
import { Upload, Download, FileText, CheckCircle2, AlertTriangle, FileSpreadsheet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exportToCsv, importFromCsv, triggerCsvDownload, type CsvImportResult } from "@/lib/csv-utils";
import { type FollowerSnapshot, type SocialPage } from "@/lib/types";

interface ImportExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: SocialPage[];
  history: FollowerSnapshot[];
  onImportComplete: (updatedPages: SocialPage[], updatedHistory: FollowerSnapshot[]) => void;
}

export function ImportExportModal({
  open,
  onOpenChange,
  pages,
  history,
  onImportComplete,
}: ImportExportModalProps) {
  const [csvText, setCsvText] = useState("");
  const [defaultIsCompetitor, setDefaultIsCompetitor] = useState(false);
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setCsvText(content);
        executeImport(content);
      }
    };
    reader.readAsText(file);
  };

  const executeImport = (textToImport: string) => {
    const { updatedPages, updatedHistory, result } = importFromCsv(
      textToImport,
      pages,
      history,
      defaultIsCompetitor,
    );

    setImportResult(result);
    if (result.success) {
      onImportComplete(updatedPages, updatedHistory);
    }
  };

  const handleExport = () => {
    const csvData = exportToCsv(pages, history);
    const today = new Date().toISOString().slice(0, 10);
    triggerCsvDownload(csvData, `dashboard_seguidores_${today}.csv`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Importar e Exportar Dados</DialogTitle>
          <DialogDescription>
            Faça backup ou importe dados em massa através de arquivos CSV, 100% no seu dispositivo.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="import" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="import" className="flex items-center gap-2">
              <Upload className="size-4" /> Importar Dados
            </TabsTrigger>
            <TabsTrigger value="export" className="flex items-center gap-2">
              <Download className="size-4" /> Exportar Dados
            </TabsTrigger>
          </TabsList>

          {/* TAB: IMPORTAÇÃO */}
          <TabsContent value="import" className="space-y-4 pt-3">
            <div className="rounded-lg border border-border/70 bg-secondary/30 p-3 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground mb-1 flex items-center gap-1.5">
                <FileSpreadsheet className="size-3.5 text-primary" /> Formato CSV Suportado:
              </p>
              <code className="block rounded bg-background/80 px-2 py-1.5 font-mono text-[11px] text-foreground border border-border/40 mt-1">
                data,nome,plataforma,seguidores
              </code>
              <p className="mt-1 text-[11px]">
                Exemplo: <code>2026-09-22,Dachshund Diário,instagram,25430</code>
              </p>
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-dashed py-6 flex flex-col gap-1 items-center justify-center"
              >
                <Upload className="size-5 text-primary" />
                <span className="text-xs font-medium">Selecionar arquivo .CSV do computador</span>
              </Button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                <span>Ou cole o texto CSV diretamente:</span>
              </label>
              <textarea
                className="h-28 w-full rounded-lg border border-input bg-secondary/30 p-2.5 font-mono text-xs outline-none focus:border-primary/60"
                placeholder="data,nome,plataforma,seguidores&#10;2026-09-22,Minha Página,instagram,15200"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={defaultIsCompetitor}
                onChange={(e) => setDefaultIsCompetitor(e.target.checked)}
                className="size-3.5 accent-[var(--primary)]"
              />
              Importar novas páginas como concorrentes (limite de até 10)
            </label>

            {importResult && (
              <div
                className={`rounded-lg border p-3 text-xs ${
                  importResult.success
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                }`}
              >
                <div className="flex items-center gap-2 font-medium">
                  {importResult.success ? (
                    <CheckCircle2 className="size-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="size-4 shrink-0" />
                  )}
                  <span>
                    {importResult.success
                      ? `Importação concluída! ${importResult.snapshotsAdded} medições salvas e ${importResult.pagesCreated} páginas criadas.`
                      : "Erro ao importar dados."}
                  </span>
                </div>
                {importResult.errors.length > 0 && (
                  <ul className="mt-2 list-disc pl-4 space-y-0.5 text-[11px] opacity-90">
                    {importResult.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <Button
              type="button"
              className="w-full"
              disabled={!csvText.trim()}
              onClick={() => executeImport(csvText)}
            >
              <Upload className="mr-2 size-4" /> Processar Importação
            </Button>
          </TabsContent>

          {/* TAB: EXPORTAÇÃO */}
          <TabsContent value="export" className="space-y-4 pt-3">
            <div className="rounded-lg border border-border bg-secondary/30 p-4 text-xs space-y-2">
              <p className="font-semibold text-foreground">Resumo dos dados para exportação:</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>• {pages.length} páginas cadastradas (próprias e concorrentes)</li>
                <li>• {history.length} registros históricos de seguidores</li>
                <li>• Formato compatível com Excel, Google Planilhas e reimportação</li>
              </ul>
            </div>

            <Button
              type="button"
              onClick={handleExport}
              className="w-full py-5"
            >
              <Download className="mr-2 size-4" /> Baixar Arquivo CSV Completo
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
