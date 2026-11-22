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

/// İçe aktarılan dosyadaki tek satır.
#[derive(Debug, Deserialize)]
pub struct Incoming {
    pub tag: String,
    pub value: String,
    #[serde(default)]
    pub note: Option<String>,
}

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
pub struct ImportSummary {
    pub added: usize,
    pub updated: usize,
    /// Zaten vardı ve "üzerine yaz" seçilmedi.
    pub skipped: usize,
    /// Geçersiz tag adı ya da boş değer.
    pub invalid: usize,
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

    /// Toplu ekleme. Dosya tek seferde yazılır; geçersiz satırlar sayılıp atlanır.
    /// Aynı tag dosyada iki kez geçerse ikincisi, ilkine "zaten var" muamelesi görür.
    pub fn import(&mut self, items: Vec<Incoming>, overwrite: bool, now: u64) -> Result<ImportSummary, String> {
        let mut sum = ImportSummary::default();
        for item in items {
            let (Ok(tag), false) = (normalize_tag(&item.tag), item.value.is_empty()) else {
                sum.invalid += 1;
                continue;
            };
            let note = item.note.filter(|n| !n.trim().is_empty());
            match self.entries.iter().position(|e| e.tag == tag) {
                Some(_) if !overwrite => sum.skipped += 1,
                Some(i) => {
                    let created_at = self.entries[i].created_at;
                    self.entries[i] = Entry { tag, value: item.value, note, created_at };
                    sum.updated += 1;
                }
                None => {
                    self.entries.push(Entry { tag, value: item.value, note, created_at: now });
                    sum.added += 1;
                }
            }
        }
        if sum.added + sum.updated > 0 {
            self.save().map_err(|e| e.to_string())?;
        }
        Ok(sum)
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

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_store(name: &str) -> Store {
        let dir = std::env::temp_dir().join(format!("zihin-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        Store::load(dir.join("tags.json"))
    }

    fn inc(tag: &str, value: &str, note: Option<&str>) -> Incoming {
        Incoming { tag: tag.into(), value: value.into(), note: note.map(Into::into) }
    }

    #[test]
    fn import_adds_skips_and_counts_invalid() {
        let mut s = temp_store("skip");
        s.upsert(None, "mail", "eski".into(), None, 1).unwrap();
        let sum = s
            .import(
                vec![inc("Mail", "yeni", None), inc("ip", "1.2.3.4", Some("ev")), inc("kötü tag", "x", None), inc("bos", "", None)],
                false,
                9,
            )
            .unwrap();
        assert_eq!(sum, ImportSummary { added: 1, updated: 0, skipped: 1, invalid: 2 });
        assert_eq!(s.find("mail").unwrap().value, "eski");
        assert_eq!(s.find("ip").unwrap().note.as_deref(), Some("ev"));
    }

    #[test]
    fn import_overwrite_keeps_created_at() {
        let mut s = temp_store("overwrite");
        s.upsert(None, "mail", "eski".into(), Some("not".into()), 1).unwrap();
        let sum = s.import(vec![inc("mail", "yeni", None)], true, 9).unwrap();
        assert_eq!(sum, ImportSummary { added: 0, updated: 1, skipped: 0, invalid: 0 });
        let e = s.find("mail").unwrap();
        assert_eq!((e.value.as_str(), e.note.as_deref(), e.created_at), ("yeni", None, 1));
    }

    #[test]
    fn import_persists_and_handles_duplicates_in_file() {
        let mut s = temp_store("persist");
        let sum = s.import(vec![inc("a", "1", None), inc("a", "2", None)], false, 5).unwrap();
        assert_eq!(sum, ImportSummary { added: 1, updated: 0, skipped: 1, invalid: 0 });
        let reloaded = Store::load(s.path.clone());
        assert_eq!(reloaded.find("a").unwrap().value, "1");
    }
}
