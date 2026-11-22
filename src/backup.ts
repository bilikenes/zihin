import type { Entry, ImportItem } from "./api";

/** Yedek dosyaları: JSON (`[{tag, value, note}]`) ve CSV (`tag,value,note`). */

const stamp = () => new Date().toISOString().slice(0, 10);

export const backupFileName = (ext: "json" | "csv") => `zihin-yedek-${stamp()}.${ext}`;

const toItems = (entries: Entry[]): ImportItem[] => entries.map((e) => ({ tag: e.tag, value: e.value, note: e.note ?? "" }));

export const toJson = (entries: Entry[]) => JSON.stringify(toItems(entries), null, 2);

const csvCell = (s: string) => (/[",;\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Excel'in Türkçe karakterleri doğru açması için başına BOM konur. */
export const toCsv = (entries: Entry[]) =>
  "﻿" +
  ["tag,value,note", ...toItems(entries).map((e) => [e.tag, e.value, e.note ?? ""].map(csvCell).join(","))].join("\r\n") +
  "\r\n";

/** Tarayıcı üzerinden dosya indirir (Tauri/WebView2'de kaydet penceresi açılır). */
export function downloadFile(name: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------------------------------------------------------------- içe aktarma

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

function parseJson(text: string): ImportItem[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw "Dosya geçerli bir JSON değil.";
  }
  const list = Array.isArray(data) ? data : (data as { tags?: unknown } | null)?.tags;
  if (!Array.isArray(list)) throw "JSON bir tag listesi olmalı: [{ \"tag\": \"...\", \"value\": \"...\" }].";
  return list.map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return { tag: str(o.tag), value: str(o.value), note: str(o.note) };
  });
}

/** Tırnaklı alanları, tırnak içindeki satır sonlarını ve `""` kaçışını destekleyen CSV okuyucu. */
function csvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function parseCsv(text: string): ImportItem[] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
  const rows = csvRows(text, delimiter);
  if (rows.length === 0) throw "CSV dosyası boş.";
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const hasHeader = header.includes("tag");
  const [ti, vi, ni] = hasHeader ? [col("tag"), col("value", "değer", "deger"), col("note", "not")] : [0, 1, 2];
  if (ti < 0 || vi < 0) throw "CSV'de 'tag' ve 'value' sütunları bulunamadı.";
  return rows.slice(hasHeader ? 1 : 0).map((r) => ({ tag: r[ti] ?? "", value: r[vi] ?? "", note: ni >= 0 ? (r[ni] ?? "") : "" }));
}

/** Dosya içeriğini uzantısına göre okur. Hata durumunda okunabilir bir metin fırlatır. */
export function parseBackup(text: string, fileName: string): ImportItem[] {
  const clean = text.replace(/^﻿/, "");
  const items = /\.csv$/i.test(fileName) ? parseCsv(clean) : parseJson(clean);
  if (items.length === 0) throw "Dosyada içe aktarılacak tag yok.";
  return items;
}
