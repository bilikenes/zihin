//! Otomatik tamamlama balonunun saf mantığı: hangi tag'ler önerilir, hangi sırayla, Tab ne yapar.
//! Win32'ye bağımlı değildir; `cargo test` ile başsız test edilir.

use std::{collections::HashMap, fs, path::PathBuf};

/// Balonda en fazla bu kadar satır görünür.
pub const MAX_ITEMS: usize = 5;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Candidate {
    pub tag: String,
    pub note: Option<String>,
}

/// Yazılan metne `typed` ile başlayan tag'leri sıralar: birebir eşleşme en üstte, sonra en çok
/// kullanılan, sonra kısa olan, sonra alfabetik. Boş metin için öneri yoktur.
pub fn rank(typed: &str, entries: &[(String, Option<String>)], usage: &HashMap<String, u64>) -> Vec<Candidate> {
    let typed = typed.to_lowercase();
    if typed.is_empty() {
        return Vec::new();
    }
    let mut hits: Vec<&(String, Option<String>)> = entries.iter().filter(|(tag, _)| tag.starts_with(&typed)).collect();
    hits.sort_by(|(a, _), (b, _)| {
        let used = |t: &String| usage.get(t).copied().unwrap_or(0);
        (b == &typed)
            .cmp(&(a == &typed))
            .then(used(b).cmp(&used(a)))
            .then(a.len().cmp(&b.len()))
            .then(a.cmp(b))
    });
    hits.into_iter()
        .take(MAX_ITEMS)
        .map(|(tag, note)| Candidate { tag: tag.clone(), note: note.clone() })
        .collect()
}

/// Tetikleyici tuşa (Tab...) basılınca vurgulu satırla ne yapılır?
#[derive(Debug, PartialEq, Eq)]
pub enum Action {
    /// Vurgulu tag, yazılanla aynı: değeri yaz.
    Expand,
    /// Vurgulu tag yazılandan uzun: yalnızca tag'i tamamla.
    Complete,
}

pub fn decide(typed: &str, highlighted: &str) -> Action {
    if typed.to_lowercase() == highlighted { Action::Expand } else { Action::Complete }
}

/// Hangi tag kaç kez genişletildi (`usage.json`). Yalnızca kanca süreci yazar.
pub struct Usage {
    path: PathBuf,
    pub counts: HashMap<String, u64>,
}

impl Usage {
    pub fn load(path: PathBuf) -> Self {
        let counts = fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(s.trim_start_matches('\u{feff}')).ok())
            .unwrap_or_default();
        Self { path, counts }
    }

    /// Sayacı artırır ve diske yazar. Yazma hatası önemsizdir: yalnızca sıralamayı etkiler.
    pub fn record(&mut self, tag: &str) {
        *self.counts.entry(tag.to_string()).or_insert(0) += 1;
        if let Ok(json) = serde_json::to_string(&self.counts) {
            let tmp = self.path.with_extension("json.tmp");
            if fs::write(&tmp, json).is_ok() {
                let _ = fs::rename(&tmp, &self.path);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entries() -> Vec<(String, Option<String>)> {
        ["tag", "tag1", "tag2", "takip", "mail", "toplanti-notlari"]
            .iter()
            .map(|t| (t.to_string(), None))
            .collect()
    }

    fn tags(c: &[Candidate]) -> Vec<&str> {
        c.iter().map(|c| c.tag.as_str()).collect()
    }

    #[test]
    fn only_prefix_matches_are_suggested() {
        let r = rank("ta", &entries(), &HashMap::new());
        assert_eq!(tags(&r), ["tag", "tag1", "tag2", "takip"]);
    }

    #[test]
    fn exact_match_always_comes_first() {
        let usage = HashMap::from([("tag1".to_string(), 99)]);
        let r = rank("tag", &entries(), &usage);
        assert_eq!(tags(&r), ["tag", "tag1", "tag2"]);
    }

    #[test]
    fn more_used_tags_rank_higher_then_shorter_then_alphabetical() {
        let usage = HashMap::from([("tag2".to_string(), 5), ("takip".to_string(), 1)]);
        let r = rank("ta", &entries(), &usage);
        assert_eq!(tags(&r), ["tag2", "takip", "tag", "tag1"]);
    }

    #[test]
    fn matching_ignores_case_and_empty_text_suggests_nothing() {
        assert_eq!(tags(&rank("MAI", &entries(), &HashMap::new())), ["mail"]);
        assert!(rank("", &entries(), &HashMap::new()).is_empty());
        assert!(rank("zzz", &entries(), &HashMap::new()).is_empty());
    }

    #[test]
    fn at_most_max_items() {
        let many: Vec<_> = (0..20).map(|i| (format!("a{i:02}"), None)).collect();
        assert_eq!(rank("a", &many, &HashMap::new()).len(), MAX_ITEMS);
    }

    #[test]
    fn tab_rule_expand_on_exact_complete_otherwise() {
        assert_eq!(decide("tag", "tag"), Action::Expand);
        assert_eq!(decide("TAG", "tag"), Action::Expand);
        assert_eq!(decide("ta", "tag"), Action::Complete);
        assert_eq!(decide("tag", "tag1"), Action::Complete);
    }

    #[test]
    fn usage_is_saved_and_reloaded() {
        let dir = std::env::temp_dir().join(format!("zihin-usage-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("usage.json");
        let mut u = Usage::load(path.clone());
        u.record("mail");
        u.record("mail");
        u.record("ip");
        let again = Usage::load(path);
        assert_eq!((again.counts["mail"], again.counts["ip"]), (2, 1));
    }
}
