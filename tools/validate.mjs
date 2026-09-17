/**
 * Whether what is in this repository is something kururu can install.
 *
 * Run it on your own change before you open a pull request:
 *
 *     node tools/validate.mjs
 *
 * It is the whole review, and that is deliberate. A repository of data that
 * three hundred people contribute to cannot be held together by a maintainer
 * reading hex codes, so everything that could be checked mechanically is checked
 * here and a human is left with the only question a human is better at, which is
 * whether the thing looks good.
 *
 * Two of the rules below are worth reading even if you never run this.
 *
 * **A manifest may not name a URL.** Not in a font, not in a stylesheet, not in
 * a token. A window that fetches a border image from somebody else's host tells
 * that host when its owner is working, and kururu is a window somebody has open
 * all day — so a style's assets are files in its own directory, kururu copies
 * them to the machine, and they are served from kururu's own origin. This is the
 * one rule with no exceptions and no configuration.
 *
 * **A changed entry must have a bumped version.** The committed `index.json` is
 * the published state; this recomputes every digest and, where one has moved,
 * insists the version moved too. Without it the common failure is silent and
 * miserable: somebody fixes a colour, the digest changes, kururu compares
 * versions, sees `1.0.0` on both sides and tells every user they are up to date
 * forever.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  compareVersions,
  digestOf,
  entries,
  filesOf,
  ID,
  PACK_PARTS,
  pngSize,
  readJson,
  ROOT,
  SCHEMA,
  SEMVER,
  sizeOf,
  VOCAB,
  wavMs,
} from "./lib.mjs";

const problems = [];
const fail = (where, message) => problems.push(`${where}: ${message}`);

/**
 * A megabyte for a sprite sheet and a megabyte for a font.
 *
 * Not a guard against anybody — it is a picture in a public repository — but
 * against the accident, which is somebody committing a 4000×4000 export of the
 * sheet they cut the sprite from. Kururu ships every installed sheet to whatever
 * is looking at it, including a phone on a cellular connection, and the frog it
 * has always used is fifteen kilobytes.
 */
const MAX_ASSET = 1024 * 1024;

/**
 * And a quarter of that for a sound, with a length cap beside it.
 *
 * Two limits rather than one because they catch different mistakes. The size
 * catches a WAV nobody downsampled — a stereo 48kHz blip is four times the mono
 * 22kHz one and sounds identical through a laptop speaker. The length catches
 * the thing somebody actually wants to contribute, which is a tune they like.
 */
const MAX_SOUND = 256 * 1024;
const MAX_SOUND_MS = 2000;

/** Hex, `rgb()`/`rgba()`, or `hsl()`/`hsla()`. A colour, and nothing that could be a function call. */
const COLOUR = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%/deg]+\))$/;

/**
 * Anything that would reach off this package at paint time.
 *
 * `url(` with a scheme, `@import`, and the two protocol-relative spellings.
 * Checked over the manifest as a whole rather than per field, because the point
 * is that there is nowhere in a manifest this is allowed, and a per-field list
 * is a list somebody will add a field to without adding the check.
 */
const REMOTE = /(url\(\s*['"]?\s*(https?:)?\/\/)|(@import)|(['"]https?:\/\/)/i;

const index = existsSync(join(ROOT, "index.json")) ? readJson("index.json") : { entries: [] };
const published = new Map(index.entries.map((e) => [`${e.kind}/${e.id}`, e]));

const found = new Map();

for (const e of entries()) {
  const where = `${e.dir}`;
  let m;
  try {
    m = readJson(e.manifestPath);
  } catch (error) {
    fail(where, `${e.manifestName} is missing or is not JSON (${error.message})`);
    continue;
  }

  // --- the metadata every kind carries ------------------------------------
  if (m.schema !== SCHEMA) fail(where, `"schema" must be ${SCHEMA}, not ${JSON.stringify(m.schema)}`);
  if (m.kind !== e.kind) fail(where, `"kind" must be "${e.kind}", not ${JSON.stringify(m.kind)}`);
  if (m.id !== e.id) fail(where, `"id" must match the directory name — "${e.id}", not ${JSON.stringify(m.id)}`);
  if (!ID.test(String(m.id))) fail(where, `"id" must be lowercase letters, digits and dashes`);
  if (!SEMVER.test(String(m.version))) fail(where, `"version" must be major.minor.patch, not ${JSON.stringify(m.version)}`);
  for (const field of ["name", "description", "author", "licence"]) {
    if (typeof m[field] !== "string" || !m[field].trim()) fail(where, `"${field}" is required`);
  }
  if (typeof m.description === "string" && m.description.length > 200) {
    fail(where, `"description" is one line — 200 characters at most, this one is ${m.description.length}`);
  }
  /**
   * Everything except the two fields that are *credits*.
   *
   * `homepage` and `source` are links a person clicks — where a palette came
   * from, who drew a sprite — and nothing in kururu ever fetches them. Every
   * other field is read while the window is painting, which is the whole
   * distinction the rule is drawn on: a citation is a sentence, an asset is a
   * request, and only the second one tells somebody else that you are working.
   */
  const { homepage, source, ...painted } = m;
  void homepage;
  void source;
  if (REMOTE.test(JSON.stringify(painted))) {
    fail(where, `names a URL outside "homepage"/"source". Assets are files in this directory; see the header of tools/validate.mjs`);
  }

  const files = filesOf(e.dir);
  for (const name of files) {
    if (sizeOf(e.dir, name) > MAX_ASSET) fail(where, `${name} is over a megabyte`);
  }

  if (e.kind === "theme") validateTheme(where, m);
  if (e.kind === "skin") validateSkin(where, m, e.dir, files);
  if (e.kind === "mascot") validateMascot(where, m, e.dir, files);
  if (e.kind === "sound") validateSound(where, m, e.dir, files);

  found.set(`${e.kind}/${e.id}`, { entry: e, manifest: m, files });
}

// Packs point at other entries, so they are checked once everything is known.
for (const [key, { entry, manifest }] of found) {
  if (entry.kind !== "pack") continue;
  for (const { kind, required } of PACK_PARTS) {
    const id = manifest[kind];
    // An absent optional part is a pack with no opinion about that half of the
    // look, which is a real thing for a pack to be — see `PACK_PARTS`.
    if (id === undefined && !required) continue;
    if (typeof id !== "string" || !ID.test(id)) {
      fail(entry.dir, `"${kind}" must be the id of a ${kind} in this repository`);
    } else if (!found.has(`${kind}/${id}`)) {
      fail(entry.dir, `names ${kind} "${id}", which is not in this repository`);
    }
  }
  void key;
}

// --- the version bump ------------------------------------------------------
for (const [key, { entry, manifest, files }] of found) {
  const was = published.get(key);
  if (!was) continue; // New entry. Nothing to bump against.
  const digest = digestOf(entry.dir, files);
  if (digest === was.digest) continue;
  if (compareVersions(String(manifest.version), String(was.version)) > 0) continue;
  fail(
    entry.dir,
    `its files changed but "version" is still ${was.version}. Bump it — patch for a fix, ` +
      `minor for anything somebody would notice, major if an id or a file name moved.`,
  );
}

// ---------------------------------------------------------------------------

function validateTheme(where, m) {
  if (!VOCAB.theme.appearance.includes(m.appearance)) {
    fail(where, `"appearance" must be one of ${VOCAB.theme.appearance.join(", ")}`);
  }
  for (const [group, names] of [
    ["ui", VOCAB.theme.ui],
    ["terminal", VOCAB.theme.terminal],
    ["workspace", VOCAB.theme.workspace],
  ]) {
    const block = m[group];
    if (!block || typeof block !== "object") {
      fail(where, `"${group}" is required and must be an object of ${names.length} colours`);
      continue;
    }
    for (const name of names) {
      if (!(name in block)) fail(where, `"${group}.${name}" is missing`);
      else if (!COLOUR.test(String(block[name]))) {
        fail(where, `"${group}.${name}" is ${JSON.stringify(block[name])}, which is not a colour`);
      }
    }
    for (const name of Object.keys(block)) {
      if (!names.includes(name)) fail(where, `"${group}.${name}" is not a token kururu answers for`);
    }
  }
}

function validateSkin(where, m, dir, files) {
  /**
   * A skin is the difference it makes, and since the studio a difference may be
   * a picture rather than a token: a skin that paints its panes and moves no
   * radius is a skin. What is still refused is one that does nothing at all,
   * because offering it is offering the default under another name.
   */
  const tokens = m.tokens ?? {};
  if (typeof tokens !== "object" || Array.isArray(tokens)) fail(where, `"tokens" must be an object of CSS values`);
  const parts = m.parts ?? {};
  if (typeof parts !== "object" || Array.isArray(parts)) fail(where, `"parts" must be an object, one entry per part it paints`);
  const colors = m.colors ?? {};
  if (typeof colors !== "object" || Array.isArray(colors)) fail(where, `"colors" must be an object of chrome colours`);
  const moves =
    Object.keys(tokens).length + Object.keys(parts).length + Object.keys(colors).length + (m.iconSheet ? 1 : 0);
  if (moves === 0) fail(where, `moves nothing — no tokens, no parts, no colours — so this skin is the default with a different name`);

  for (const [name, value] of Object.entries(tokens)) {
    if (!VOCAB.skin.tokens.includes(name)) fail(where, `"tokens.${name}" is not a token kururu answers for`);
    if (typeof value !== "string") fail(where, `"tokens.${name}" must be a string — a CSS value, units and all`);
  }
  for (const [name, value] of Object.entries(m.icons ?? {})) {
    if (!VOCAB.skin.icons.includes(name)) fail(where, `"icons.${name}" is not an icon kururu draws`);
    if (value !== null && (typeof value !== "string" || [...value].length > 2)) {
      fail(where, `"icons.${name}" must be a glyph or two, or null to keep kururu's`);
    }
  }

  /**
   * The pictures. Each names a PNG in this directory and says how it is cut,
   * and the cut has to fit the picture: a slice that adds up to more than the
   * picture is wide is a frame with no middle, which the browser draws as
   * nothing at all.
   */
  for (const [name, p] of Object.entries(parts)) {
    if (!VOCAB.skin.parts.includes(name)) {
      fail(where, `"parts.${name}" is not a part kururu paints — one of ${VOCAB.skin.parts.join(", ")}`);
      continue;
    }
    if (!p || typeof p !== "object") {
      fail(where, `"parts.${name}" must be an object with an "image"`);
      continue;
    }
    const size = picture(where, `parts.${name}.image`, p.image, dir, files);
    if (p.mode !== undefined && !VOCAB.skin.paintModes.includes(p.mode)) {
      fail(where, `"parts.${name}.mode" must be one of ${VOCAB.skin.paintModes.join(", ")}`);
    }
    if (p.repeat !== undefined && !VOCAB.skin.paintRepeats.includes(p.repeat)) {
      fail(where, `"parts.${name}.repeat" must be one of ${VOCAB.skin.paintRepeats.join(", ")}`);
    }
    if (p.scale !== undefined && (!Number.isInteger(p.scale) || p.scale < 1 || p.scale > 8)) {
      fail(where, `"parts.${name}.scale" is picture pixels to screen pixels: a whole number from 1 to 8`);
    }
    const slice = p.slice === undefined ? [0, 0, 0, 0] : typeof p.slice === "number" ? [p.slice, p.slice, p.slice, p.slice] : p.slice;
    if (!Array.isArray(slice) || slice.length !== 4 || !slice.every((n) => Number.isInteger(n) && n >= 0)) {
      fail(where, `"parts.${name}.slice" is one whole number, or four (top, right, bottom, left), in the picture's own pixels`);
    } else if (size && (p.mode ?? "nine") === "nine") {
      if (slice[0] + slice[2] > size.height || slice[1] + slice[3] > size.width) {
        fail(where, `"parts.${name}.slice" adds up to more than ${p.image} is (${size.width}×${size.height}), leaving no middle`);
      }
    }
  }

  /**
   * The chrome colours a skin insists on. Only the theme's `ui` names, only
   * colours: the terminal is not a skin's to recolour, and a value that is not
   * a colour here lands on the root element of a window that is on the tailnet.
   */
  for (const [name, value] of Object.entries(colors)) {
    if (!VOCAB.skin.colors.includes(name)) fail(where, `"colors.${name}" is not a chrome colour kururu answers for`);
    else if (!COLOUR.test(String(value))) fail(where, `"colors.${name}" is ${JSON.stringify(value)}, which is not a colour`);
  }

  if (m.iconSheet !== undefined) {
    const sheet = m.iconSheet;
    if (!sheet || typeof sheet !== "object") fail(where, `"iconSheet" must be an object with an "image"`);
    else {
      const size = picture(where, "iconSheet.image", sheet.image, dir, files);
      const n = VOCAB.skin.icons.length;
      if (size && size.width !== size.height * n) {
        fail(where, `"iconSheet.image" must be ${n} square cells in a row — ${sheet.image} is ${size.width}×${size.height}, and ${n}×${size.height} would be ${n * size.height} wide`);
      }
      if (sheet.mode !== undefined && !VOCAB.skin.iconSheetModes.includes(sheet.mode)) {
        fail(where, `"iconSheet.mode" must be one of ${VOCAB.skin.iconSheetModes.join(", ")}`);
      }
    }
  }

  const fonts = m.fonts ?? [];
  if (!Array.isArray(fonts)) {
    fail(where, `"fonts" must be a list`);
    return;
  }
  for (const font of fonts) {
    if (typeof font?.family !== "string" || !font.family.trim()) fail(where, `every font needs a "family"`);
    if (typeof font?.file !== "string" || !files.includes(font.file)) {
      fail(where, `font file ${JSON.stringify(font?.file)} is not in this directory`);
    } else if (!/\.(woff2|woff|ttf|otf)$/i.test(font.file)) {
      fail(where, `${font.file} is not a font. Prefer woff2 — it is half the size of the same face as a ttf.`);
    }
  }
  if (fonts.length > 0 && !files.some((f) => /^(ofl|licen[cs]e)[^/]*$/i.test(f))) {
    fail(where, `ships a font with no licence beside it. Put the OFL.txt (or equivalent) in this directory.`);
  }
  if (m.stylesheet !== undefined) {
    if (typeof m.stylesheet !== "string" || !files.includes(m.stylesheet)) {
      fail(where, `"stylesheet" must name a .css file in this directory`);
    } else {
      const css = readFileSync(join(ROOT, dir, m.stylesheet), "utf8");
      if (REMOTE.test(css)) fail(where, `${m.stylesheet} reaches off this package — no @import, no remote url()`);
      if (!css.includes(`[data-skin="${m.id}"]`)) {
        fail(where, `${m.stylesheet} must scope its rules with [data-skin="${m.id}"] so two installed skins cannot fight`);
      }
    }
  }
}

/** A field that names a PNG in the entry: checked as a name, as a file, and as a PNG. Returns its size, or null. */
function picture(where, field, name, dir, files) {
  if (typeof name !== "string" || !files.includes(name)) {
    fail(where, `"${field}" must name a PNG in this directory, not ${JSON.stringify(name)}`);
    return null;
  }
  const size = pngSize(join(ROOT, dir, name));
  if (!size) fail(where, `"${field}": ${name} is not a PNG`);
  return size;
}

/**
 * A sound is one file, so almost everything here is about that file.
 *
 * **The format list is kururu's, not this repository's.** It comes out of
 * `schema/tokens.json` like every other vocabulary, and it is shorter than the
 * list of things a browser can play for a reason worth restating: kururu will
 * transcode the machine's own alert sounds on the way out, and it cannot do that
 * for a registry entry — a Linux box has no `afconvert`. An entry in a format
 * that needed one would be silence on half the machines that installed it, with
 * nothing anywhere saying so.
 *
 * **And it is short.** A notification sound is a thing you hear thirty times a
 * day and it plays from a phone in somebody's pocket, so this refuses a track
 * where it wants a blip. Two seconds is generous — kururu's own croak is under
 * one — and it is only checkable for WAV, which is the format this repository's
 * own sounds are in and the one `wavMs` can read without a decoder.
 */
function validateSound(where, m, dir, files) {
  if (typeof m.file !== "string" || !files.includes(m.file)) {
    fail(where, `"file" must name an audio file in this directory`);
    return;
  }
  const ext = m.file.slice(m.file.lastIndexOf(".")).toLowerCase();
  if (!VOCAB.sound.formats.includes(ext)) {
    fail(where, `${m.file} is ${ext}, and kururu plays ${VOCAB.sound.formats.join(", ")} — see the header of tools/validate.mjs`);
    return;
  }
  if (sizeOf(dir, m.file) > MAX_SOUND) {
    fail(where, `${m.file} is over ${Math.round(MAX_SOUND / 1024)}KB. A notification is a blip, and it is fetched by a phone.`);
  }
  const ms = ext === ".wav" ? wavMs(join(ROOT, dir, m.file)) : null;
  if (ms === null && ext === ".wav") fail(where, `${m.file} is not a WAV this can read`);
  else if (ms !== null && ms > MAX_SOUND_MS) {
    fail(where, `${m.file} is ${(ms / 1000).toFixed(1)}s. A notification sound is at most ${MAX_SOUND_MS / 1000}s — this is a sound you hear thirty times a day.`);
  }
}

function validateMascot(where, m, dir, files) {
  if (typeof m.sheet !== "string" || !files.includes(m.sheet)) {
    fail(where, `"sheet" must name a PNG in this directory`);
    return;
  }
  const size = pngSize(join(ROOT, dir, m.sheet));
  if (!size) {
    fail(where, `${m.sheet} is not a PNG`);
    return;
  }
  const frame = m.frame;
  if (!Number.isInteger(frame) || frame < 1) {
    fail(where, `"frame" is the cell size in pixels, and must be a whole number of them`);
    return;
  }
  const cols = Math.floor(size.width / frame);
  const rows = Math.floor(size.height / frame);
  if (cols < 1 || rows < 1) fail(where, `"frame" is ${frame}px but ${m.sheet} is only ${size.width}×${size.height}`);

  const trim = m.trim ?? {};
  for (const k of ["x", "y", "size"]) {
    if (!Number.isInteger(trim[k]) || trim[k] < 0) fail(where, `"trim.${k}" must be a whole number of pixels`);
  }
  if (Number.isInteger(trim.size) && (trim.size < 1 || trim.x + trim.size > frame || trim.y + trim.size > frame)) {
    fail(where, `"trim" does not fit inside a ${frame}px cell`);
  }

  for (const which of ["working", "idle"]) {
    const clip = m[which];
    if (clip === null && which === "idle") continue; // null idle is the dot, and is allowed.
    if (!clip || typeof clip !== "object") {
      fail(where, `"${which}" is required${which === "idle" ? " (or null, for a plain dot)" : ""}`);
      continue;
    }
    for (const k of ["row", "col", "count", "cycle"]) {
      if (!Number.isInteger(clip[k]) || clip[k] < 0) fail(where, `"${which}.${k}" must be a whole number`);
    }
    if (clip.count < 1) fail(where, `"${which}.count" must be at least one frame`);
    if (clip.cycle < 100 || clip.cycle > 60000) fail(where, `"${which}.cycle" is a loop in milliseconds, between 100 and 60000`);
    if (clip.row >= rows) fail(where, `"${which}.row" is ${clip.row} but the sheet has ${rows} rows`);
    if (clip.col + clip.count > cols) {
      fail(where, `"${which}" runs to column ${clip.col + clip.count} but the sheet has ${cols}`);
    }
  }
}

// ---------------------------------------------------------------------------

if (problems.length === 0) {
  console.log(`ok — ${found.size} entries`);
  for (const [key, { manifest }] of found) console.log(`  ${key} ${manifest.version}`);
} else {
  console.error(`${problems.length} problem${problems.length === 1 ? "" : "s"}:\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error("");
  process.exit(1);
}
