//! Uygulama ayarları: tetikleyici tuş, tag öneki, Windows ile başlat.

use serde::{Deserialize, Serialize};
use std::{fs, io, path::PathBuf};

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
}

impl Default for Settings {
    fn default() -> Self {
        Self { prefix: ";".into(), trigger: Trigger::Tab, autostart: true }
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
