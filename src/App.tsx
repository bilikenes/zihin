import { useCallback, useEffect, useState } from "react";
import { Plus, Settings as SettingsIcon, Tag } from "lucide-react";
import { Alert, Badge, Button, Progress, Sidebar, ToastProvider, useToast, type SidebarEntry } from "./ui";
import { defaultSettings, getSettings, inTauri, listTags, setWindowTheme, type Entry, type Settings } from "./api";
import { AnimatedBackground } from "./background/AnimatedBackground";
import { SettingsView } from "./SettingsView";
import { SidebarSquirrel } from "./SidebarSquirrel";
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
const NEW_TAG = "__new-tag";

function Shell() {
  const { mode, setMode } = useTheme();
  const toast = useToast();
  const [view, setView] = useState(TAGS);
  /** "Yeni tag" menü öğesi seçilince true olur; TagsView formu açıp sıfırlar. */
  const [newTagPending, setNewTagPending] = useState(false);
  const clearNewTag = useCallback(() => setNewTagPending(false), []);
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
    { value: NEW_TAG, label: "Yeni tag", icon: <Plus size={18} /> },
    { section: "Uygulama" },
    {
      value: SETTINGS,
      label: "Ayarlar",
      icon: <SettingsIcon size={18} />,
      badge: updateReady ? <Badge>Güncelleme</Badge> : undefined,
    },
  ];

  const onSelect = (value: string) => {
    if (value === NEW_TAG) {
      setView(TAGS);
      setNewTagPending(true);
    } else setView(value);
  };

  return (
    <div className={`ui-page app-root${inTauri ? " has-titlebar" : ""}`}>
      {inTauri && <TitleBar />}
      <div className="app-stage">
        <AnimatedBackground mode={mode} />
        <div className="app-scroll">
          <div className="ui-shell">
            <aside className="ui-shell-side">
              <SidebarSquirrel />
              <Sidebar items={items} active={view} onSelect={onSelect} />
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
                <SettingsView entries={entries} onImported={refresh} settings={settings} onChange={setSettings} mode={mode} onModeChange={setMode} updater={updater} />
              ) : (
                <TagsView entries={entries} prefix={settings.prefix} onChanged={refresh} newTagPending={newTagPending} onNewTagHandled={clearNewTag} />
              )}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
