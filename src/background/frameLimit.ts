/**
 * Hareketli arka plan motorunun (engine.js) gördüğü `window`. Motor kodu değiştirilmeden yalnızca
 * requestAnimationFrame / cancelAnimationFrame sınırlanır: efekt çok yavaş aktığı için 30 kare/sn
 * gözle ayırt edilmez, ama GPU yükü yenileme hızından bağımsız olarak yarıya iner (144 Hz'de çok daha fazla).
 */
const MIN_FRAME_MS = 27; // 60 Hz'de 2 kare (33 ms), 144 Hz'de 4 kare (28 ms) atlar

let nextId = 1;
const live = new Map<number, number>();
let lastRun = 0;

function limitedRequest(callback: FrameRequestCallback): number {
  const id = nextId++;
  const tick: FrameRequestCallback = (time) => {
    if (time - lastRun < MIN_FRAME_MS) {
      live.set(id, window.requestAnimationFrame(tick));
      return;
    }
    lastRun = time;
    live.delete(id);
    callback(time);
  };
  live.set(id, window.requestAnimationFrame(tick));
  return id;
}

function limitedCancel(id: number) {
  const real = live.get(id);
  if (real !== undefined) window.cancelAnimationFrame(real);
  live.delete(id);
}

export const limitedWindow: Window = new Proxy(window, {
  get(target, prop) {
    if (prop === "requestAnimationFrame") return limitedRequest;
    if (prop === "cancelAnimationFrame") return limitedCancel;
    const value = Reflect.get(target, prop, target);
    return typeof value === "function" ? value.bind(target) : value;
  },
});
