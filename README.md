<div align="center">

<img src="design/zihin-icon-kit-iris-moru/master-1024.png" alt="Zihin logosu: arşivci sincap" width="220" />

# Zihin

**Tag yaz, tuşa bas, değeri gelsin.**

[![Son sürüm](https://img.shields.io/github/v/release/bilikenes/zihin?color=7C5CFF&label=s%C3%BCr%C3%BCm)](https://github.com/bilikenes/zihin/releases/latest)
[![CI](https://github.com/bilikenes/zihin/actions/workflows/ci.yml/badge.svg)](https://github.com/bilikenes/zihin/actions/workflows/ci.yml)
![Platform](https://img.shields.io/badge/platform-Windows-1c1b17)
![Tauri 2](https://img.shields.io/badge/Tauri-2-7C5CFF)

[İndir](https://github.com/bilikenes/zihin/releases/latest) · [Özellikler](#özellikler) · [Geliştirme](#geliştirme) · [Sürüm çıkarma](RELEASING.md)

</div>

---

## Zihin nedir?

IBAN'ını, e-posta adresini, sunucu IP'sini ya da sık yazdığın bir cümleyi her seferinde ezbere yazmak veya bir yerden
kopyalamak zorunda değilsin. Zihin'de bunları bir **tag**'e bağlarsın; herhangi bir uygulamada `;iban` yazıp
<kbd>Tab</kbd>'a basınca değer olduğu yerde belirir.

Tauri 2 (Rust) ile yazıldığı için küçük ve hızlıdır. Arka planda tepsiden çalışır, istersen Windows ile birlikte başlar.

## Özellikler

- **Her yerde çalışır:** tarayıcı, editör, sohbet uygulaması… Tag'i nereye yazarsan oraya genişler.
- **Tetikleyici tuşu sen seç:** <kbd>Tab</kbd>, <kbd>Enter</kbd> ya da <kbd>Boşluk</kbd>. Eşleşen tag yoksa tuş normal çalışır.
- **Kendi önekin:** varsayılan `;`, istersen `#`, `@`, `~` ya da `,`.
- **Gizli değerler:** tablodaki değerler noktalı gösterilir; tıklayınca panoya kopyalanır.
- **Not ve arama:** her tag'e bir not ekle, tag ve notlar içinde ara.
- **Hızlı ekleme:** <kbd>Ctrl</kbd>+<kbd>N</kbd> ile yeni tag formu açılır.
- **Tepsi desteği:** pencereyi kapatınca arka planda çalışmaya devam eder.
- **Windows ile başlat** seçeneği ve tek örnek koruması.
- **Açık ve koyu tema**, özel pencere çubuğu ve animasyonlu arka plan.
- **Otomatik güncelleme:** yeni sürümler imza doğrulamasıyla kendiliğinden kurulur.

## Kurulum

[Releases](https://github.com/bilikenes/zihin/releases/latest) sayfasından `Zihin_x.y.z_x64-setup.exe` dosyasını
indirip çalıştır. Yönetici izni gerekmez. Kurulumdan sonra güncellemeleri uygulama kendisi bulur.

> Kurulum dosyası henüz kod imzası taşımadığından Windows SmartScreen "Bilinmeyen yayımcı" uyarısı gösterebilir:
> **Ek bilgi → Yine de çalıştır**.

## Kullanım

1. Zihin'i aç ve **Yeni tag** ile bir tag oluştur (ör. `iban`, değer: IBAN numaran).
2. Herhangi bir uygulamada `;iban` yaz.
3. Tetikleyici tuşa (varsayılan <kbd>Tab</kbd>) bas; `;iban` yazdığın yerde değerin belirir.

> **İpucu:** Ayarlar bölümünden tetikleyici tuşu ve tag önekini değiştirebilirsin.

## Geliştirme

Gereksinimler: Node.js 20+, [Rust](https://rustup.rs) ve Tauri 2'nin [Windows ön koşulları](https://tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri:dev     # geliştirme (sıcak yenileme)
npm run tauri:build   # Windows yükleyicisi (NSIS); imza anahtarı gerekir, bkz. RELEASING.md
npm run check:ui      # Amber UI kural denetimi
cargo test --manifest-path src-tauri/Cargo.toml
```

| Klasör | İçerik |
|---|---|
| `src/` | React arayüzü (tag tablosu, ayarlar, güncelleme) |
| `src-tauri/src/expander.rs` | Klavye dinleme ve metin genişletme |
| `src-tauri/src/matcher.rs` | Tag eşleştirme |
| `src-tauri/src/store.rs` | Tag'lerin ve ayarların saklanması |
| `design/` | Simge setleri |

## Görsel kimlik

Zihin'in simgesi, her şeyi düzenli bir arşivde tutan bir sincaptır: sincabın kış için fındık biriktirmesi gibi Zihin de
sık kullandığın metinleri saklar ve gerektiğinde önüne koyar. Çizim iris moru tonlarında, gravür diliyle hazırlanmıştır.
Simge setleri (`.ico`, Tauri, web ve PNG boyutları) `design/zihin-icon-kit-iris-moru/` altındadır.

---

<div align="center">
  <sub>© 2026 Enes Bilik</sub>
</div>
