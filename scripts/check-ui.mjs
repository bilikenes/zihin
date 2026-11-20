#!/usr/bin/env node
// Amber UI rule check. Scans app code (not src/ui itself) for things that break
// visual consistency.
//   node check-ui.mjs [src-dir]        exit 1 on errors
// Silence a single line with a trailing comment containing: ui-allow
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? "src");
const EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".html"]);

const RULES = [
  // CSS: any hex after a colon. TS/TSX: a quoted string that is exactly a hex colour.
  { level: "error", id: "raw-color", css: true, re: /:[^;{]*#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/,
    msg: "Raw colour. Use a token: var(--color-*)." },
  { level: "error", id: "raw-color", code: true, re: /["'`]#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})["'`]/,
    msg: "Raw colour. Use a token: var(--color-*)." },
  { level: "error", id: "raw-color-fn", re: /\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/,
    msg: "Raw colour function. Use a token: var(--color-*)." },
  { level: "error", id: "font-family", re: /font-family\s*:|fontFamily\s*:/,
    msg: "Custom font. Typography comes from tokens (Inter via --font-sans / --font-mono)." },
  { level: "error", id: "direct-glisse", re: /from\s+["']glisse["']/,
    msg: "Import glisse components from \"./ui\", not from glisse directly." },
  { level: "error", id: "foreign-ui-lib",
    re: /from\s+["'](?:@mui\/|antd|@chakra-ui\/|react-bootstrap|bootstrap|@mantine\/|primereact|semantic-ui|@headlessui\/|@radix-ui\/themes)/,
    msg: "Other UI kits are not allowed. Use Amber UI components." },
  { level: "error", id: "foreign-icons", re: /from\s+["'](?:react-icons|@heroicons\/|@fortawesome\/|@mui\/icons-material|@tabler\/icons|phosphor-react|@phosphor-icons\/)/,
    msg: "Icons come from lucide-react only." },
  { level: "error", id: "tailwind", re: /@tailwind\b|@import\s+["']tailwindcss/,
    msg: "Tailwind is not part of Amber UI. Use layout.css helpers and tokens." },
  { level: "warn", id: "raw-px", re: /:\s*[^;{]*\b(?!0px)\d+px\b/, css: true,
    msg: "Raw px value in CSS. Prefer --space-*, --radius-*, --text-* tokens." },
  { level: "warn", id: "inline-color-style", re: /style=\{\{[^}]*\b(?:color|background|backgroundColor|borderColor)\s*:/,
    msg: "Inline colour style. Prefer a class using tokens." },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      if (p === join(root, "ui")) continue; // the design system itself
      walk(p, out);
    } else if (EXT.has(extname(name))) out.push(p);
  }
  return out;
}

let errors = 0, warns = 0;
for (const file of walk(root)) {
  const isCss = extname(file) === ".css";
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.includes("ui-allow")) return;
    for (const r of RULES) {
      if (r.css && !isCss) continue;
      if (r.code && isCss) continue;
      if (r.re.test(line)) {
        const rel = relative(process.cwd(), file).split(sep).join("/");
        console.log(`${r.level === "error" ? "ERROR" : "warn "} ${rel}:${i + 1}  [${r.id}] ${r.msg}\n        ${line.trim().slice(0, 120)}`);
        r.level === "error" ? errors++ : warns++;
      }
    }
  });
}

console.log(`\nAmber UI check: ${errors} error(s), ${warns} warning(s).`);
process.exit(errors ? 1 : 0);
