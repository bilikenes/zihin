// Yeni sürüm hazırlar: sürüm numarasını her yerde günceller, commit eder ve tag atar.
// Push ETMEZ — kontrol edip kendin push edersin (bkz. RELEASING.md).
//
//   npm run release -- 0.2.0
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2]?.replace(/^v/, "");

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Kullanım: npm run release -- <sürüm>   (örn. 0.2.0)");
  process.exit(1);
}

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

if (git("status", "--porcelain", "--untracked-files=no")) {
  console.error("Önce bekleyen değişiklikleri commit et; çalışma alanı temiz olmalı.");
  process.exit(1);
}
if (git("tag", "--list", `v${version}`)) {
  console.error(`v${version} tag'i zaten var.`);
  process.exit(1);
}

// Dosyanın satır sonunu (LF/CRLF) bozmadan günceller.
const update = (file, fn) => {
  const p = join(root, file);
  const before = readFileSync(p, "utf8");
  const after = fn(before);
  if (after === before) throw new Error(`${file} içinde sürüm bulunamadı`);
  writeFileSync(p, after);
};

const current = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
if (current === version) {
  console.error(`Sürüm zaten ${version}.`);
  process.exit(1);
}

// package.json + package-lock.json (kök paket). tauri.conf.json sürümü package.json'dan okur.
update("package.json", (s) => s.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`));
update("package-lock.json", (s) =>
  s
    .replace(/("name":\s*"zihin",\s*"version":\s*")[^"]+(")/, `$1${version}$2`)
    .replace(/("":\s*\{\s*"name":\s*"zihin",\s*"version":\s*")[^"]+(")/, `$1${version}$2`),
);
// Cargo.toml + Cargo.lock
update("src-tauri/Cargo.toml", (s) => s.replace(/^(version\s*=\s*")[^"]+(")/m, `$1${version}$2`));
update("src-tauri/Cargo.lock", (s) => s.replace(/(name = "zihin"\r?\nversion = ")[^"]+(")/, `$1${version}$2`));

git("add", "package.json", "package-lock.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock");
git("commit", "-m", `Release v${version}`);
git("tag", "-a", `v${version}`, "-m", `Zihin v${version}`);

console.log(`✓ ${current} → ${version}, commit ve v${version} tag'i hazır.`);
console.log(`  Yayınlamak için:  git push --follow-tags`);
