import { useEffect, useRef } from "react";
import poster from "./assets/sidebar-squirrel-poster.webp";
import animation from "./assets/sidebar-squirrel.webm";

export function SidebarSquirrel() {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const player = video.current;
    if (!player) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      if (reducedMotion.matches || document.hidden || !document.hasFocus()) {
        player.pause();
      } else {
        void player.play().catch(() => {});
      }
    };

    sync();
    reducedMotion.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    return () => {
      reducedMotion.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
      player.pause();
    };
  }, []);

  return (
    <video
      ref={video}
      className="app-sidebar-squirrel"
      src={animation}
      poster={poster}
      aria-hidden="true"
      muted
      loop
      playsInline
      preload="none"
    />
  );
}
