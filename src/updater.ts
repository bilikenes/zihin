// Otomatik güncelleme: açıldıktan kısa süre sonra ve sonra düzenli aralıklarla GitHub Releases'teki
// latest.json'a bakar. İmza (tauri.conf.json > plugins.updater.pubkey) doğrulanmadan hiçbir güncelleme kurulmaz.
// Uygulama tray'de günlerce açık kaldığı için denetim yalnızca açılışta değil, periyodik de yapılır.
import { useCallback, useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "latest" }
  | { kind: "available"; version: string }
  | { kind: "downloading"; percent: number | null }
  | { kind: "error"; during: "check" | "install" };

const FIRST_CHECK_DELAY_MS = 4000;
const RECHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/** Güncelleme durumunu tek satırlık metne çevirir. */
export function updateLabel(state: UpdateState): string | null {
  switch (state.kind) {
    case "checking":
      return "Denetleniyor…";
    case "latest":
      return "En güncel sürümü kullanıyorsun.";
    case "available":
      return `Yeni sürüm hazır: ${state.version}`;
    case "downloading":
      return state.percent === null ? "İndiriliyor…" : `İndiriliyor · %${state.percent}`;
    case "error":
      return state.during === "check"
        ? "Güncelleme denetlenemedi. İnternet bağlantını kontrol et."
        : "Güncelleme kurulamadı. Daha sonra tekrar dene.";
    default:
      return null;
  }
}

/** Yalnızca geliştirmede: `?update=available|downloading|latest|error` ile arayüz durumunu önizler. */
function demoState(): UpdateState | null {
  if (!import.meta.env.DEV) return null;
  switch (new URLSearchParams(window.location.search).get("update")) {
    case "available": return { kind: "available", version: "0.2.0" };
    case "downloading": return { kind: "downloading", percent: 42 };
    case "latest": return { kind: "latest" };
    case "error": return { kind: "error", during: "check" };
    default: return null;
  }
}

/** `enabled` false ise (tarayıcıda geliştirirken) hiçbir şey yapılmaz. */
export function useUpdater(enabled: boolean) {
  const [state, setState] = useState<UpdateState>(() => demoState() ?? { kind: "idle" });
  const pending = useRef<Update | null>(null);
  const busy = useRef(false);

  /** silent: otomatik denetimde ağ hatası vb. kullanıcıya gösterilmez. */
  const runCheck = useCallback(
    async (silent: boolean) => {
      if (!enabled || busy.current) return;
      busy.current = true;
      if (!silent) setState({ kind: "checking" });
      try {
        const update = await check();
        pending.current = update;
        if (update) setState({ kind: "available", version: update.version });
        else if (!silent) setState({ kind: "latest" });
        else setState((s) => (s.kind === "available" ? s : { kind: "idle" }));
      } catch (err) {
        console.warn("Güncelleme denetimi başarısız:", err);
        setState((s) => (silent ? (s.kind === "available" ? s : { kind: "idle" }) : { kind: "error", during: "check" }));
      } finally {
        busy.current = false;
      }
    },
    [enabled],
  );

  const install = useCallback(async () => {
    const update = pending.current;
    if (!update || busy.current) return;
    busy.current = true;
    let total = 0;
    let done = 0;
    setState({ kind: "downloading", percent: null });
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        else if (event.event === "Progress") {
          done += event.data.chunkLength;
          setState({ kind: "downloading", percent: total ? Math.min(100, Math.round((done / total) * 100)) : null });
        }
      });
      // Windows'ta kurulum programı uygulamayı kendisi kapatıp yeniden açar; diğer durumlarda yeniden başlat.
      await relaunch();
    } catch (err) {
      console.error("Güncelleme kurulamadı:", err);
      setState({ kind: "error", during: "install" });
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled || import.meta.env.DEV) return;
    const first = window.setTimeout(() => void runCheck(true), FIRST_CHECK_DELAY_MS);
    const repeat = window.setInterval(() => void runCheck(true), RECHECK_EVERY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(repeat);
    };
  }, [enabled, runCheck]);

  return { state, checkNow: () => runCheck(false), install };
}
