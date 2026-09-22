// Dev-only: optimise campus building photos into two WebP sizes.
//
//   1. drop originals into web/public/campus/_src/<building-id>.<ext>
//      (that folder is gitignored — originals never ship in the repo/image)
//   2. run:  node scripts/optimize-campus-photos.mjs
//   3. it writes public/campus/<id>-800.webp and <id>-1600.webp
//   4. wire the photo into lib/campus.ts:
//        photo: { src: "/campus/<id>-1600.webp", w: 1600, h: <height> }
//
// Two fixed widths + WebP keep us off runtime sharp (alpine/arm64) and give
// next/image explicit dimensions → zero CLS. sharp is already in the lockfile.

import { readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, basename } from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SRC = join(ROOT, "public", "campus", "_src");
const OUT = join(ROOT, "public", "campus");
const SIZES = [800, 1600];
const EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

async function main() {
  if (!existsSync(SRC)) {
    console.error(`No source folder: ${SRC}\nCreate it and add <building-id>.<jpg|png> originals.`);
    process.exit(1);
  }
  await mkdir(OUT, { recursive: true });

  const files = (await readdir(SRC)).filter((f) => EXTS.has(extname(f).toLowerCase()));
  if (files.length === 0) {
    console.log("No source images found in", SRC);
    return;
  }

  for (const file of files) {
    const id = basename(file, extname(file));
    const input = join(SRC, file);
    for (const w of SIZES) {
      const dest = join(OUT, `${id}-${w}.webp`);
      const info = await sharp(input)
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toFile(dest);
      console.log(`✓ ${id}-${w}.webp  ${info.width}×${info.height}`);
    }
  }
  console.log("\nDone. Now set `photo` for each building in lib/campus.ts.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
