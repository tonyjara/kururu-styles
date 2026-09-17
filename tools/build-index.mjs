/**
 * `index.json`, from the directories.
 *
 *     node tools/build-index.mjs           # write it
 *     node tools/build-index.mjs --check   # fail if it would change
 *
 * It is generated and committed, which is an unusual pair and is the point.
 * Generated, because hand-maintaining it would mean every pull request touching
 * the same three lines and conflicting with every other one. Committed, because
 * kururu fetches it from `raw.githubusercontent.com` and nothing else — no API,
 * no auth, no rate limit, no build service that has to be up for somebody's
 * Settings dialog to work. CI rewrites it on merge, so the copy on `main` is
 * always what the directories say.
 *
 * ## What is in it, and what deliberately is not
 *
 * Every entry carries its version, the list of its files with a digest each, and
 * one digest over the whole entry. Kururu pins the version and the digest at
 * install: the version is what "update available" is computed from, the digest
 * is what verifies that the bytes which arrived are the bytes this repository
 * has. That is npm's integrity field doing npm's job, and the failure it catches
 * is the boring one — a truncated download over a phone connection leaving half
 * a sprite sheet in somebody's config directory.
 *
 * Each entry also carries a `preview`: the handful of values Settings needs to
 * *draw* the entry before anybody installs it. A list of names would make you
 * install a theme to find out what colour it is and then install another, which
 * is the same argument kururu's own Appearance tab already makes about its
 * swatches. It is a subset rather than the whole manifest so that this file
 * stays small and stays readable in a diff — the manifest is one fetch away for
 * anything that needs more.
 *
 * What is *not* in it is anything derived from the repository's history. A
 * commit sha would be an honest version and a useless one: nobody choosing a
 * theme wants to be told it is at `a3f91c2`, and it would make this repository's
 * git history part of a wire format.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  digestOf,
  entries,
  filesOf,
  readJson,
  ROOT,
  SCHEMA,
  sha256,
  sizeOf,
} from "./lib.mjs";
import { readFileSync } from "node:fs";

const BASE_ICONS = { close: "✕", run: "▸", restart: "↻", caret: "▾", add: "+", edit: "✎", external: "↗" };

const out = [];

for (const e of entries()) {
  const m = readJson(e.manifestPath);
  const files = filesOf(e.dir);
  out.push({
    kind: e.kind,
    id: e.id,
    name: m.name,
    version: m.version,
    description: m.description,
    author: m.author,
    licence: m.licence,
    ...(m.homepage ? { homepage: m.homepage } : {}),
    ...(m.source ? { source: m.source } : {}),
    path: e.dir,
    manifest: e.manifestName,
    digest: digestOf(e.dir, files),
    files: files.map((name) => ({
      name,
      size: sizeOf(e.dir, name),
      digest: sha256(readFileSync(join(ROOT, e.dir, name))),
    })),
    preview: preview(e.kind, m, files),
  });
}

/**
 * Enough to draw the entry, and not a byte more.
 *
 * A theme's preview is the five swatches kururu's own theme picker uses plus the
 * ground they sit on, because those are what somebody choosing between two dark
 * flavours is actually comparing — a row of neutrals would make every one of
 * them look identical. A skin's is the shape of a card: its radius, its line
 * weight, its face and two steps of its type ramp, so that the option can be
 * drawn *in itself* rather than described. A mascot's is the geometry, so the
 * sheet can be cut and animated straight from the picker.
 */
function preview(kind, m, files) {
  if (kind === "theme") {
    return {
      appearance: m.appearance,
      bg: m.ui.bg,
      chrome: m.ui.chrome,
      line: m.ui.line,
      text: m.ui.text,
      accent: m.ui.accent,
      working: m.ui.working,
      blocked: m.ui.blocked,
      done: m.ui.done,
    };
  }
  if (kind === "skin") {
    const t = m.tokens ?? {};
    const pick = ["radiusLg", "radiusXl", "border", "borderStyle", "ui", "fsXs", "fsLg", "uiLineHeight", "uiLetterSpacing", "frame"];
    const p = {};
    for (const name of pick) if (t[name] !== undefined) p[name] = t[name];
    p.run = m.icons?.run ?? BASE_ICONS.run;
    // A skin that ships a face is previewed in the fallback, because nothing is
    // installed yet. Saying so is better than a card that quietly lies about
    // what it will look like.
    p.fonts = (m.fonts ?? []).map((f) => f.family);
    // A skin made of pictures cannot be drawn from numbers at all, so its card
    // is a screenshot the author put in the directory as `shot.png` — proxied
    // by kururu the way a mascot's sheet is. Which parts it paints travels too,
    // so a card with no screenshot can at least say "paints the panes".
    p.parts = Object.keys(m.parts ?? {});
    if (files.includes("shot.png")) p.shot = "shot.png";
    return p;
  }
  if (kind === "mascot") {
    return {
      sheet: m.sheet,
      frame: m.frame,
      trim: m.trim,
      working: m.working,
      idle: m.idle ?? null,
    };
  }
  return { theme: m.theme, skin: m.skin, mascot: m.mascot };
}

/**
 * `generated` is deliberately *not* in here.
 *
 * A timestamp would make this file change on every CI run whether or not
 * anything did, which turns "did anything actually change" — the question
 * `--check` exists to answer, and the question a reviewer asks of a diff — into
 * a question nobody can answer by looking. The digests already say what the
 * state is; a clock says only when the machine ran.
 */
const index = { schema: SCHEMA, entries: out };
const text = `${JSON.stringify(index, null, 2)}\n`;
const path = join(ROOT, "index.json");

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(path, "utf8");
  } catch {}
  if (current !== text) {
    console.error("index.json is out of date. Run: node tools/build-index.mjs");
    process.exit(1);
  }
  console.log(`ok — index.json matches ${out.length} entries`);
} else {
  writeFileSync(path, text);
  console.log(`index.json — ${out.length} entries`);
}
