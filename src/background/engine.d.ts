export interface WayglimPlayer { destroy(): void; setPaused(paused: boolean): void }
export function mountWayglim(container: HTMLElement, settings: unknown): WayglimPlayer;
