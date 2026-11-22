mod expander;
mod matcher;
mod popup;
mod settings;
mod store;
mod suggest;

use settings::{Settings, SettingsStore};
use std::{
    sync::{
        atomic::{AtomicIsize, Ordering},
        Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use store::{Entry, ImportSummary, Incoming, Store};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub(crate) type Db = Mutex<Store>;
type SettingsDb = Mutex<SettingsStore>;

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs())
}

#[tauri::command]
fn list_tags(db: State<Db>) -> Vec<Entry> {
    db.lock().unwrap().list()
}

#[tauri::command]
fn save_tag(
    db: State<Db>,
    original: Option<String>,
    tag: String,
    value: String,
    note: Option<String>,
) -> Result<Entry, String> {
    db.lock().unwrap().upsert(original.as_deref(), &tag, value, note, now())
}

/// Yedek dosyasından toplu ekleme. `overwrite`: var olan tag'lerin üzerine yazılsın mı?
#[tauri::command]
fn import_tags(db: State<Db>, items: Vec<Incoming>, overwrite: bool) -> Result<ImportSummary, String> {
    db.lock().unwrap().import(items, overwrite, now())
}

#[tauri::command]
fn delete_tag(db: State<Db>, tag: String) -> Result<(), String> {
    db.lock().unwrap().delete(&tag)
}

/// Değeri panoya koyar; Win+V geçmişine ve bulut panosuna girmesin (parola olabilir).
#[tauri::command]
fn copy_text(text: String) -> Result<(), String> {
    use arboard::SetExtWindows;
    arboard::Clipboard::new()
        .map_err(|e| e.to_string())?
        .set()
        .exclude_from_history()
        .exclude_from_cloud()
        .text(text)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_settings(db: State<SettingsDb>) -> Settings {
    db.lock().unwrap().settings.clone()
}

#[tauri::command]
fn save_settings(app: AppHandle, db: State<SettingsDb>, settings: Settings) -> Result<Settings, String> {
    let mut store = db.lock().unwrap();
    settings.validate()?;
    // Önce kısayolu dene: başka bir uygulama kullanıyorsa hata verir ve hiçbir şey kaydedilmez.
    if settings.palette_hotkey != store.settings.palette_hotkey {
        register_palette_hotkey(&app, &settings.palette_hotkey, &store.settings.palette_hotkey)?;
    }
    // Hook host süreci settings.json değişikliğini kendisi fark edip uygular.
    store.update(settings)?;
    sync_autostart(&app, store.settings.autostart);
    Ok(store.settings.clone())
}

// ---------------------------------------------------------------- arama paleti

/// Palet açılmadan önce odakta olan pencere (HWND); seçilen değer oraya yapıştırılır.
static PREV_WINDOW: AtomicIsize = AtomicIsize::new(0);

/// `new` kısayolunu kaydeder. Olmazsa (başka uygulama kullanıyor olabilir) `old` geri yüklenir.
fn register_palette_hotkey(app: &AppHandle, new: &str, old: &str) -> Result<(), String> {
    let gs = app.global_shortcut();
    let bind = |text: &str| -> Result<(), String> {
        let shortcut = settings::parse_hotkey(text)?;
        gs.on_shortcut(shortcut, |app, _, event| {
            if event.state == ShortcutState::Pressed {
                toggle_palette(app);
            }
        })
        .map_err(|e| format!("'{text}' kısayolu kaydedilemedi (başka bir uygulama kullanıyor olabilir): {e}"))
    };
    let _ = gs.unregister_all();
    if let Err(e) = bind(new) {
        if bind(old).is_err() {
            log::error!("eski palet kısayolu da geri yüklenemedi");
        }
        return Err(e);
    }
    Ok(())
}

fn toggle_palette(app: &AppHandle) {
    let Some(w) = app.get_webview_window("palette") else { return };
    if w.is_visible().unwrap_or(false) {
        let _ = w.hide();
        return;
    }
    // Odak bize geçmeden ÖNCE hatırla: yapıştırma o pencereye yapılacak.
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    PREV_WINDOW.store(unsafe { GetForegroundWindow() }.0 as isize, Ordering::Relaxed);
    let _ = w.center();
    let _ = w.show();
    let _ = w.set_focus();
    let _ = app.emit_to("palette", "palette-open", ());
}

#[tauri::command]
fn palette_close(app: AppHandle) {
    if let Some(w) = app.get_webview_window("palette") {
        let _ = w.hide();
    }
}

/// Paletten seçilen tag'in değerini, palet açılmadan önceki pencereye yapıştırır.
#[tauri::command]
fn palette_paste(app: AppHandle, db: State<Db>, tag: String) -> Result<(), String> {
    let value = db.lock().unwrap().find(&tag).map(|e| e.value.clone()).ok_or("Tag bulunamadı.")?;
    palette_close(app);
    std::thread::spawn(move || {
        use windows::Win32::{Foundation::HWND, UI::WindowsAndMessaging::SetForegroundWindow};
        let prev = PREV_WINDOW.load(Ordering::Relaxed);
        if prev != 0 {
            let _ = unsafe { SetForegroundWindow(HWND(prev as *mut _)) };
        }
        // Odağın geri gelmesi ve palet penceresinin kapanması için kısa bekleme.
        std::thread::sleep(Duration::from_millis(120));
        if let Err(e) = expander::paste_value(value) {
            log::error!("palet yapıştırması başarısız: {e}");
        }
    });
    Ok(())
}

/// Kayıt defterindeki "Windows ile başlat" durumunu ayarla eşitler.
/// Geliştirme sürümünde çalıştırılmaz: kayıt geçici derleme yolunu gösterirdi.
fn sync_autostart(app: &AppHandle, want: bool) {
    if cfg!(debug_assertions) {
        log::info!("autostart (geliştirme sürümünde atlandı): {want}");
        return;
    }
    let manager = app.autolaunch();
    let current = manager.is_enabled().unwrap_or(false);
    if current != want {
        let r = if want { manager.enable() } else { manager.disable() };
        if let Err(e) = r {
            log::error!("autostart güncellenemedi: {e}");
        }
    }
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Aç", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Çık", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().cloned().expect("pencere ikonu yok"))
        .tooltip("Zihin")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

/// Genişletme hook'unu çalıştıran, pencereden bağımsız süreç (`--expander-host <veri klasörü>`).
pub fn run_expander_host(dir: std::path::PathBuf) {
    expander::run_host(dir);
}

/// Hook host'u ayrı süreç olarak başlatır. Neden ayrı süreç: bkz. `expander.rs` başı.
/// Süreç bir Job Object'e bağlanır; arayüz süreci nasıl kapanırsa kapansın (çökme dahil) host da biter.
fn spawn_expander_host(dir: &std::path::Path) {
    use std::os::windows::{io::AsRawHandle, process::CommandExt};
    use windows::Win32::{
        Foundation::HANDLE,
        System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        },
    };

    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => return log::error!("hook host başlatılamadı: {e}"),
    };
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let child = match std::process::Command::new(exe)
        .arg("--expander-host")
        .arg(dir)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
    {
        Ok(c) => c,
        Err(e) => return log::error!("hook host başlatılamadı: {e}"),
    };

    unsafe {
        let job = match CreateJobObjectW(None, None) {
            Ok(j) => j,
            Err(e) => return log::error!("job object oluşturulamadı: {e}"),
        };
        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let _ = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const std::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        let _ = AssignProcessToJobObject(job, HANDLE(child.as_raw_handle()));
        // `job` kasıtlı olarak kapatılmaz: arayüz süreci bitince tutamaç kapanır ve host öldürülür.
    }
    log::info!("hook host başlatıldı (pid {})", child.id());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // İkinci kopya açılırsa iki hook çift genişletme yapardı: mevcut pencereyi göster.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            app.manage(Mutex::new(Store::load(dir.join("tags.json"))));

            let settings = SettingsStore::load(dir.join("settings.json"));
            sync_autostart(app.handle(), settings.settings.autostart);
            let hotkey = settings.settings.palette_hotkey.clone();
            if let Err(e) = register_palette_hotkey(app.handle(), &hotkey, &hotkey) {
                log::error!("palet kısayolu kaydedilemedi: {e}");
            }
            app.manage(Mutex::new(settings));

            setup_tray(app.handle())?;
            spawn_expander_host(&dir);
            // Geliştirme sırasında pencere hemen görünsün; sürümde tray'de başlar.
            if cfg!(debug_assertions) {
                show_main(app.handle());
            }
            Ok(())
        })
        // Kapatma düğmesi uygulamayı bitirmez, tray'e indirir.
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            // Palet, odağı kaybedince (başka yere tıklanınca, Alt+Tab) kendiliğinden kapanır.
            WindowEvent::Focused(false) if window.label() == "palette" => {
                let _ = window.hide();
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            list_tags, save_tag, import_tags, delete_tag, copy_text, get_settings, save_settings, palette_close,
            palette_paste
        ])
        .run(tauri::generate_context!())
        .expect("uygulama başlatılamadı");
}
