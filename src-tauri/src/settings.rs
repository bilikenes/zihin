//! Uygulama ayarları: tetikleyici tuş, tag öneki, Windows ile başlat, palet kısayolu.

use serde::{Deserialize, Serialize};
use std::{fs, io, path::PathBuf, str::FromStr};
use tauri_plugin_global_shortcut::Shortcut;

pub const DEFAULT_PALETTE_HOTKEY: &str = "Ctrl+Shift+Alt+Space";

/// Kısayol metnini (örn. "Ctrl+Shift+Alt+Space") okur; en az bir değiştirici tuş şart:
/// tek başına bir harf her yazışta paleti açardı.
pub fn parse_hotkey(text: &str) -> Result<Shortcut, String> {
    let shortcut = Shortcut::from_str(text.trim()).map_err(|_| format!("'{text}' geçerli bir kısayol değil."))?;
    if shortcut.mods.is_empty() {
        return Err("Kısayolda Ctrl, Alt, Shift ya da Win tuşlarından en az biri olmalı.".into());
    }
    Ok(shortcut)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Trigger {
    Tab,
    Enter,
    Space,
}

impl Trigger {
    /// Windows sanal tuş kodu.
    pub fn vk(self) -> u32 {
        match self {
            Trigger::Tab => 0x09,
            Trigger::Enter => 0x0D,
            Trigger::Space => 0x20,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub prefix: String,
    pub trigger: Trigger,
    pub autostart: bool,
    /// Arama paletini açan genel kısayol.
    pub palette_hotkey: String,
    /// `;ta` yazarken imlecin yanında eşleşen tag'leri gösteren balon.
    pub suggestions: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            prefix: ";".into(),
            trigger: Trigger::Tab,
            autostart: true,
            palette_hotkey: DEFAULT_PALETTE_HOTKEY.into(),
            suggestions: true,
        }
    }
}

impl Settings {
    pub fn prefix_char(&self) -> char {
        self.prefix.chars().next().unwrap_or(';')
    }

    pub fn validate(&self) -> Result<(), String> {
        let mut chars = self.prefix.chars();
        let (Some(c), None) = (chars.next(), chars.next()) else {
            return Err("Önek tam olarak 1 karakter olmalı.".into());
        };
        if c.is_alphanumeric() || c.is_whitespace() || c == '-' || c == '_' || c.is_control() {
            return Err("Önek harf, rakam, boşluk, '-' veya '_' olamaz (örn. ; # @ ~ ,).".into());
        }
        parse_hotkey(&self.palette_hotkey)?;
        Ok(())
    }
}

pub struct SettingsStore {
    path: PathBuf,
    pub settings: Settings,
}

impl SettingsStore {
    pub fn load(path: PathBuf) -> Self {
        let settings = fs::read_to_string(&path)
            .ok()
            // Not Defteri gibi araçlar dosyaya BOM ekleyebilir; serde_json bunu okuyamaz.
            .and_then(|s| serde_json::from_str::<Settings>(s.trim_start_matches('\u{feff}')).ok())
            .filter(|s| s.validate().is_ok())
            .unwrap_or_default();
        Self { path, settings }
    }

    pub fn update(&mut self, settings: Settings) -> Result<(), String> {
        settings.validate()?;
        self.settings = settings;
        self.save().map_err(|e| e.to_string())
    }

    fn save(&self) -> io::Result<()> {
        if let Some(dir) = self.path.parent() {
            fs::create_dir_all(dir)?;
        }
        let json = serde_json::to_string_pretty(&self.settings).map_err(io::Error::other)?;
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, json)?;
        fs::rename(&tmp, &self.path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_hotkey_is_valid() {
        assert!(parse_hotkey(DEFAULT_PALETTE_HOTKEY).is_ok());
        assert!(Settings::default().validate().is_ok());
    }

    #[test]
    fn hotkey_needs_a_modifier_and_a_real_key() {
        assert!(parse_hotkey("Ctrl+Alt+K").is_ok());
        assert!(parse_hotkey("Alt+F2").is_ok());
        assert!(parse_hotkey("Space").is_err());
        assert!(parse_hotkey("K").is_err());
        assert!(parse_hotkey("Ctrl+Shift").is_err());
        assert!(parse_hotkey("Ctrl+Bogus").is_err());
        assert!(parse_hotkey("").is_err());
    }

    #[test]
    fn old_settings_file_without_hotkey_still_loads() {
        let s: Settings = serde_json::from_str(r#"{"prefix":"@","trigger":"enter","autostart":false}"#).unwrap();
        assert_eq!(s.palette_hotkey, DEFAULT_PALETTE_HOTKEY);
        assert_eq!(s.prefix, "@");
        assert!(s.suggestions);
    }
}
