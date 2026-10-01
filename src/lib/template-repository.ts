import { type TemplateVisual } from "./types";
import { readLocal, writeLocal, uid } from "./local-store";

export interface TemplateBackup {
  id: string;
  name: string;
  createdAt: string;
  formattedDate: string;
  fileName: string;
  template: TemplateVisual;
}

/**
 * Interface abstrata do repositório de templates.
 */
export interface TemplateRepository {
  /** Lista todos os templates disponíveis */
  listTemplates(): Promise<TemplateVisual[]>;

  /** Busca um template específico pelo nome ou identificador */
  getTemplate(nameOrId: string): Promise<TemplateVisual | null>;

  /** Salva ou atualiza um template na pasta nativa "templates" ou na pasta externa conectada */
  saveTemplate(template: TemplateVisual): Promise<void>;

  /** Remove um template */
  deleteTemplate(nameOrId: string, fileName?: string): Promise<void>;

  /** Salva um backup com carimbo de data/hora na pasta */
  saveBackup(template: TemplateVisual, customName?: string): Promise<TemplateBackup>;

  /** Lista todos os backups salvos */
  listBackups(): Promise<TemplateBackup[]>;

  /** Remove um backup */
  deleteBackup(backupId: string): Promise<void>;

  /** Baixa o arquivo de backup específico */
  downloadBackup(backup: TemplateBackup): void;

  /** Exporta template como arquivo JSON */
  exportTemplateFile(template: TemplateVisual): void;

  /** Importa template a partir de um arquivo JSON do computador */
  importTemplateFile(file: File): Promise<TemplateVisual>;
}

/**
 * IMPLEMENTAÇÃO:
 * - NATIVAMENTE: Salva e lê diretamente na pasta "templates" dentro do projeto (/api/templates).
 * - CASO QUEIRA MUDAR: Permite conectar a uma pasta externa do Windows via File System Access API.
 */
export class LocalFolderTemplateRepository implements TemplateRepository {
  private directoryHandle: FileSystemDirectoryHandle | null = null;
  private storageKey = "vlocal:templates_repository";
  private backupsKey = "vlocal:template_backups";

  /**
   * Conecta a uma pasta externa do computador (caso o usuário queira mudar de local).
   */
  async connectLocalFolder(): Promise<string | null> {
    if (typeof window === "undefined" || !("showDirectoryPicker" in window)) {
      return null;
    }

    try {
      const handle = await (window as any).showDirectoryPicker({
        mode: "readwrite",
        startIn: "documents",
      });
      this.directoryHandle = handle;
      return handle.name;
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.warn("Não foi possível acessar a pasta selecionada:", err);
      }
      return null;
    }
  }

  /**
   * Volta a usar a pasta nativa "templates" dentro do projeto.
   */
  disconnectExternalFolder(): void {
    this.directoryHandle = null;
  }

  isExternalFolderConnected(): boolean {
    return this.directoryHandle !== null;
  }

  getConnectedFolderName(): string {
    return this.directoryHandle ? this.directoryHandle.name : "templates (pasta do projeto)";
  }

  /**
   * Lista os templates.
   * Se houver pasta externa conectada, lê de lá;
   * Senão, lê nativamente da pasta "templates" do projeto via API local.
   */
  async listTemplates(): Promise<TemplateVisual[]> {
    // 1. Se o usuário conectou uma pasta externa específica do computador:
    if (this.directoryHandle) {
      const list: TemplateVisual[] = [];
      try {
        for await (const entry of (this.directoryHandle as any).values()) {
          if (entry.kind === "file" && entry.name.endsWith(".json") && !entry.name.startsWith("backup_")) {
            const file = await entry.getFile();
            const text = await file.text();
            try {
              const parsed = JSON.parse(text) as TemplateVisual;
              if (parsed && parsed.name && parsed.headline) {
                list.push(parsed);
              }
            } catch {}
          }
        }
      } catch (err) {
        console.warn("Erro ao ler da pasta externa:", err);
      }
      return list;
    }

    // 2. NATIVAMENTE: Busca da pasta "templates/" dentro do projeto via /api/templates
    try {
      const res = await fetch("/api/templates");
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.templates)) {
          writeLocal(this.storageKey, data.templates);
          return data.templates;
        }
      }
    } catch (apiErr) {
      console.warn("API nativa de templates inacessível, usando cache offline:", apiErr);
    }

    // Fallback cache local offline
    return readLocal<TemplateVisual[]>(this.storageKey, []);
  }

  async getTemplate(nameOrId: string): Promise<TemplateVisual | null> {
    const list = await this.listTemplates();
    const found = list.find((t) => t.name.toLowerCase() === nameOrId.toLowerCase());
    return found || null;
  }

  /**
   * Salva o template:
   * - Se pasta externa conectada: grava na pasta externa.
   * - Nativamente: grava no arquivo .json dentro da pasta "templates/" do projeto.
   */
  async saveTemplate(template: TemplateVisual): Promise<void> {
    // 1. Se pasta externa conectada
    if (this.directoryHandle) {
      try {
        const safeName = this.sanitizeFileName(template.name);
        const fileHandle = await this.directoryHandle.getFileHandle(`template_${safeName}.json`, {
          create: true,
        });
        const writable = await (fileHandle as any).createWritable();
        await writable.write(JSON.stringify(template, null, 2));
        await writable.close();
      } catch (err) {
        console.warn("Erro ao salvar na pasta externa:", err);
      }
      return;
    }

    // 2. NATIVAMENTE: Salva dentro da pasta "templates/" do projeto
    try {
      await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template }),
      });
    } catch (err) {
      console.warn("Falha ao salvar via API nativa, mantendo em cache local:", err);
    }

    // Mantém em cache seguro para carregamento instantâneo
    const cached = readLocal<TemplateVisual[]>(this.storageKey, []);
    const updated = [
      ...cached.filter((t) => t.name.toLowerCase() !== template.name.toLowerCase()),
      template,
    ];
    writeLocal(this.storageKey, updated);
  }

  async deleteTemplate(name: string, fileName?: string): Promise<void> {
    const safeName = this.sanitizeFileName(name);

    // 1. Se pasta externa
    if (this.directoryHandle) {
      try {
        if (fileName) {
          await this.directoryHandle.removeEntry(fileName);
        } else {
          await this.directoryHandle.removeEntry(`template_${safeName}.json`);
        }
      } catch (err) {
        console.warn("Erro ao excluir template da pasta externa:", err);
      }
    }

    // 2. Nativamente na pasta do projeto
    try {
      const queryParams = new URLSearchParams();
      if (name) queryParams.set("name", name);
      if (fileName) queryParams.set("file", fileName);

      await fetch(`/api/templates?${queryParams.toString()}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.warn("Erro ao excluir template via API nativa:", err);
    }

    const cached = readLocal<TemplateVisual[]>(this.storageKey, []);
    writeLocal(
      this.storageKey,
      cached.filter(
        (t) =>
          t.name.toLowerCase() !== name.toLowerCase() &&
          (!fileName || t.fileName !== fileName),
      ),
    );
  }

  /**
   * Salva o backup na pasta templates/ do projeto (ou na pasta externa).
   */
  async saveBackup(template: TemplateVisual, customName?: string): Promise<TemplateBackup> {
    const templateName = customName?.trim() || template.name || "Template";
    const safeName = this.sanitizeFileName(templateName);
    const now = new Date();
    const dateFormatted = `${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    const dateSlug = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fileName = `backup_${safeName}_${dateSlug}.json`;

    const backupObj: TemplateBackup = {
      id: uid(),
      name: templateName,
      createdAt: now.toISOString(),
      formattedDate: dateFormatted,
      fileName,
      template: { ...template, name: templateName },
    };

    // 1. Se pasta externa conectada
    if (this.directoryHandle) {
      try {
        const fileHandle = await this.directoryHandle.getFileHandle(fileName, { create: true });
        const writable = await (fileHandle as any).createWritable();
        await writable.write(JSON.stringify(backupObj, null, 2));
        await writable.close();
      } catch (err) {
        console.warn("Erro ao salvar backup na pasta externa:", err);
      }
    } else {
      // 2. NATIVAMENTE: Salva como arquivo .json dentro de templates/
      try {
        await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template,
            name: templateName,
            isBackup: true,
          }),
        });
      } catch (err) {
        console.warn("Erro ao salvar backup via API nativa:", err);
      }
    }

    // Salva em cache
    const backups = readLocal<TemplateBackup[]>(this.backupsKey, []);
    writeLocal(this.backupsKey, [backupObj, ...backups]);

    // Garante que o template também esteja salvo
    await this.saveTemplate({ ...template, name: templateName });

    return backupObj;
  }

  async listBackups(): Promise<TemplateBackup[]> {
    if (this.directoryHandle) {
      const list: TemplateBackup[] = [];
      try {
        for await (const entry of (this.directoryHandle as any).values()) {
          if (entry.kind === "file" && entry.name.startsWith("backup_") && entry.name.endsWith(".json")) {
            const file = await entry.getFile();
            const text = await file.text();
            try {
              const parsed = JSON.parse(text);
              if (parsed && parsed.template) {
                list.push(parsed);
              }
            } catch {}
          }
        }
      } catch {}
      return list;
    }

    // Nativamente busca da pasta templates/
    try {
      const res = await fetch("/api/templates");
      if (res.ok) {
        const data = await res.json();
        if (data.backups && Array.isArray(data.backups) && data.backups.length > 0) {
          return data.backups;
        }
      }
    } catch {}

    return readLocal<TemplateBackup[]>(this.backupsKey, []);
  }

  async deleteBackup(backupIdOrFileName: string): Promise<void> {
    if (this.directoryHandle) {
      try {
        await this.directoryHandle.removeEntry(backupIdOrFileName);
      } catch {}
    } else {
      try {
        await fetch(`/api/templates?name=${encodeURIComponent(backupIdOrFileName)}`, {
          method: "DELETE",
        });
      } catch {}
    }

    const backups = readLocal<TemplateBackup[]>(this.backupsKey, []);
    writeLocal(
      this.backupsKey,
      backups.filter((b) => b.id !== backupIdOrFileName && b.fileName !== backupIdOrFileName),
    );
  }

  downloadBackup(backup: TemplateBackup): void {
    const jsonStr = JSON.stringify(backup.template, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = backup.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  exportTemplateFile(template: TemplateVisual): void {
    const jsonStr = JSON.stringify(template, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = this.sanitizeFileName(template.name);
    a.href = url;
    a.download = `template_${safeName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async importTemplateFile(file: File): Promise<TemplateVisual> {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const templateData: TemplateVisual = parsed.template ? parsed.template : parsed;
    if (!templateData || !templateData.headline) {
      throw new Error("Arquivo de template inválido.");
    }
    await this.saveTemplate(templateData);
    return templateData;
  }

  private sanitizeFileName(name: string): string {
    const clean = name
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, "_")
      .toLowerCase();
    return clean.replace(/^template_/, "");
  }
}

/**
 * Repositório preparado para banco de dados futuro.
 */
export class DatabaseTemplateRepository implements TemplateRepository {
  constructor(
    private apiUrl: string = "/api/templates",
    private authToken?: string,
  ) {}

  async listTemplates(): Promise<TemplateVisual[]> {
    const res = await fetch(this.apiUrl, { headers: this.getHeaders() });
    if (!res.ok) throw new Error("Erro ao buscar templates do banco.");
    return res.json();
  }

  async getTemplate(nameOrId: string): Promise<TemplateVisual | null> {
    const res = await fetch(`${this.apiUrl}/${encodeURIComponent(nameOrId)}`, { headers: this.getHeaders() });
    if (res.status === 404) return null;
    return res.json();
  }

  async saveTemplate(template: TemplateVisual): Promise<void> {
    await fetch(this.apiUrl, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(template),
    });
  }

  async deleteTemplate(nameOrId: string): Promise<void> {
    await fetch(`${this.apiUrl}/${encodeURIComponent(nameOrId)}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });
  }

  async saveBackup(template: TemplateVisual, customName?: string): Promise<TemplateBackup> {
    const res = await fetch(`${this.apiUrl}/backup`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ template, name: customName }),
    });
    return res.json();
  }

  async listBackups(): Promise<TemplateBackup[]> {
    const res = await fetch(`${this.apiUrl}/backups`, { headers: this.getHeaders() });
    return res.json();
  }

  async deleteBackup(backupId: string): Promise<void> {
    await fetch(`${this.apiUrl}/backup/${encodeURIComponent(backupId)}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });
  }

  downloadBackup(backup: TemplateBackup): void {
    const blob = new Blob([JSON.stringify(backup.template, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = backup.fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  exportTemplateFile(template: TemplateVisual): void {
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `template_${template.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async importTemplateFile(file: File): Promise<TemplateVisual> {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const templateData: TemplateVisual = parsed.template || parsed;
    await this.saveTemplate(templateData);
    return templateData;
  }

  private getHeaders(): HeadersInit {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.authToken) headers["Authorization"] = `Bearer ${this.authToken}`;
    return headers;
  }
}

export const templateRepository = new LocalFolderTemplateRepository();
