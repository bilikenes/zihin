import { useEffect, useRef } from "react";
import { mountWayglim } from "./engine.js";

type Mode = "light" | "dark";

const ASPECT = 16 / 9;
/** Yumuşak bir efekt olduğu için ekran çözünürlüğünün bir kısmında çizilir; GPU yükünü azaltır. */
const RENDER_SCALE = 0.6;

/** Pastel Glow: Tag'ler ekranında çapraz uzanan gül ve leylak ışığı (Wayglim ışık eğrisi). */
const PATH = [
  -.06, .94, -.0403, .9047, -.0206, .8693, -.0008, .834, .0191, .7991, .0394, .7647, .0601, .7312, .0814, .6988,
  .103, .6672, .1251, .6365, .1477, .6072, .1714, .5806, .1965, .5589, .2234, .5454, .2513, .5433, .279, .5511,
  .3062, .5629, .3336, .5725, .3616, .5748, .3893, .5683, .4164, .5555, .4428, .5392, .469, .5214, .495, .503,
  .5209, .4839, .5464, .4636, .5719, .4431, .5979, .4243, .6247, .4101, .6524, .4035, .6804, .4058, .708, .4133,
  .7358, .42, .7637, .419, .7907, .4059, .8152, .382, .8373, .3516, .8578, .3176, .8774, .2821, .8966, .2459,
  .9155, .2091, .934, .1717, .9521, .1337, .9698, .0952, .9875, .0565, 1.005, .0177, 1.0225, -.0212, 1.04, -.06,
];

const PARAMS = {
  balanceX: 0, balanceY: 0, cornerRadius: 12, curve: "line", curveDepth: 0, effectArea: "core",
  formRotate: 0, formRound: 35, formSize: 50, formSpin: 0, frameShape: "rect", inset: 0,
  grainAmount: 0, grainDistortion: 50, grainEnabled: false, grainDrift: 35, grainScale: 70, grainSoftness: 50,
  lens: { enabled: false }, lightTravel: 30, masks: [], masksEnabled: false, phase: 31,
  pointer: { enabled: false }, refraction: 41, secondaryMotion: 25, shading: 0, spectrum: "custom",
  speed: 3, spread: 62, surfaceGrain: false, wobble: 27,
  form: "path", mode: "halo", bend: 48, chromaSplit: 14, height: 43, glow: 42, saturation: 78, softness: 88,
  position: 56, path: PATH,
};

const SCENE = {
  pace: 0.21,
  startSeconds: 6,
  dark: { background: "#14111f", opacity: 0.57, colors: ["#df9fbe", "#b199f9", "#aa8dd7", "#ba97d4"] }, // ui-allow: shader ışık renkleri
  light: { background: "#ece8f6", opacity: 0.52, colors: ["#c188af", "#ad8dc9", "#9978b6", "#c199c8"] }, // ui-allow: shader ışık renkleri
} as const;

const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

/**
 * Sayfanın arkasında yavaşça akan ışık. Pencereye sabitlenir (içerikle kaymaz), tıklamaları yakalamaz.
 * Her pencere boyutunda ışık görünsün diye 16:9 çizim alanı alta hizalı "cover" ile yerleşir.
 * Azaltılmış hareket istenirse sabit kare gösterilir; WebGL yoksa tema zemini kalır.
 */
export function AnimatedBackground({ mode }: { mode: Mode }) {
  const stage = useRef<HTMLDivElement>(null);
  const art = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stageEl = stage.current;
    const artEl = art.current;
    if (!stageEl || !artEl) return;

    const place = () => {
      const w = stageEl.clientWidth;
      const h = stageEl.clientHeight;
      const bw = Math.max(w, h * ASPECT);
      const bh = bw / ASPECT;
      artEl.style.width = `${bw}px`;
      artEl.style.height = `${bh}px`;
      artEl.style.left = `${(w - bw) / 2}px`;
      artEl.style.top = `${h - bh}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(stageEl);

    const scene = SCENE[mode];
    const settings = {
      aspectRatio: ASPECT,
      background: toRgb(scene.background),
      durationSeconds: 60,
      maxPixelRatio: RENDER_SCALE,
      pace: SCENE.pace,
      startSeconds: SCENE.startSeconds,
      pauseOffscreen: true,
      respectReducedMotion: true,
      params: { ...PARAMS, customColors: scene.colors.map(toRgb) },
    };
    artEl.style.opacity = String(scene.opacity);

    let player: ReturnType<typeof mountWayglim> | null = null;
    try { player = mountWayglim(artEl, settings); } catch { /* WebGL 2 yoksa düz zemin kalır */ }
    // Pencere arka plandayken (başka uygulama ön planda ya da küçültülmüş) çizme.
    const sync = () => player?.setPaused(document.hidden || !document.hasFocus());
    sync();
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
      document.removeEventListener("visibilitychange", sync);
      observer.disconnect();
      player?.destroy();
    };
  }, [mode]);

  return (
    <div ref={stage} className="app-bgfx" aria-hidden="true">
      <div ref={art} className="app-bgfx-art" />
    </div>
  );
}
