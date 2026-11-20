import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Button, Card, Field, Input, Progress, RadioGroup, SegmentedControl, Switch, useToast } from "./ui";
import { getAppVersion, saveSettings, type Settings, type Trigger } from "./api";
import { updateLabel, type UpdateState } from "./updater";
import type { Mode } from "./useTheme";

const triggerLabels: Record<Trigger, string> = { tab: "Tab", enter: "Enter", space: "Boşluk" };

interface UpdaterApi {
  state: UpdateState;
  checkNow: () => Promise<void>;
  install: () => Promise<void>;
}

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  updater: UpdaterApi;
}

// Ayarlar anında uygulanır; ayrı bir kaydet düğmesi yok.
export function SettingsView({ settings, onChange, mode, onModeChange, updater }: Props) {
  const toast = useToast();
  const [prefixText, setPrefixText] = useState(settings.prefix);
  const [prefixError, setPrefixError] = useState<string | undefined>();
  const [version, setVersion] = useState("");

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
        <div className="ui-stack">
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
      </Card>

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
              Güncellemeleri denetle
            </Button>
          )}
        </div>
        {state.kind === "downloading" && <Progress value={state.percent ?? 0} label="Güncelleme indiriliyor" />}
      </Card>
    </div>
  );
}
