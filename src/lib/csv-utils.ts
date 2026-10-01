import { type FollowerSnapshot, type Platform, type SocialPage } from "./types";
import { uid } from "./local-store";

export interface CsvImportResult {
  success: boolean;
  pagesCreated: number;
  snapshotsAdded: number;
  errors: string[];
}

/**
 * Converte os dados do Dashboard para formato CSV para exportação.
 */
export function exportToCsv(pages: SocialPage[], history: FollowerSnapshot[]): string {
  const headers = ["data", "nome", "plataforma", "usuario", "tipo", "seguidores"];
  const rows: string[] = [headers.join(",")];

  // Ordena por data e por nome
  const sortedHistory = [...history].sort((a, b) => a.date.localeCompare(b.date));

  for (const snap of sortedHistory) {
    const page = pages.find((p) => p.id === snap.pageId);
    if (!page) continue;

    const row = [
      snap.date,
      escapeCsvField(page.name || page.handle),
      page.platform,
      escapeCsvField(page.handle),
      page.isCompetitor ? "concorrente" : "minha_pagina",
      snap.followers,
    ];
    rows.push(row.join(","));
  }

  return rows.join("\n");
}

/**
 * Dispara o download de um arquivo CSV no navegador.
 */
export function triggerCsvDownload(csvContent: string, filename = "dashboard_seguidores.csv") {
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Importa dados a partir de uma string CSV no formato:
 * data,nome,plataforma,seguidores
 * (também tolera colunas extras como usuario, tipo).
 */
export function importFromCsv(
  csvText: string,
  existingPages: SocialPage[],
  existingHistory: FollowerSnapshot[],
  defaultIsCompetitor = false,
): {
  updatedPages: SocialPage[];
  updatedHistory: FollowerSnapshot[];
  result: CsvImportResult;
} {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const errors: string[] = [];
  if (lines.length === 0) {
    return {
      updatedPages: existingPages,
      updatedHistory: existingHistory,
      result: { success: false, pagesCreated: 0, snapshotsAdded: 0, errors: ["Arquivo CSV vazio."] },
    };
  }

  let startIndex = 0;
  let colIndex = {
    date: 0,
    name: 1,
    platform: 2,
    followers: 3,
    handle: -1,
    type: -1,
  };

  // Verifica se a primeira linha é cabeçalho
  const firstLine = lines[0];
  if (!firstLine) {
    return {
      updatedPages: existingPages,
      updatedHistory: existingHistory,
      result: { success: false, pagesCreated: 0, snapshotsAdded: 0, errors: [] },
    };
  }
  const headerLine = firstLine.toLowerCase();
  if (
    headerLine.includes("data") ||
    headerLine.includes("date") ||
    headerLine.includes("nome") ||
    headerLine.includes("seguidores")
  ) {
    startIndex = 1;
    const cols = headerLine.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
    colIndex = {
      date: cols.findIndex((c) => c.includes("data") || c.includes("date")),
      name: cols.findIndex((c) => c.includes("nome") || c.includes("name") || c.includes("pagina")),
      platform: cols.findIndex((c) => c.includes("plataforma") || c.includes("platform")),
      followers: cols.findIndex((c) => c.includes("seguidores") || c.includes("followers")),
      handle: cols.findIndex((c) => c.includes("usuario") || c.includes("handle") || c.includes("@")),
      type: cols.findIndex((c) => c.includes("tipo") || c.includes("type")),
    };

    if (colIndex.date === -1) colIndex.date = 0;
    if (colIndex.name === -1) colIndex.name = 1;
    if (colIndex.platform === -1) colIndex.platform = 2;
    if (colIndex.followers === -1) colIndex.followers = 3;
  }

  const pagesMap = new Map<string, SocialPage>();
  existingPages.forEach((p) => {
    pagesMap.set(p.name.toLowerCase(), p);
    pagesMap.set(p.handle.toLowerCase(), p);
  });

  const newPages: SocialPage[] = [...existingPages];
  const newHistory: FollowerSnapshot[] = [...existingHistory];

  let pagesCreated = 0;
  let snapshotsAdded = 0;

  for (let i = startIndex; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine) continue;
    const cells = parseCsvLine(rawLine);
    if (cells.length < 3) continue;

    const dateVal = cleanDate(cells[colIndex.date] || "");
    const nameVal = (cells[colIndex.name] || "").trim();
    const platVal = normalizePlatform(cells[colIndex.platform] || "instagram");
    const followersVal = parseInt(
      (cells[colIndex.followers] || "").replace(/\D/g, ""),
      10,
    );
    const handleCell = colIndex.handle !== -1 ? cells[colIndex.handle] : undefined;
    const handleVal = handleCell
      ? handleCell.trim().replace(/^@/, "")
      : nameVal.toLowerCase().replace(/\s+/g, "_").replace(/^@/, "");

    const typeCell = colIndex.type !== -1 ? cells[colIndex.type] : undefined;
    const isComp = typeCell
      ? typeCell.toLowerCase().includes("concorrente")
      : defaultIsCompetitor;

    if (!nameVal || isNaN(followersVal)) {
      errors.push(`Linha ${i + 1}: dados incompletos ou seguidores inválidos.`);
      continue;
    }

    if (!dateVal) {
      errors.push(`Linha ${i + 1}: formato de data inválido.`);
      continue;
    }

    // Procura página existente
    let page = pagesMap.get(nameVal.toLowerCase()) || pagesMap.get(handleVal.toLowerCase());

    if (page) {
      // Atualiza página existente
      page.updatedAt = new Date().toISOString();
    } else {
      // Se for concorrente e já tiver 10 concorrentes, valida
      const existingCompetitors = newPages.filter((p) => p.isCompetitor);
      if (isComp && existingCompetitors.length >= 10) {
        errors.push(`Linha ${i + 1}: limite máximo de 10 concorrentes atingido. Página '${nameVal}' não adicionada.`);
        continue;
      }

      // Cria nova página
      page = {
        id: uid(),
        name: nameVal,
        handle: handleVal,
        platform: platVal,
        isCompetitor: isComp,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      newPages.push(page);
      pagesMap.set(page.name.toLowerCase(), page);
      pagesMap.set(page.handle.toLowerCase(), page);
      pagesCreated++;
    }

    // Adiciona ou atualiza snapshot para a data
    const existingSnapIndex = newHistory.findIndex(
      (h) => h.pageId === page!.id && h.date === dateVal,
    );

    if (existingSnapIndex >= 0) {
      const prevSnap = newHistory[existingSnapIndex];
      if (prevSnap) {
        newHistory[existingSnapIndex] = {
          ...prevSnap,
          followers: followersVal,
        };
      }
      snapshotsAdded++;
    } else {
      newHistory.push({
        id: uid(),
        pageId: page.id,
        date: dateVal,
        followers: followersVal,
      });
      snapshotsAdded++;
    }
  }

  return {
    updatedPages: newPages,
    updatedHistory: newHistory,
    result: {
      success: snapshotsAdded > 0 || pagesCreated > 0,
      pagesCreated,
      snapshotsAdded,
      errors,
    },
  };
}

function parseCsvLine(text: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(cur.trim().replace(/^["']|["']$/g, ""));
      cur = "";
    } else {
      cur += char;
    }
  }
  result.push(cur.trim().replace(/^["']|["']$/g, ""));
  return result;
}

function escapeCsvField(val?: string | null): string {
  if (!val) return "";
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function normalizePlatform(val: string): Platform {
  const clean = val.toLowerCase().trim();
  if (clean.includes("face") || clean.includes("fb")) return "facebook";
  if (clean.includes("tik")) return "tiktok";
  if (clean.includes("you")) return "youtube";
  if (clean.includes("kwai")) return "kwai";
  return "instagram";
}

function cleanDate(val: string): string | null {
  const trimmed = val.trim();
  // Se for DD/MM/AAAA
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split("/");
    return `${y}-${m}-${d}`;
  }
  // Se for AAAA-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}
