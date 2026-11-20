//! Sistem geneli genişletme: `;tag` + tetikleyici → kayıtlı değer.
//!
//! Bu kod, uygulama penceresinden AYRI bir süreçte ("hook host", `--expander-host`) çalışır.
//! Sebep: `WH_KEYBOARD_LL` hook'u, kendi WebView2 penceremize yazılan tuşlarda hiç çağrılmıyor
//! (odak, bizimle bağlantılı ama başka süreçteki bir alt pencerede). Hook'u pencereden bağımsız bir
//! süreçte tutunca her uygulamada, kendi arayüzümüz dahil, aynı şekilde çalışır.
//!
//! - Hook içinde ağır iş yapılmaz (Windows yavaş hook'u devre dışı bırakır); yazma işi bir
//!   işçi iş parçacığına gider.
//! - Etiketler ve ayarlar arayüzün yazdığı JSON dosyalarından okunur; dosya değişince yenilenir.

use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering},
        mpsc, Mutex, OnceLock,
    },
    thread,
    time::{Duration, Instant, SystemTime},
};

use arboard::{Clipboard, ImageData, SetExtWindows};
use windows::Win32::{
    Foundation::{LPARAM, LRESULT, WPARAM},
    System::LibraryLoader::GetModuleHandleW,
    UI::{Input::KeyboardAndMouse::*, WindowsAndMessaging::*},
};

use crate::{matcher::Matcher, settings::SettingsStore, store::Store};

/// Kendi SendInput çağrılarımızı işaretler ("KWWA"); hook bunları kendi girdisi saymaz.
/// Başka yazılımların gönderdiği tuşlar (uzak masaüstü, ekran klavyesi, makrolar) yazı sayılır.
const OWN_MARK: usize = 0x4B57_5741;

/// `KW_TRACE=1` ile açılır: hook'un her tuşta ne yaptığını `%TEMP%\kw-trace.log` dosyasına yazar.
/// Yazılan karakterleri içerir; yalnızca geliştirme içindir, varsayılan olarak kapalıdır.
static TRACE: AtomicBool = AtomicBool::new(false);

fn trace(msg: impl FnOnce() -> String) {
    if !TRACE.load(Ordering::Relaxed) {
        return;
    }
    use std::io::Write;
    let path = std::env::temp_dir().join("kw-trace.log");
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "{}", msg());
    }
}

// Canlı ayarlar: hook her tuşta bunları okur, kilit gerekmez.
static PREFIX_CP: AtomicU32 = AtomicU32::new(';' as u32);
static TRIGGER_VK: AtomicU32 = AtomicU32::new(0x09);

fn prefix() -> char {
    char::from_u32(PREFIX_CP.load(Ordering::Relaxed)).unwrap_or(';')
}

fn trigger_vk() -> u32 {
    TRIGGER_VK.load(Ordering::Relaxed)
}

// ---------------------------------------------------------------- veri (JSON dosyaları)

struct Data {
    dir: PathBuf,
    tags: Store,
    tags_mtime: Option<SystemTime>,
    settings: SettingsStore,
    settings_mtime: Option<SystemTime>,
    checked: Instant,
}

fn mtime(path: &std::path::Path) -> Option<SystemTime> {
    std::fs::metadata(path).and_then(|m| m.modified()).ok()
}

impl Data {
    fn load(dir: PathBuf) -> Self {
        let (tp, sp) = (dir.join("tags.json"), dir.join("settings.json"));
        let data = Self {
            tags_mtime: mtime(&tp),
            settings_mtime: mtime(&sp),
            tags: Store::load(tp),
            settings: SettingsStore::load(sp),
            checked: Instant::now(),
            dir,
        };
        data.apply_settings();
        data
    }

    fn apply_settings(&self) {
        PREFIX_CP.store(self.settings.settings.prefix_char() as u32, Ordering::Relaxed);
        TRIGGER_VK.store(self.settings.settings.trigger.vk(), Ordering::Relaxed);
    }

    /// Arayüz dosyaları değiştirdiyse yeniden okur (en fazla 250 ms'de bir bakar).
    fn refresh(&mut self) {
        if self.checked.elapsed() < Duration::from_millis(250) {
            return;
        }
        self.checked = Instant::now();
        let (tp, sp) = (self.dir.join("tags.json"), self.dir.join("settings.json"));
        let (tm, sm) = (mtime(&tp), mtime(&sp));
        if tm != self.tags_mtime {
            self.tags_mtime = tm;
            self.tags = Store::load(tp);
            trace(|| "etiketler yenilendi".into());
        }
        if sm != self.settings_mtime {
            self.settings_mtime = sm;
            self.settings = SettingsStore::load(sp);
            self.apply_settings();
            trace(|| format!("ayarlar yenilendi: önek={:?}", prefix()));
        }
    }
}

static DATA: Mutex<Option<Data>> = Mutex::new(None);

fn refresh_data() {
    if let Ok(mut d) = DATA.lock() {
        if let Some(d) = d.as_mut() {
            d.refresh();
        }
    }
}

fn lookup(tag: &str) -> Option<String> {
    let d = DATA.lock().ok()?;
    d.as_ref()?.tags.find(tag).map(|e| e.value.clone())
}

// ---------------------------------------------------------------- hook durumu

struct Job {
    backspaces: usize,
    value: String,
}

struct State {
    matcher: Matcher,
    foreground: isize,
    /// Yutulan tetikleyicinin keyup olayı da yutulsun.
    swallow_trigger_up: bool,
}

static STATE: Mutex<State> = Mutex::new(State { matcher: Matcher::new(), foreground: 0, swallow_trigger_up: false });
static JOBS: OnceLock<mpsc::Sender<Job>> = OnceLock::new();

/// Hook host sürecinin ana işi: bu fonksiyon geri dönmez.
pub fn run_host(dir: PathBuf) {
    TRACE.store(std::env::var("KW_TRACE").is_ok_and(|v| v == "1"), Ordering::Relaxed);
    if let Ok(mut d) = DATA.lock() {
        *d = Some(Data::load(dir));
    }

    let (tx, rx) = mpsc::channel::<Job>();
    let _ = JOBS.set(tx);
    thread::Builder::new()
        .name("expander-worker".into())
        .spawn(move || {
            for job in rx {
                if let Err(e) = perform(&job) {
                    trace(|| format!("genişletme başarısız: {e}"));
                }
            }
        })
        .expect("işçi iş parçacığı başlatılamadı");

    unsafe {
        let module = GetModuleHandleW(None).ok().map(|m| m.into());
        let kb = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_proc), module, 0);
        let mouse = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), module, 0);
        if kb.is_err() || mouse.is_err() {
            trace(|| format!("hook kurulamadı: {kb:?} {mouse:?}"));
            return;
        }
        trace(|| "hook host çalışıyor".into());
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}

fn is_down(vk: VIRTUAL_KEY) -> bool {
    unsafe { (GetAsyncKeyState(vk.0 as i32) as u16 & 0x8000) != 0 }
}

unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        let m = wparam.0 as u32;
        if matches!(m, WM_LBUTTONDOWN | WM_RBUTTONDOWN | WM_MBUTTONDOWN | WM_XBUTTONDOWN) {
            if let Ok(mut s) = STATE.lock() {
                s.matcher.reset();
            }
        }
    }
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

unsafe extern "system" fn keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 && handle_key(wparam, lparam) {
        return LRESULT(1);
    }
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

/// `true` dönerse tuş yutulur.
fn handle_key(wparam: WPARAM, lparam: LPARAM) -> bool {
    let kb = unsafe { &*(lparam.0 as *const KBDLLHOOKSTRUCT) };
    if kb.dwExtraInfo == OWN_MARK {
        return false;
    }
    let msg = wparam.0 as u32;
    let is_up = msg == WM_KEYUP || msg == WM_SYSKEYUP;
    let is_down_evt = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
    let vk = kb.vkCode;

    // Kilit sırası: önce DATA (kısa), sonra STATE. DATA kilidi STATE'i hiç istemez.
    if is_down_evt {
        refresh_data();
    }
    let Ok(mut state) = STATE.lock() else { return false };

    if is_up {
        if vk == trigger_vk() && state.swallow_trigger_up {
            state.swallow_trigger_up = false;
            return true;
        }
        return false;
    }
    if !is_down_evt {
        return false;
    }

    // Odak başka pencereye geçtiyse eski tampon geçersiz.
    let fg = unsafe { GetForegroundWindow() };
    if state.foreground != fg.0 as isize {
        state.foreground = fg.0 as isize;
        state.matcher.reset();
    }

    // Tek başına değiştirici tuşlar tamponu etkilemez.
    if matches!(
        VIRTUAL_KEY(vk as u16),
        VK_SHIFT | VK_LSHIFT | VK_RSHIFT | VK_CONTROL | VK_LCONTROL | VK_RCONTROL
            | VK_MENU | VK_LMENU | VK_RMENU | VK_LWIN | VK_RWIN | VK_CAPITAL
    ) {
        return false;
    }

    let ctrl = is_down(VK_CONTROL);
    let alt = is_down(VK_MENU);
    let win = is_down(VK_LWIN) || is_down(VK_RWIN);
    let shift = is_down(VK_SHIFT);
    // AltGr = Ctrl+Alt: karakter üretir (örn. Türkçe Q klavyede '@').
    let alt_gr = ctrl && alt;

    if vk == trigger_vk() {
        if ctrl || alt || win || shift {
            state.matcher.reset();
            return false;
        }
        let before = state.matcher.text();
        let Some(exp) = state.matcher.trigger(prefix(), lookup) else {
            trace(|| format!("tetikleyici: eşleşme yok, tampon={before:?}"));
            return false;
        };
        trace(|| format!("tetikleyici: {} karakter silinip yapıştırılıyor", exp.backspaces));
        state.swallow_trigger_up = true;
        if let Some(tx) = JOBS.get() {
            let _ = tx.send(Job { backspaces: exp.backspaces, value: exp.value });
        }
        return true;
    }

    if vk == VK_BACK.0 as u32 {
        state.matcher.backspace();
        return false;
    }

    // Saf Ctrl/Alt/Win kısayolları yazı değildir.
    if win || (ctrl != alt) {
        state.matcher.reset();
        return false;
    }

    match key_to_char(kb, alt_gr) {
        Some(c) => state.matcher.push(c),
        None => state.matcher.reset(),
    }
    false
}

/// Tuşu, anlık klavye düzenine göre karaktere çevirir. Ölü tuşlar ve kontrol karakterleri `None`.
fn key_to_char(kb: &KBDLLHOOKSTRUCT, alt_gr: bool) -> Option<char> {
    let mut keys = [0u8; 256];
    let set = |keys: &mut [u8; 256], vk: VIRTUAL_KEY, on: bool| {
        if on {
            keys[vk.0 as usize] = 0x80;
        }
    };
    let shift = is_down(VK_SHIFT);
    set(&mut keys, VK_SHIFT, shift);
    set(&mut keys, VK_LSHIFT, is_down(VK_LSHIFT));
    set(&mut keys, VK_RSHIFT, is_down(VK_RSHIFT));
    if alt_gr {
        set(&mut keys, VK_CONTROL, true);
        set(&mut keys, VK_LCONTROL, true);
        set(&mut keys, VK_MENU, true);
        set(&mut keys, VK_RMENU, true);
    }
    if unsafe { GetKeyState(VK_CAPITAL.0 as i32) } & 1 != 0 {
        keys[VK_CAPITAL.0 as usize] = 0x01;
    }

    unsafe {
        let tid = GetWindowThreadProcessId(GetForegroundWindow(), None);
        let layout = GetKeyboardLayout(tid);
        let mut out = [0u16; 8];
        // 0x4: klavye durumunu (ölü tuş bekleyen karakteri) değiştirme.
        let n = ToUnicodeEx(kb.vkCode, kb.scanCode, &keys, &mut out, 0x4, Some(layout));
        if n != 1 {
            return None;
        }
        char::from_u32(out[0] as u32).filter(|c| !c.is_control())
    }
}

// ---------------------------------------------------------------- yazma işi

fn key_input(vk: VIRTUAL_KEY, up: bool) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: 0,
                dwFlags: if up { KEYEVENTF_KEYUP } else { KEYBD_EVENT_FLAGS(0) },
                time: 0,
                dwExtraInfo: OWN_MARK,
            },
        },
    }
}

fn send(inputs: &[INPUT]) {
    unsafe {
        SendInput(inputs, std::mem::size_of::<INPUT>() as i32);
    }
}

enum Saved {
    Text(String),
    Image(ImageData<'static>),
    Nothing,
}

fn perform(job: &Job) -> Result<(), String> {
    // Yavaş olan her şey (pano okuma/yazma) ekrandaki metne dokunmadan ÖNCE yapılır.
    // Böylece `;tag` silinip yerine değer gelene kadar görünür bir boşluk kalmaz.
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    let saved = if let Ok(t) = clipboard.get_text() {
        Saved::Text(t)
    } else if let Ok(img) = clipboard.get_image() {
        Saved::Image(img.to_owned_img())
    } else {
        Saved::Nothing
    };

    // Değeri panoya koy (Win+V geçmişine ve bulut panosuna girmesin).
    clipboard
        .set()
        .exclude_from_history()
        .exclude_from_cloud()
        .text(job.value.clone())
        .map_err(|e| e.to_string())?;

    // `;tag` silme ve yapıştırma TEK SendInput çağrısında gider: araya başka olay giremez,
    // hedef uygulama ikisini art arda işler.
    let mut inputs = Vec::with_capacity(job.backspaces * 2 + 4);
    for _ in 0..job.backspaces {
        inputs.push(key_input(VK_BACK, false));
        inputs.push(key_input(VK_BACK, true));
    }
    inputs.extend([
        key_input(VK_CONTROL, false),
        key_input(VK_V, false),
        key_input(VK_V, true),
        key_input(VK_CONTROL, true),
    ]);
    send(&inputs);

    // Hedef uygulama yapıştırmayı okuyana kadar bekle, sonra eski panoyu geri yükle.
    thread::sleep(Duration::from_millis(250));
    match saved {
        Saved::Text(t) => {
            let _ = clipboard.set().exclude_from_history().exclude_from_cloud().text(t);
        }
        Saved::Image(img) => {
            let _ = clipboard.set_image(img);
        }
        Saved::Nothing => {
            let _ = clipboard.clear();
        }
    }
    Ok(())
}
