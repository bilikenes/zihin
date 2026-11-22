//! Otomatik tamamlama balonu: odak almayan, tıklanmayan, GDI ile çizilen küçük bir Win32 penceresi.
//!
//! Neden WebView değil: Tab/ok tuşunu yutup yutmamaya kanca içinde, aynı anda karar verilmek zorunda.
//! Balon bu yüzden kancayla aynı süreçte ve aynı iş parçacığında (mesaj döngüsünde) yaşar.
//!
//! Kilit kuralı: `CONTENT` kilidi tutulurken pencere API'si ÇAĞRILMAZ. Pencere işlemleri aynı
//! iş parçacığında senkron olarak `wnd_proc`'u çağırabilir ve o da `CONTENT`'i ister.

use std::{
    ffi::c_void,
    mem::size_of,
    sync::{
        atomic::{AtomicBool, AtomicIsize, AtomicU32, Ordering},
        Mutex,
    },
    time::Instant,
};

use windows::{
    core::w,
    Win32::{
        Foundation::*,
        Graphics::{Dwm::*, Gdi::*},
        System::{LibraryLoader::GetModuleHandleW, Registry::*},
        UI::{HiDpi::*, WindowsAndMessaging::*},
    },
};

use crate::suggest::Candidate;

const ANIM_MS: f32 = 120.0;
const ANIM_STEP_MS: u32 = 15;
const TIMER_ANIM: usize = 2;
const TIMER_WATCH: usize = 3;
/// Balon açıkken odaktaki pencerenin değişip değişmediği bu aralıkla denetlenir.
const WATCH_MS: u32 = 250;

// Ölçüler 96 dpi'de mantıksal pikseldir; `scale` ile ekrana uyarlanır.
const WIDTH: i32 = 300;
const ROW_H: i32 = 30;
const PAD: i32 = 6;
const GAP: i32 = 6;
const SLIDE: i32 = 6;

/// Balonun içeriği.
#[derive(Clone)]
pub struct Content {
    pub items: Vec<Candidate>,
    pub selected: usize,
    pub prefix: char,
    /// Vurgulu satırın sağında görünen ipucu, örn. "Tab · yaz" ya da "Tab · tamamla".
    pub hint: String,
}

static CONTENT: Mutex<Option<Content>> = Mutex::new(None);
static HWND_RAW: AtomicIsize = AtomicIsize::new(0);
/// Pencere ekranda mı? (Kancadaki Tab kuralı yalnızca görünürken devreye girer.)
static VISIBLE: AtomicBool = AtomicBool::new(false);
static DPI: AtomicU32 = AtomicU32::new(96);
/// Balon açıldığında odakta olan pencere.
static FG_AT_SHOW: AtomicIsize = AtomicIsize::new(0);
/// Animasyonun hedef konumu ve başlangıç anı.
static ANIM: Mutex<Option<(Instant, i32, i32)>> = Mutex::new(None);

fn hwnd() -> HWND {
    HWND(HWND_RAW.load(Ordering::Relaxed) as *mut c_void)
}

fn scale(px: i32) -> i32 {
    (px as i64 * DPI.load(Ordering::Relaxed) as i64 / 96) as i32
}

pub fn is_visible() -> bool {
    VISIBLE.load(Ordering::Relaxed)
}

/// Pencere sınıfını kaydeder ve (gizli) pencereyi oluşturur. Kanca iş parçacığında çağrılmalı.
pub fn init() {
    unsafe {
        // Ekran ölçeği %100 değilken imleç koordinatları ile pencere boyutu aynı birimde olsun.
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        let instance = GetModuleHandleW(None).map(|m| HINSTANCE(m.0)).unwrap_or_default();
        let class = w!("ZihinSuggest");
        let wc = WNDCLASSW {
            style: CS_DROPSHADOW,
            lpfnWndProc: Some(wnd_proc),
            hInstance: instance,
            hCursor: LoadCursorW(None, IDC_ARROW).unwrap_or_default(),
            lpszClassName: class,
            ..Default::default()
        };
        RegisterClassW(&wc);
        let Ok(h) = CreateWindowExW(
            WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_LAYERED | WS_EX_TRANSPARENT,
            class,
            w!(""),
            WS_POPUP,
            0,
            0,
            10,
            10,
            None,
            None,
            Some(instance),
            None,
        ) else {
            return;
        };
        let round = DWMWCP_ROUND;
        let _ = DwmSetWindowAttribute(
            h,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &round as *const _ as *const c_void,
            size_of::<DWM_WINDOW_CORNER_PREFERENCE>() as u32,
        );
        let _ = SetLayeredWindowAttributes(h, COLORREF(0), 0, LWA_ALPHA);
        HWND_RAW.store(h.0 as isize, Ordering::Relaxed);
    }
}

/// Yeni içerik. Balon görünüyorsa güncellenir, görünmüyorsa hemen açılır.
pub fn update(content: Content) {
    let h = hwnd();
    if h.0.is_null() {
        return;
    }
    if let Ok(mut c) = CONTENT.lock() {
        *c = Some(content);
    }
    unsafe {
        if VISIBLE.load(Ordering::Relaxed) {
            resize_and_repaint(h);
        } else {
            show_now(h);
        }
    }
}

/// Balonu gizler. Her tuşta çağrılabilir: görünmüyorsa hiçbir şey yapmaz.
pub fn hide() {
    if !VISIBLE.swap(false, Ordering::Relaxed) {
        return;
    }
    if let Ok(mut c) = CONTENT.lock() {
        *c = None;
    }
    let h = hwnd();
    if h.0.is_null() {
        return;
    }
    unsafe {
        let _ = KillTimer(Some(h), TIMER_ANIM);
        let _ = KillTimer(Some(h), TIMER_WATCH);
        let _ = ShowWindow(h, SW_HIDE);
    }
}

fn content() -> Option<Content> {
    CONTENT.lock().ok().and_then(|c| c.clone())
}

fn size_for(rows: usize) -> (i32, i32) {
    (scale(WIDTH), scale(PAD * 2) + scale(ROW_H) * rows as i32)
}

unsafe fn resize_and_repaint(h: HWND) {
    let Some(c) = content() else { return };
    let (w, hgt) = size_for(c.items.len());
    unsafe {
        let _ = SetWindowPos(h, None, 0, 0, w, hgt, SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE);
        let _ = InvalidateRect(Some(h), None, false);
    }
}

/// Yazılan yerin ekran konumu.
enum Anchor {
    /// İmleç (caret) konumu: sol üst x, üst y, alt y.
    Caret { x: i32, top: i32, bottom: i32 },
    /// İmleç bulunamadı (Chrome, Electron, VS Code...): odaktaki pencerenin dikdörtgeni.
    Window(RECT),
}

unsafe fn anchor(fg: HWND) -> Option<Anchor> {
    unsafe {
        let tid = GetWindowThreadProcessId(fg, None);
        let mut info = GUITHREADINFO { cbSize: size_of::<GUITHREADINFO>() as u32, ..Default::default() };
        if GetGUIThreadInfo(tid, &mut info).is_ok() && !info.hwndCaret.0.is_null() && info.rcCaret.bottom > info.rcCaret.top {
            let mut p = POINT { x: info.rcCaret.left, y: info.rcCaret.top };
            let _ = ClientToScreen(info.hwndCaret, &mut p);
            let height = info.rcCaret.bottom - info.rcCaret.top;
            return Some(Anchor::Caret { x: p.x, top: p.y, bottom: p.y + height });
        }
        let mut r = RECT::default();
        GetWindowRect(fg, &mut r).ok()?;
        Some(Anchor::Window(r))
    }
}

unsafe fn work_area(near: POINT) -> RECT {
    unsafe {
        let mon = MonitorFromPoint(near, MONITOR_DEFAULTTONEAREST);
        let mut mi = MONITORINFO { cbSize: size_of::<MONITORINFO>() as u32, ..Default::default() };
        if GetMonitorInfoW(mon, &mut mi).as_bool() {
            mi.rcWork
        } else {
            RECT { left: 0, top: 0, right: 1920, bottom: 1080 }
        }
    }
}

/// Balonu konumlayıp animasyonla gösterir.
unsafe fn show_now(h: HWND) {
    let Some(c) = content() else { return };
    unsafe {
        let fg = GetForegroundWindow();
        let dpi = if fg.0.is_null() { 96 } else { GetDpiForWindow(fg) };
        DPI.store(if dpi == 0 { 96 } else { dpi }, Ordering::Relaxed);
        let (w, hgt) = size_for(c.items.len());
        let Some(anchor) = anchor(fg) else { return };

        let (mut x, mut y, probe) = match anchor {
            Anchor::Caret { x, bottom, .. } => (x, bottom + scale(GAP), POINT { x, y: bottom }),
            Anchor::Window(r) => {
                let cx = r.left + (r.right - r.left) / 2;
                (cx - w / 2, r.bottom - hgt - scale(96), POINT { x: cx, y: r.bottom })
            }
        };
        let work = work_area(probe);
        // Altta yer yoksa imlecin üstüne al.
        if y + hgt > work.bottom {
            if let Anchor::Caret { top, .. } = anchor {
                y = top - hgt - scale(GAP);
            } else {
                y = work.bottom - hgt;
            }
        }
        x = x.clamp(work.left, (work.right - w).max(work.left));
        y = y.clamp(work.top, (work.bottom - hgt).max(work.top));

        if let Ok(mut a) = ANIM.lock() {
            *a = Some((Instant::now(), x, y));
        }
        let _ = SetLayeredWindowAttributes(h, COLORREF(0), 0, LWA_ALPHA);
        let _ = SetWindowPos(h, Some(HWND_TOPMOST), x, y + scale(SLIDE), w, hgt, SWP_NOACTIVATE | SWP_SHOWWINDOW);
        let _ = InvalidateRect(Some(h), None, false);
        VISIBLE.store(true, Ordering::Relaxed);
        FG_AT_SHOW.store(fg.0 as isize, Ordering::Relaxed);
        SetTimer(Some(h), TIMER_ANIM, ANIM_STEP_MS, None);
        SetTimer(Some(h), TIMER_WATCH, WATCH_MS, None);
    }
}

/// Belirme animasyonunun bir adımı: solma + yukarı kayma, yavaşlayarak biter.
unsafe fn animate(h: HWND) {
    let Some((start, x, y)) = ANIM.lock().ok().and_then(|a| *a) else {
        unsafe {
            let _ = KillTimer(Some(h), TIMER_ANIM);
        }
        return;
    };
    let p = (start.elapsed().as_secs_f32() * 1000.0 / ANIM_MS).min(1.0);
    let ease = 1.0 - (1.0 - p).powi(3);
    let alpha = (ease * 245.0) as u8;
    let offset = ((1.0 - ease) * scale(SLIDE) as f32) as i32;
    unsafe {
        let _ = SetWindowPos(h, None, x, y + offset, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
        let _ = SetLayeredWindowAttributes(h, COLORREF(0), alpha, LWA_ALPHA);
        if p >= 1.0 {
            let _ = KillTimer(Some(h), TIMER_ANIM);
        }
    }
}

unsafe extern "system" fn wnd_proc(h: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    unsafe {
        match msg {
            WM_TIMER => {
                match wparam.0 {
                    TIMER_ANIM => animate(h),
                    TIMER_WATCH => {
                        // Alt+Tab, bildirim, başka pencereye tıklama: yazılan yer değişti, balon kapansın.
                        if GetForegroundWindow().0 as isize != FG_AT_SHOW.load(Ordering::Relaxed) {
                            hide();
                        }
                    }
                    _ => {}
                }
                LRESULT(0)
            }
            WM_PAINT => {
                paint(h);
                LRESULT(0)
            }
            WM_ERASEBKGND => LRESULT(1),
            WM_NCHITTEST => LRESULT(HTTRANSPARENT as isize),
            WM_MOUSEACTIVATE => LRESULT(MA_NOACTIVATE as isize),
            _ => DefWindowProcW(h, msg, wparam, lparam),
        }
    }
}

// ---------------------------------------------------------------- çizim

struct Palette {
    bg: COLORREF,
    selected: COLORREF,
    text: COLORREF,
    muted: COLORREF,
    accent: COLORREF,
}

const fn rgb(r: u8, g: u8, b: u8) -> COLORREF {
    COLORREF(r as u32 | (g as u32) << 8 | (b as u32) << 16)
}

/// Windows'un "uygulama teması" ayarına göre açık ya da koyu.
fn palette() -> Palette {
    let mut light: u32 = 0;
    let mut size = size_of::<u32>() as u32;
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            w!("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize"),
            w!("AppsUseLightTheme"),
            RRF_RT_REG_DWORD,
            None,
            Some(&mut light as *mut u32 as *mut c_void),
            Some(&mut size),
        )
    };
    if status.is_ok() && light != 0 {
        Palette { bg: rgb(251, 250, 255), selected: rgb(230, 222, 255), text: rgb(20, 17, 31), muted: rgb(100, 95, 120), accent: rgb(104, 72, 220) }
    } else {
        Palette { bg: rgb(30, 27, 46), selected: rgb(58, 46, 108), text: rgb(236, 232, 246), muted: rgb(160, 154, 180), accent: rgb(176, 156, 255) }
    }
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().collect()
}

unsafe fn font(px: i32, weight: i32) -> HFONT {
    unsafe {
        CreateFontW(
            -scale(px),
            0,
            0,
            0,
            weight,
            0,
            0,
            0,
            DEFAULT_CHARSET,
            OUT_DEFAULT_PRECIS,
            CLIP_DEFAULT_PRECIS,
            CLEARTYPE_QUALITY,
            0,
            w!("Segoe UI"),
        )
    }
}

unsafe fn text_width(hdc: HDC, s: &str) -> i32 {
    let mut buf = wide(s);
    let mut r = RECT::default();
    unsafe {
        DrawTextW(hdc, &mut buf, &mut r, DT_CALCRECT | DT_SINGLELINE | DT_NOPREFIX);
    }
    r.right - r.left
}

unsafe fn draw_text(hdc: HDC, s: &str, mut r: RECT, flags: DRAW_TEXT_FORMAT) {
    let mut buf = wide(s);
    unsafe {
        DrawTextW(hdc, &mut buf, &mut r, flags | DT_SINGLELINE | DT_VCENTER | DT_NOPREFIX);
    }
}

unsafe fn paint(h: HWND) {
    unsafe {
        let mut ps = PAINTSTRUCT::default();
        let hdc = BeginPaint(h, &mut ps);
        let Some(c) = content() else {
            let _ = EndPaint(h, &ps);
            return;
        };
        let mut client = RECT::default();
        let _ = GetClientRect(h, &mut client);
        let (w, hgt) = (client.right, client.bottom);

        // Titremesin diye önce belleğe çiz, sonra tek seferde ekrana kopyala.
        let mem = CreateCompatibleDC(Some(hdc));
        let bmp = CreateCompatibleBitmap(hdc, w, hgt);
        let old_bmp = SelectObject(mem, bmp.into());
        let pal = palette();

        let bg = CreateSolidBrush(pal.bg);
        FillRect(mem, &client, bg);
        let _ = DeleteObject(bg.into());

        let regular = font(13, 400);
        let bold = font(13, 600);
        let small = font(12, 400);
        SetBkMode(mem, TRANSPARENT);

        let sel_brush = CreateSolidBrush(pal.selected);
        let old_brush = SelectObject(mem, sel_brush.into());
        let old_pen = SelectObject(mem, GetStockObject(NULL_PEN));

        for (i, item) in c.items.iter().enumerate() {
            let top = scale(PAD) + scale(ROW_H) * i as i32;
            let row = RECT { left: scale(PAD), top, right: w - scale(PAD), bottom: top + scale(ROW_H) };
            let selected = i == c.selected;
            if selected {
                let r = scale(8);
                let _ = RoundRect(mem, row.left, row.top, row.right, row.bottom, r, r);
            }
            let inner = RECT { left: row.left + scale(10), right: row.right - scale(10), ..row };

            // Sağda: yalnızca vurgulu satırda ipucu.
            let mut right_edge = inner.right;
            if selected && !c.hint.is_empty() {
                SelectObject(mem, small.into());
                let hw = text_width(mem, &c.hint);
                SetTextColor(mem, pal.accent);
                draw_text(mem, &c.hint, RECT { left: inner.right - hw, ..inner }, DT_RIGHT);
                right_edge = inner.right - hw - scale(10);
            }

            // Solda: tag adı (kalın), yanında not (soluk).
            let name = format!("{}{}", c.prefix, item.tag);
            SelectObject(mem, bold.into());
            let nw = text_width(mem, &name);
            SetTextColor(mem, pal.text);
            draw_text(mem, &name, RECT { right: right_edge, ..inner }, DT_LEFT | DT_END_ELLIPSIS);

            if let Some(note) = item.note.as_deref().filter(|n| !n.is_empty()) {
                let left = inner.left + nw + scale(10);
                if left < right_edge {
                    SelectObject(mem, regular.into());
                    SetTextColor(mem, pal.muted);
                    draw_text(mem, note, RECT { left, right: right_edge, ..inner }, DT_LEFT | DT_END_ELLIPSIS);
                }
            }
        }

        SelectObject(mem, old_pen);
        SelectObject(mem, old_brush);
        let _ = DeleteObject(sel_brush.into());
        for f in [regular, bold, small] {
            let _ = DeleteObject(f.into());
        }

        let _ = BitBlt(hdc, 0, 0, w, hgt, Some(mem), 0, 0, SRCCOPY);
        SelectObject(mem, old_bmp);
        let _ = DeleteObject(bmp.into());
        let _ = DeleteDC(mem);
        let _ = EndPaint(h, &ps);
    }
}
