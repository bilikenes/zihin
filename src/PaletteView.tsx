import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft } from "lucide-react";
import { SearchField } from "./ui";
import { defaultSettings, getSettings, inTauri, listTags, paletteClose, palettePaste, type Entry } from "./api";
import { useTheme } from "./useTheme";

/** Sorguya uyan tag'leri en iyiden başlayarak sıralar: tam eşleşme, önek, tag içinde geçen, not içinde geçen. */
export function rankEntries(entries: Entry[], query: string): Entry[] {
  const q = query.trim().toLowerCase().replace(/^[^a-z0-9_-]+/, "");
  if (!q) return entries;
  const score = (e: Entry) => {
    if (e.tag === q) return 0;
    if (e.tag.startsWith(q)) return 1;
    if (e.tag.includes(q)) return 2;
    if ((e.note ?? "").toLowerCase().includes(q)) return 3;
    return -1;
  };
  return entries
    .map((e) => ({ e, s: score(e) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || a.e.tag.localeCompare(b.e.tag))
    .map((x) => x.e);
}

/** Genel kısayolla açılan küçük arama penceresi: tag ara, Enter ile açık uygulamaya yapıştır. */
export function PaletteView() {
  useTheme();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [prefix, setPrefix] = useState(defaultSettings.prefix);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const results = useMemo(() => rankEntries(entries, query), [entries, query]);

  const reset = useCallback(() => {
    setQuery("");
    setActive(0);
    void listTags().then(setEntries).catch(() => setEntries([]));
    void getSettings().then((s) => setPrefix(s.prefix)).catch(() => {});
    window.setTimeout(() => input.current?.focus(), 30);
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("is-palette");
    reset();
    if (!inTauri) return;
    let off: (() => void) | undefined;
    let gone = false;
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen("palette-open", reset).then((un) => (gone ? un() : (off = un))),
    );
    return () => { gone = true; off?.(); };
  }, [reset]);

  // Seçili satır görünür kalsın.
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, results]);

  const choose = (entry: Entry | undefined) => {
    if (entry) void palettePaste(entry.tag);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(results[active]); }
    else if (e.key === "Escape") { e.preventDefault(); void paletteClose(); }
  };

  return (
    <div className="app-palette" onKeyDown={onKeyDown}>
      <SearchField
        ref={input}
        value={query}
        onValueChange={(v) => { setQuery(v); setActive(0); }}
        placeholder="Tag veya not ara"
        aria-label="Tag ara"
        autoComplete="off"
        spellCheck={false}
      />
      <div className="app-palette-list" ref={list} role="listbox" aria-label="Tag'ler">
        {results.length === 0 ? (
          <p className="app-palette-empty">{entries.length === 0 ? "Henüz tag yok." : "Eşleşen tag yok."}</p>
        ) : (
          results.map((r, i) => (
            <button
              key={r.tag}
              type="button"
              role="option"
              aria-selected={i === active}
              data-index={i}
              className="app-palette-item"
              onMouseMove={() => i !== active && setActive(i)}
              onClick={() => choose(r)}
            >
              <strong>{prefix}{r.tag}</strong>
              <span className="app-palette-note">{r.note ?? ""}</span>
              {i === active && <CornerDownLeft size={14} aria-hidden="true" />}
            </button>
          ))
        )}
      </div>
      <p className="app-palette-hint">↑ ↓ seç · Enter yapıştır · Esc kapat</p>
    </div>
  );
}
