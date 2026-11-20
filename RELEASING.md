# Sürüm çıkarma

## Nasıl çalışıyor

```
npm run release -- 0.2.0  →  git push --follow-tags  →  GitHub Actions derler + imzalar
        →  taslak Release (setup.exe + latest.json)  →  sen "Publish" dersin  →  uygulamalar güncellemeyi görür
```

- Kurulu uygulamalar açıldıktan ~4 sn sonra, sonra da her 6 saatte bir (uygulama tray'de günlerce açık kalır)
  `https://github.com/bilikenes/zihin/releases/latest/download/latest.json` adresine bakar.
- `latest.json` içindeki imza, `tauri.conf.json > plugins.updater.pubkey` ile doğrulanır. İmzası tutmayan
  hiçbir güncelleme kurulmaz. `requireSignedVersion` açık: imza, hangi sürüm için atıldığını da taşır, bu yüzden
  eski ama geçerli imzalı bir sürüme düşürme (downgrade) saldırısı da reddedilir.
- Sürüm numarasının tek kaynağı `package.json` (`tauri.conf.json` oradan okur). `npm run release` betiği
  `Cargo.toml`/`Cargo.lock`/`package-lock.json`'ı da eşitler.
- Uygulamada: yeni sürüm varsa sayfanın üstünde bir bildirim ve kenar çubuğunda "Güncelleme" rozeti çıkar;
  **Ayarlar → Güncellemeler** kartından elle denetlenip kurulabilir. Kurulum sessizce (passive) yapılır ve
  uygulama yeniden açılır.

> **Önce kontrol et:** Yukarıdaki GitHub adresi (`bilikenes/zihin`) varsayımdır. Depo adı farklıysa
> `src-tauri/tauri.conf.json` içindeki `endpoints` ve `homepage`, `src-tauri/Cargo.toml` içindeki `repository`
> ve bu dosyadaki adresi düzelt. Depo oluşana kadar uygulama güncelleme denetiminde sessizce "bulunamadı" der.

## Bir kerelik kurulum

### 1. İmza anahtarını GitHub'a ekle

Anahtar çifti bu bilgisayarda üretildi:

| Dosya | Ne |
|---|---|
| `%USERPROFILE%\.tauri\zihin.key` | **Özel anahtar** — gizli, repoya asla girmez |
| `%USERPROFILE%\.tauri\zihin.key.pub` | Açık anahtar — `tauri.conf.json` içinde zaten var |

Özel anahtarı repo secret'ı olarak ekle:

```bash
# Git Bash
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/zihin.key
```

```powershell
# PowerShell
Get-Content "$env:USERPROFILE\.tauri\zihin.key" -Raw | gh secret set TAURI_SIGNING_PRIVATE_KEY
```

Ya da GitHub'da: **Settings → Secrets and variables → Actions → New repository secret**,
ad `TAURI_SIGNING_PRIVATE_KEY`, değer `zihin.key` dosyasının içeriği.

Anahtarın parolası yok, bu yüzden `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secret'ı gerekmez.

### 2. Anahtarı yedekle

`zihin.key` dosyasını bir parola yöneticisine veya şifreli bir yedeğe koy. **Kaybolursa mevcut
kullanıcılara bir daha güncelleme gönderilemez** — yeni anahtarla imzalanan sürümleri eski kurulumlar reddeder,
herkesin yeni sürümü elle indirmesi gerekir.

## Her sürümde

1. `main` dalında, temiz bir çalışma alanıyla:
   ```bash
   npm run release -- 0.2.0
   ```
   Betik sürümü günceller, `Release v0.2.0` commit'ini ve `v0.2.0` tag'ini oluşturur. Push etmez.
2. Yayınla:
   ```bash
   git push --follow-tags
   ```
3. **Actions** sekmesinde *Release* iş akışının bitmesini bekle (~10 dk).
4. **Releases** sayfasındaki taslağı aç: *Değişiklikler* bölümünü doldur, `Zihin_0.2.0_x64-setup.exe`
   ve `latest.json` dosyalarının yüklendiğini kontrol et, **Publish release** de.

Yayınlanana kadar taslak, kullanıcılara görünmez ve güncelleme olarak sunulmaz.

## Yerelde imzalı derleme

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$env:USERPROFILE\.tauri\zihin.key" -Raw
npm run tauri:build
```

`createUpdaterArtifacts` açık olduğu için imza anahtarı olmadan `tauri build` imza adımında hata verir.
Çıktı: `src-tauri/target/release/bundle/nsis/` (kurulum dosyası ve `.sig` imzası).

## Güncelleme arayüzünü önizleme (geliştirme)

Tarayıcıda `npm run dev` ile açıp adrese `?update=available`, `?update=downloading`, `?update=latest` veya
`?update=error` ekle; gerçek sürüm yayınlamadan arayüzün her durumunu görebilirsin. Yalnızca geliştirmede çalışır.

## Kod imzalama (henüz yok)

Kurulum dosyası Authenticode ile imzalı değil; Windows SmartScreen ilk sürümlerde "Bilinmeyen yayımcı" uyarısı
gösterir. Kaldırmak için bir kod imzalama hizmeti gerekir, ücretli ve ayrı bir karar.
