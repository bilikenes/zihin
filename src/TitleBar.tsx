import { useEffect, useState } from "react";
import { Copy, Minus, Square, X } from "lucide-react";

/** Windows'un kendi çubuğu yerine: sayfayla aynı zeminde, yalnızca pencere düğmeleri olan çubuk. */
export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let off: (() => void) | undefined;
    let disposed = false;
    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      const sync = async () => { if (!disposed) setMaximized(await win.isMaximized()); };
      await sync();
      const un = await win.onResized(() => { void sync(); });
      if (disposed) un(); else off = un;
    })();
    return () => { disposed = true; off?.(); };
  }, []);

  const run = (action: "minimize" | "toggleMaximize" | "close") => async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    if (action === "minimize") await win.minimize();
    else if (action === "toggleMaximize") await win.toggleMaximize();
    else await win.close();
  };

  return (
    <div className="app-titlebar" data-tauri-drag-region>
      <div className="app-titlebar-controls">
        <button type="button" className="app-titlebar-btn" aria-label="Küçült" onClick={run("minimize")}>
          <Minus size={16} />
        </button>
        <button
          type="button"
          className="app-titlebar-btn"
          aria-label={maximized ? "Önceki boyut" : "Büyüt"}
          onClick={run("toggleMaximize")}
        >
          {maximized ? <Copy size={13} /> : <Square size={13} />}
        </button>
        <button type="button" className="app-titlebar-btn is-close" aria-label="Kapat" onClick={run("close")}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
