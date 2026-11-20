import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export interface Entry {
  tag: string;
  value: string;
  note?: string | null;
  created_at: number;
}

export type Trigger = "tab" | "enter" | "space";

export interface Settings {
  prefix: string;
  trigger: Trigger;
  autostart: boolean;
}

export const defaultSettings: Settings = { prefix: ";", trigger: "tab", autostart: true };

/** Tauri penceresinde mi çalışıyoruz? Değilse (tarayıcıda geliştirme) sahte veri kullanılır. */
export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ---------------------------------------------------------------- tarayıcı (yalnızca geliştirme)

const TAGS_KEY = "kw-dev-tags";
const SETTINGS_KEY = "kw-dev-settings";

const seed: Entry[] = [
  { tag: "mail", value: "test@test.com", note: "Kişisel e-posta", created_at: 1 },
  { tag: "ip", value: "192.168.1.20", note: "Ev sunucusu", created_at: 2 },
  { tag: "wifi", value: "Cok-Gizli-Parola-123", note: null, created_at: 3 },
  {
    tag: "vpn",
    value: "vpn.sirket.example.com",
    note: "Şirket VPN adresi. Bağlanmadan önce yetkilendirme uygulamasından onay kodu alınmalı, kod 30 saniye geçerli, üç kez yanlış girilirse hesap 15 dakika kilitleniyor ve BT ekibiyle iletişime geçmek gerekiyor.",
    created_at: 4,
  },
  { tag: "iban", value: "TR00 0000 0000 0000 0000 0000 00", note: "Maaş hesabı", created_at: 5 },
];

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch { /* depolama yok */ }
  return fallback;
}

function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* depolama yok */ }
}

const devTags = () => read<Entry[]>(TAGS_KEY, seed);

async function devInvoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
  switch (cmd) {
    case "list_tags":
      return [...devTags()].sort((a, b) => a.tag.localeCompare(b.tag));
    case "save_tag": {
      const { original, tag, value, note } = args as { original?: string | null; tag: string; value: string; note?: string | null };
      const name = tag.trim().toLowerCase();
      if (!/^[a-z0-9_-]+$/.test(name)) throw "Tag yalnızca harf, rakam, '-' ve '_' içerebilir.";
      const all = devTags();
      if (all.some((e) => e.tag === name && e.tag !== original)) throw `'${name}' tag'i zaten var.`;
      const entry: Entry = { tag: name, value, note: note?.trim() ? note : null, created_at: Date.now() / 1000 };
      const i = all.findIndex((e) => e.tag === original);
      if (i >= 0) all[i] = entry; else all.push(entry);
      write(TAGS_KEY, all);
      return entry;
    }
    case "delete_tag":
      write(TAGS_KEY, devTags().filter((e) => e.tag !== args.tag));
      return null;
    case "get_settings":
      return read<Settings>(SETTINGS_KEY, defaultSettings);
    case "save_settings":
      write(SETTINGS_KEY, args.settings);
      return args.settings;
    default:
      throw `bilinmeyen komut: ${cmd}`;
  }
}

function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return (inTauri ? tauriInvoke(cmd, args) : devInvoke(cmd, args)) as Promise<T>;
}

// ---------------------------------------------------------------- komutlar

export const listTags = () => invoke<Entry[]>("list_tags");

export const saveTag = (args: { original?: string | null; tag: string; value: string; note?: string | null }) =>
  invoke<Entry>("save_tag", args);

export const deleteTag = (tag: string) => invoke<void>("delete_tag", { tag });

/** Uygulama sürümü (package.json). Tarayıcıda geliştirirken "dev". */
export async function getAppVersion(): Promise<string> {
  if (!inTauri) return "dev";
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return "";
  }
}

/** Panoya kopyalar. Tauri'de Rust üzerinden: pano geçmişine girmez. */
export async function copyText(text: string): Promise<void> {
  if (inTauri) await tauriInvoke("copy_text", { text });
  else await navigator.clipboard.writeText(text);
}

/** Windows'un kendi pencere öğelerinin (ör. sistem menüsü) temasını uygulamayla eşitler. */
export async function setWindowTheme(mode: "light" | "dark"): Promise<void> {
  if (!inTauri) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setTheme(mode);
  } catch {
    /* isteğe bağlı */
  }
}

export const getSettings =() => invoke<Settings>("get_settings");
export const saveSettings = (settings: Settings) => invoke<Settings>("save_settings", { settings });
