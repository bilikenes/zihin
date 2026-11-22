import { useState } from "react";
import { Button } from "./ui";

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph"]);

/** `KeyboardEvent.code` → kısayol metnindeki tuş adı ("KeyK" → "K", "ArrowUp" → "Up"). */
function keyName(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Arrow")) return code.slice(5);
  return code;
}

/** Tuş vuruşunu "Ctrl+Shift+Alt+Space" biçimine çevirir; yalnızca değiştirici basılıysa `null`. */
export function hotkeyFromEvent(e: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey">): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const mods = [e.ctrlKey && "Ctrl", e.shiftKey && "Shift", e.altKey && "Alt", e.metaKey && "Super"].filter(Boolean);
  return [...mods, keyName(e.code)].join("+");
}

const hasModifier = (hotkey: string) => hotkey.includes("+");

/** Ekranda okunaklı gösterim: "Ctrl + Shift + Alt + Boşluk". */
export const formatHotkey = (hotkey: string) =>
  hotkey.split("+").map((p) => (p === "Space" ? "Boşluk" : p === "Super" ? "Win" : p)).join(" + ");

/** Tıkla, tuş kombinasyonuna bas, kaydedilsin. Esc vazgeçer. */
export function HotkeyField({ value, defaultValue, onChange }: { value: string; defaultValue: string; onChange: (hotkey: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [hint, setHint] = useState<string | undefined>();

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") { setRecording(false); setHint(undefined); return; }
    const hotkey = hotkeyFromEvent(e.nativeEvent);
    if (!hotkey) return; // yalnızca değiştirici: kombinasyonun tamamlanmasını bekle
    if (!hasModifier(hotkey)) { setHint("En az bir değiştirici tuş (Ctrl, Alt, Shift) gerekli."); return; }
    setRecording(false);
    setHint(undefined);
    onChange(hotkey);
  };

  return (
    <div className="app-hotkey">
      <Button
        type="button"
        aria-label="Palet kısayolunu değiştir"
        onClick={() => { setRecording(true); setHint(undefined); }}
        onKeyDown={onKeyDown}
        onBlur={() => { setRecording(false); setHint(undefined); }}
      >
        {recording ? "Tuş kombinasyonuna bas…" : formatHotkey(value)}
      </Button>
      {value !== defaultValue && !recording && (
        <Button type="button" onClick={() => onChange(defaultValue)}>Varsayılan</Button>
      )}
      {hint && <span className="ui-field-error" role="alert">{hint}</span>}
    </div>
  );
}
