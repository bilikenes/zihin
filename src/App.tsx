import { useCallback, useEffect, useState } from "react";
import { Settings as SettingsIcon, Tag } from "lucide-react";
import { Alert, Badge, Button, Progress, Sidebar, ToastProvider, useToast, type SidebarEntry } from "./ui";
import { defaultSettings, getSettings, inTauri, listTags, setWindowTheme, type Entry, type Settings } from "./api";
import { SettingsView } from "./SettingsView";
import { TagsView } from "./TagsView";
import { TitleBar } from "./TitleBar";
import { useUpdater } from "./updater";
import { useTheme } from "./useTheme";

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

const TAGS = "tags";
const SETTINGS = "settings";

function Shell() {
  const { mode, setMode } = useTheme();
  const toast = useToast();
  const [view, setView] = useState(TAGS);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const updater = useUpdater(inTauri);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const updateState = updater.state;
  const updateReady = updateState.kind === "available" || updateState.kind === "downloading";

  useEffect(() => { void setWindowTheme(mode); }, [mode]);

  const refresh = useCallback(
    () => listTags().then(setEntries).catch((e) => toast({ tone: "danger", title: "Liste okunamadı", text: String(e) })),
    [toast],
  );
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    getSettings().then(setSettings).catch((e) => toast({ tone: "danger", title: "Ayarlar okunamadı", text: String(e) }));
  }, [toast]);

  const items: SidebarEntry[] = [
    { section: "Zihin" },
    { value: TAGS, label: "Tag'ler", icon: <Tag size={18} />, badge: <Badge tone="neutral">{entries.length}</Badge> },
    {
      value: SETTINGS,
      label: "Ayarlar",
      icon: <SettingsIcon size={18} />,
      badge: updateReady ? <Badge>Güncelleme</Badge> : undefined,
    },
  ];

  return (
    <div className={`ui-page app-root${inTauri ? " has-titlebar" : ""}`}>
      <div className="ui-glow" />
      {inTauri && <TitleBar />}
      <div className="app-stage">
        <div className="app-scroll">
          <div className="ui-shell">
            <aside className="ui-shell-side">
              <Sidebar items={items} active={view} onSelect={setView} />
            </aside>
            <main className="ui-shell-main">
              {updateReady && !(updateDismissed && updateState.kind === "available") && (
                <div className="app-warnings">
                  <Alert
                    tone="accent"
                    title={updateState.kind === "available" ? `Yeni sürüm hazır: ${updateState.version}` : "Güncelleme indiriliyor"}
                    onClose={updateState.kind === "available" ? () => setUpdateDismissed(true) : undefined}
                    action={
                      updateState.kind === "available" ? (
                        <Button onClick={() => void updater.install()}>Şimdi güncelle</Button>
                      ) : undefined
                    }
                  >
                    {updateState.kind === "downloading" ? (
                      <Progress value={updateState.percent ?? 0} label="Güncelleme indiriliyor" />
                    ) : (
                      "Kurulumdan sonra uygulama kendiliğinden yeniden açılır."
                    )}
                  </Alert>
                </div>
              )}

              {view === SETTINGS ? (
                <SettingsView settings={settings} onChange={setSettings} mode={mode} onModeChange={setMode} updater={updater} />
              ) : (
                <TagsView entries={entries} prefix={settings.prefix} onChanged={refresh} />
              )}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
