//! Tag deposu. İlk sürümde düz metin JSON; şifreli kasa eklenirse yalnızca bu modül değişir.

use serde::{Deserialize, Serialize};
use std::{fs, io, path::PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entry {
    /// Önek (;) olmadan, küçük harf: harf, rakam, '-' ve '_'.
    pub tag: String,
    pub value: String,
    #[serde(default)]
    pub note: Option<String>,
    /// Unix saniye.
    pub created_at: u64,
}

pub struct Store {
    path: PathBuf,
    entries: Vec<Entry>,
}

pub fn normalize_tag(raw: &str) -> Result<String, String> {
    let tag = raw.trim().to_lowercase();
    if tag.is_empty() {
        return Err("Tag boş olamaz.".into());
    }
    if !tag.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("Tag yalnızca harf, rakam, '-' ve '_' içerebilir.".into());
    }
    Ok(tag)
}

impl Store {
    pub fn load(path: PathBuf) -> Self {
        let entries = fs::read_to_string(&path)
            .ok()
            // Not Defteri gibi araçlar dosyaya BOM ekleyebilir; serde_json bunu okuyamaz.
            .and_then(|s| serde_json::from_str(s.trim_start_matches('\u{feff}')).ok())
            .unwrap_or_default();
        Self { path, entries }
    }

    pub fn list(&self) -> Vec<Entry> {
        let mut v = self.entries.clone();
        v.sort_by(|a, b| a.tag.cmp(&b.tag));
        v
    }

    pub fn find(&self, tag: &str) -> Option<&Entry> {
        self.entries.iter().find(|e| e.tag == tag)
    }

    /// `original` verilirse o tag güncellenir (yeniden adlandırma dahil), yoksa yeni eklenir.
    pub fn upsert(
        &mut self,
        original: Option<&str>,
        tag: &str,
        value: String,
        note: Option<String>,
        now: u64,
    ) -> Result<Entry, String> {
        let tag = normalize_tag(tag)?;
        if value.is_empty() {
            return Err("Değer boş olamaz.".into());
        }
        let taken = self.entries.iter().any(|e| e.tag == tag && Some(e.tag.as_str()) != original);
        if taken {
            return Err(format!("'{tag}' tag'i zaten var."));
        }
        let note = note.filter(|n| !n.trim().is_empty());
        let created_at = original
            .and_then(|o| self.find(o))
            .map_or(now, |e| e.created_at);
        let entry = Entry { tag, value, note, created_at };
        match original.and_then(|o| self.entries.iter().position(|e| e.tag == o)) {
            Some(i) => self.entries[i] = entry.clone(),
            None => self.entries.push(entry.clone()),
        }
        self.save().map_err(|e| e.to_string())?;
        Ok(entry)
    }

    pub fn delete(&mut self, tag: &str) -> Result<(), String> {
        self.entries.retain(|e| e.tag != tag);
        self.save().map_err(|e| e.to_string())
    }

    fn save(&self) -> io::Result<()> {
        if let Some(dir) = self.path.parent() {
            fs::create_dir_all(dir)?;
        }
        let json = serde_json::to_string_pretty(&self.entries).map_err(io::Error::other)?;
        // Önce geçici dosyaya yaz: yarım kalan yazma mevcut veriyi bozmasın.
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, json)?;
        fs::rename(&tmp, &self.path)
    }
}
