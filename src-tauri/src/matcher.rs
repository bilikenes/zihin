//! Yazılan karakterleri izleyip `;tag` + tetikleyici eşleşmesini bulan saf mantık.
//! Win32'ye bağımlı değildir; bu yüzden `cargo test` ile başsız test edilir.

/// Tamponda tutulan en fazla karakter sayısı.
pub const MAX_BUFFER: usize = 64;

#[derive(Debug, PartialEq, Eq)]
pub struct Expansion {
    /// Silinecek karakter sayısı: önek + tag.
    pub backspaces: usize,
    pub value: String,
}

#[derive(Default)]
pub struct Matcher {
    buffer: Vec<char>,
}

impl Matcher {
    pub const fn new() -> Self {
        Self { buffer: Vec::new() }
    }

    pub fn push(&mut self, c: char) {
        self.buffer.push(c);
        if self.buffer.len() > MAX_BUFFER {
            self.buffer.remove(0);
        }
    }

    pub fn backspace(&mut self) {
        self.buffer.pop();
    }

    /// Kelime sınırı, kısayol, odak değişimi, fare tıklaması gibi durumlarda tamponu boşaltır.
    pub fn reset(&mut self) {
        self.buffer.clear();
    }

    pub fn text(&self) -> String {
        self.buffer.iter().collect()
    }

    /// Tetikleyiciye basıldı. Tampon `önek + kayıtlı tag` ile bitiyorsa genişletmeyi döndürür.
    /// Her durumda tampon boşalır: tetikleyici bir kelime sınırıdır.
    pub fn trigger(&mut self, prefix: char, lookup: impl Fn(&str) -> Option<String>) -> Option<Expansion> {
        let result = self.find(prefix, lookup);
        self.buffer.clear();
        result
    }

    fn find(&self, prefix: char, lookup: impl Fn(&str) -> Option<String>) -> Option<Expansion> {
        let at = self.buffer.iter().rposition(|&c| c == prefix)?;
        let name: String = self.buffer[at + 1..].iter().collect();
        if name.is_empty() {
            return None;
        }
        let value = lookup(&name.to_lowercase())?;
        Some(Expansion { backspaces: self.buffer.len() - at, value })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tags(name: &str) -> Option<String> {
        match name {
            "mail" => Some("test@test.com".into()),
            "ip" => Some("10.0.0.1".into()),
            _ => None,
        }
    }

    fn typed(m: &mut Matcher, s: &str) {
        for c in s.chars() {
            m.push(c);
        }
    }

    #[test]
    fn expands_known_tag() {
        let mut m = Matcher::default();
        typed(&mut m, ";mail");
        assert_eq!(m.trigger(';', tags), Some(Expansion { backspaces: 5, value: "test@test.com".into() }));
    }

    #[test]
    fn matching_is_case_insensitive() {
        let mut m = Matcher::default();
        typed(&mut m, ";MaIl");
        assert_eq!(m.trigger(';', tags).unwrap().value, "test@test.com");
    }

    #[test]
    fn unknown_tag_passes_through() {
        let mut m = Matcher::default();
        typed(&mut m, ";nope");
        assert_eq!(m.trigger(';', tags), None);
    }

    #[test]
    fn text_before_prefix_is_kept_out_of_the_deletion() {
        let mut m = Matcher::default();
        typed(&mut m, "merhaba ;ip");
        let e = m.trigger(';', tags).unwrap();
        assert_eq!(e.backspaces, 3);
        assert_eq!(e.value, "10.0.0.1");
    }

    #[test]
    fn last_prefix_wins() {
        let mut m = Matcher::default();
        typed(&mut m, ";x;mail");
        assert_eq!(m.trigger(';', tags).unwrap().backspaces, 5);
    }

    #[test]
    fn bare_prefix_or_no_prefix_does_nothing() {
        let mut m = Matcher::default();
        typed(&mut m, "mail");
        assert_eq!(m.trigger(';', tags), None);
        typed(&mut m, ";");
        assert_eq!(m.trigger(';', tags), None);
    }

    #[test]
    fn backspace_fixes_a_typo() {
        let mut m = Matcher::default();
        typed(&mut m, ";maix");
        m.backspace();
        m.backspace();
        typed(&mut m, "il");
        assert_eq!(m.trigger(';', tags).unwrap().value, "test@test.com");
    }

    #[test]
    fn trigger_always_clears_the_buffer() {
        let mut m = Matcher::default();
        typed(&mut m, ";mail");
        m.trigger(';', tags);
        assert_eq!(m.trigger(';', tags), None);
        assert_eq!(m.text(), "");
    }

    #[test]
    fn reset_forgets_everything() {
        let mut m = Matcher::default();
        typed(&mut m, ";mai");
        m.reset();
        typed(&mut m, "l");
        assert_eq!(m.trigger(';', tags), None);
    }

    #[test]
    fn custom_prefix() {
        let mut m = Matcher::default();
        typed(&mut m, "#ip");
        assert_eq!(m.trigger('#', tags).unwrap().backspaces, 3);
    }

    #[test]
    fn buffer_is_bounded() {
        let mut m = Matcher::default();
        typed(&mut m, &"a".repeat(MAX_BUFFER * 3));
        typed(&mut m, ";ip");
        assert!(m.text().chars().count() <= MAX_BUFFER);
        assert_eq!(m.trigger(';', tags).unwrap().backspaces, 3);
    }
}
