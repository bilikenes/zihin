import { useEffect, useRef, useState } from "react";
import { Download, FileDown, FileUp, RefreshCw } from "lucide-react";
import { Button, Card, Field, Input, Modal, Progress, RadioGroup, SegmentedControl, Switch, useToast } from "./ui";
import { DEFAULT_PALETTE_HOTKEY, getAppVersion, importTags, saveSettings, type Entry, type ImportItem, type Settings, type Trigger } from "./api";
import { HotkeyField } from "./HotkeyField";
import { backupFileName, downloadFile, parseBackup, toCsv, toJson } from "./backup";
import { updateLabel, type UpdateState } from "./updater";
import type { Mode } from "./useTheme";

const triggerLabels: Record<Trigger, string> = { tab: "Tab", enter: "Enter", space: "Boşluk" };

interface UpdaterApi {
  state: UpdateState;
  checkNow: () => Promise<void>;
  install: () => Promise<void>;
}

interface Props {
  entries: Entry[];
  onImported: () => Promise<unknown>;
  settings: Settings;
  onChange: (s: Settings) => void;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  updater: UpdaterApi;
}

// Ayarlar anında uygulanır; ayrı bir kaydet düğmesi yok.
export function SettingsView({ entries, onImported, settings, onChange, mode, onModeChange, updater }: Props) {
  const toast = useToast();
  const [prefixText, setPrefixText] = useState(settings.prefix);
  const [prefixError, setPrefixError] = useState<string | undefined>();
  const [version, setVersion] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  /** Dosyadan okunan, çakışma sorusu bekleyen kayıtlar. */
  const [pending, setPending] = useState<{ items: ImportItem[]; conflicts: number } | null>(null);

  useEffect(() => setPrefixText(settings.prefix), [settings.prefix]);
  useEffect(() => { void getAppVersion().then(setVersion); }, []);

  const { state } = updater;
  const checking = state.kind === "checking" || state.kind === "downloading";
  const statusText = updateLabel(state) ?? "Güncellemeler GitHub üzerinden indirilir ve imzası doğrulanarak kurulur.";
  const versionText = version ? (/^\d/.test(version) ? ` v${version}` : ` ${version}`) : "";

  const apply = async (next: Settings) => {
    try {
      onChange(await saveSettings(next));
    } catch (e) {
      toast({ tone: "danger", title: "Ayar kaydedilemedi", text: String(e) });
    }
  };

  const changePrefix = async (text: string) => {
    setPrefixText(text);
    if (text.length === 0) return setPrefixError("Önek boş olamaz.");
    if ([...text].length !== 1) return setPrefixError("Önek tam olarak 1 karakter olmalı.");
    try {
      onChange(await saveSettings({ ...settings, prefix: text }));
      setPrefixError(undefined);
    } catch (e) {
      setPrefixError(String(e));
    }
  };

  const exportAs = (ext: "json" | "csv") => {
    if (entries.length === 0) return toast({ tone: "info", title: "Dışa aktarılacak tag yok" });
    if (ext === "json") downloadFile(backupFileName("json"), toJson(entries), "application/json");
    else downloadFile(backupFileName("csv"), toCsv(entries), "text/csv;charset=utf-8");
  };

  const pickFile = async (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = ""; // aynı dosya tekrar seçilebilsin
    if (!file) return;
    try {
      const items = parseBackup(await file.text(), file.name);
      const existing = new Set(entries.map((e) => e.tag));
      const conflicts = items.filter((i) => existing.has(i.tag.trim().toLowerCase())).length;
      if (conflicts === 0) await runImport(items, false);
      else setPending({ items, conflicts });
    } catch (e) {
      toast({ tone: "danger", title: "Dosya okunamadı", text: String(e) });
    }
  };

  const runImport = async (items: ImportItem[], overwrite: boolean) => {
    setPending(null);
    try {
      const s = await importTags(items, overwrite);
      await onImported();
      const parts = [
        s.added && `${s.added} eklendi`,
        s.updated && `${s.updated} güncellendi`,
        s.skipped && `${s.skipped} atlandı`,
        s.invalid && `${s.invalid} geçersiz`,
      ].filter(Boolean);
      toast({ tone: s.added + s.updated > 0 ? "success" : "info", title: "İçe aktarma bitti", text: parts.join(", ") || "Değişiklik yok" });
    } catch (e) {
      toast({ tone: "danger", title: "İçe aktarılamadı", text: String(e) });
    }
  };

  return (
    <div className="ui-stack is-loose">
      <div>
        <h1 className="ui-title">Ayarlar</h1>
        <p className="ui-muted">Görünüm, genişletme tetikleyicisi ve uygulama davranışı.</p>
      </div>

      <Card title="Görünüm">
        <div className="ui-setting">
          <div className="ui-setting-label">
            Tema
            <small>Uygulamanın açık ya da koyu görünmesi.</small>
          </div>
          <SegmentedControl
            aria-label="Tema"
            value={mode}
            onValueChange={(value) => onModeChange(value as Mode)}
            items={[{ value: "light", label: "Açık" }, { value: "dark", label: "Koyu" }]}
          />
        </div>
      </Card>

      <Card title="Genişletme" description="Tag'in değere dönüşmesi nasıl tetiklensin?">
        <div className="app-setting-pair">
          <Field label="Tetikleyici tuş" hint="Eşleşen tag yoksa tuş normal çalışır.">
            {() => (
              <RadioGroup
                aria-label="Tetikleyici tuş"
                value={settings.trigger}
                onValueChange={(v) => void apply({ ...settings, trigger: v as Trigger })}
                options={(Object.keys(triggerLabels) as Trigger[]).map((t) => ({ value: t, label: triggerLabels[t] }))}
              />
            )}
          </Field>
          <Field label="Tag öneki" hint="Tek karakter: ; # @ ~ , gibi." error={prefixError}>
            {(id) => (
              <div className="ui-w-sm">
                <Input id={id} value={prefixText} onValueChange={(v) => void changePrefix(v)} maxLength={2} />
              </div>
            )}
          </Field>
        </div>
        <div className="ui-setting">
          <div className="ui-setting-label">
            Tamamlama balonu
            <small>
              Tag yazarken eşleşenleri gösterir. {triggerLabels[settings.trigger]} vurgulu satırı tamamlar, tag tamsa değeri yazar; ↑ ↓ seçer, Esc kapatır.
            </small>
          </div>
          <Switch
            aria-label="Tamamlama balonu"
            checked={settings.suggestions}
            onCheckedChange={(on) => void apply({ ...settings, suggestions: on })}
          />
        </div>
      </Card>

      <Card title="Arama paleti" description="Bu kısayola basınca küçük bir arama kutusu açılır; seçtiğin tag'in değeri açık uygulamaya yapıştırılır.">
        <div className="ui-setting">
          <div className="ui-setting-label">
            Açma kısayolu
            <small>Tıkla, ardından yeni tuş kombinasyonuna bas. En az bir Ctrl, Alt veya Shift gerekir.</small>
          </div>
          <HotkeyField
            value={settings.palette_hotkey}
            defaultValue={DEFAULT_PALETTE_HOTKEY}
            onChange={(hotkey) => void apply({ ...settings, palette_hotkey: hotkey })}
          />
        </div>
      </Card>

      <Card title="Yedekleme" description="Tag'lerini dosyaya aktar ya da dosyadan geri yükle.">
        <div className="ui-setting">
          <div className="ui-setting-label">
            Dışa aktar
            <small>Değerler dosyada düz metin olarak durur; dosyayı güvenli bir yerde sakla.</small>
          </div>
          <div className="app-btn-row">
            <Button icon={<FileDown size={18} />} onClick={() => exportAs("json")}>JSON</Button>
            <Button icon={<FileDown size={18} />} onClick={() => exportAs("csv")}>CSV</Button>
          </div>
        </div>
        <div className="ui-setting">
          <div className="ui-setting-label">
            İçe aktar
            <small>JSON ya da CSV (tag, value, note sütunları). Var olan tag'ler için ne yapılacağı sorulur.</small>
          </div>
          <Button icon={<FileUp size={18} />} onClick={() => fileInput.current?.click()}>Dosya seç</Button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,.csv,application/json,text/csv"
            hidden
            onChange={(e) => void pickFile(e.target.files?.[0])}
          />
        </div>
      </Card>

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Var olan tag'ler bulundu"
        footer={
          <>
            <Button onClick={() => setPending(null)}>Vazgeç</Button>
            <Button onClick={() => pending && void runImport(pending.items, false)}>Atla</Button>
            <Button variant="filled" onClick={() => pending && void runImport(pending.items, true)}>Üzerine yaz</Button>
          </>
        }
      >
        Dosyadaki {pending?.items.length} tag'den {pending?.conflicts} tanesi zaten var. Var olanların değeri ve notu
        dosyadakiyle değiştirilsin mi, yoksa atlansın mı?
      </Modal>

      <Card title="Uygulama">
        <div className="ui-setting">
          <div className="ui-setting-label">
            Windows ile başlat
            <small>Açılışta tray'de sessizce başlar. Geliştirme sürümünde etkisizdir.</small>
          </div>
          <Switch
            aria-label="Windows ile başlat"
            checked={settings.autostart}
            onCheckedChange={(on) => void apply({ ...settings, autostart: on })}
          />
        </div>
      </Card>

      <Card title="Güncellemeler">
        <div className="ui-setting">
          <div className="ui-setting-label">
            Zihin{versionText}
            <small>{statusText}</small>
          </div>
          {state.kind === "available" ? (
            <Button variant="filled" icon={<Download size={18} />} onClick={() => void updater.install()}>
              {state.version} sürümünü kur
            </Button>
          ) : (
            <Button icon={<RefreshCw size={18} />} disabled={checking} onClick={() => void updater.checkNow()}>
              Denetle
            </Button>
          )}
        </div>
        {state.kind === "downloading" && <Progress value={state.percent ?? 0} label="Güncelleme indiriliyor" />}
      </Card>
    </div>
  );
}
