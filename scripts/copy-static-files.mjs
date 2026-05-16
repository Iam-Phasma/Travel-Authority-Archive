import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const distRoot = path.join(projectRoot, "dist");

const copyTargets = [
  "header",
  "footer",
  "pdf-generator",
  "admin/draft-ta",
  "admin/employees",
  "admin/upload",
  "admin/view",
  "admin/users",
  "admin/admin-settings.js",
  "404.html",
  "assets/Bagong_Pilipinas_logo.webp",
  "assets/CHED-Logo.webp",
  "assets/Facade.webp",
  "assets/facade-sketch.webp",
  "assets/load.lottie",
];

function copyTarget(relativePath) {
  const src = path.join(projectRoot, relativePath);
  const dest = path.join(distRoot, relativePath);

  if (!fs.existsSync(src)) {
    console.warn(`[copy-static-files] Skipped missing path: ${relativePath}`);
    return;
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
  console.log(`[copy-static-files] Copied: ${relativePath}`);
}

for (const target of copyTargets) {
  copyTarget(target);
}
