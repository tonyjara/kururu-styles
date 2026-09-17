/**
 * The things `build-index.mjs` and `validate.mjs` both have to agree about.
 *
 * They are two halves of one statement — the index says what the entries are,
 * the validator says whether they are allowed to be it — so anything either one
 * knows about the *shape* of an entry has to be known once. Two spellings of
 * "which files belong to an entry" would be two different digests, and a digest
 * that disagrees with itself is a repository where every merge looks like a
 * change.
 *
 * Plain Node, no dependencies, on purpose. This repository is data, and a
 * contributor should be able to check their own pull request with `node
 * tools/validate.mjs` on a machine that has never installed anything. A
 * validator behind an `npm install` is a validator that only CI ever runs, which
 * is exactly when the feedback is least useful.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The five kinds, and where each one lives.
 *
 * A directory per kind rather than one flat namespace, because an id only has to
 * be unique within its kind: there is a `fox` mascot and there could be a `fox`
 * theme, and making those collide would be a rule that exists only because of
 * how the files happen to be laid out.
 *
 * `pack` is last because a pack names the others and is checked once they are
 * all known — see the second loop in `validate.mjs`.
 */
export const KINDS = [
  { kind: "theme", dir: "themes", manifest: "theme.json" },
  { kind: "skin", dir: "skins", manifest: "skin.json" },
  { kind: "mascot", dir: "mascots", manifest: "mascot.json" },
  { kind: "sound", dir: "sounds", manifest: "sound.json" },
  { kind: "pack", dir: "packs", manifest: "pack.json" },
];

/**
 * The parts a pack may name, and whether it has to.
 *
 * `sound` is optional and the other three are not, which is the one place this
 * format has a shrug in it. The reason is that a pack was three ids before it
 * was four: every pack already published names a theme, a skin and a mascot,
 * and making the fourth mandatory would break each of them on the day it was
 * added — for a field whose honest answer, for a pack about a colour scheme, is
 * that it has no opinion about what a notification sounds like.
 */
export const PACK_PARTS = [
  { kind: "theme", required: true },
  { kind: "skin", required: true },
  { kind: "mascot", required: true },
  { kind: "sound", required: false },
];

/** What kururu answers for at this schema. See the README on why it is a file. */
export const VOCAB = JSON.parse(readFileSync(join(ROOT, "schema/tokens.json"), "utf8"));

export const SCHEMA = 1;

/** An id is a name: it becomes a directory, a URL segment and a key on disk. */
export const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** `major.minor.patch` and nothing else — no pre-release tags, no build metadata. */
export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/**
 * Every entry in the repository, in a stable order.
 *
 * Sorted by kind and then by id, because the index is committed and a listing
 * that came back in directory order would reshuffle itself on a different
 * filesystem and turn every pull request into a diff of the whole file.
 */
export function entries() {
  const out = [];
  for (const { kind, dir, manifest } of KINDS) {
    let names;
    try {
      names = readdirSync(join(ROOT, dir), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
    } catch {
      continue; // A kind with no directory yet is a kind with nothing in it.
    }
    for (const id of names) {
      const path = join(dir, id);
      out.push({ kind, id, dir: path, manifestName: manifest, manifestPath: join(path, manifest) });
    }
  }
  return out;
}

/**
 * The files that make up one entry, relative to its directory.
 *
 * Everything in there, recursively, minus the things a filesystem puts there on
 * its own. Deliberately not a list the manifest declares: a manifest that names
 * its own files is a manifest that can forget one, and the forgotten file is
 * then in the repository, visible in the pull request, and absent from every
 * install — which looks like kururu failing to download it.
 */
export function filesOf(dir) {
  const skip = new Set([".DS_Store", "Thumbs.db", ".gitkeep"]);
  const out = [];
  const walk = (rel) => {
    for (const d of readdirSync(join(ROOT, dir, rel), { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      if (skip.has(d.name)) continue;
      const next = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) walk(next);
      else out.push(next);
    }
  };
  walk("");
  return out;
}

export function sha256(bytes) {
  return `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
}

/**
 * One digest over a whole entry.
 *
 * Over the *names and the hashes*, not over the concatenated bytes, so that
 * renaming a file changes the digest and two files swapping contents does too.
 * A digest that only saw the bytes in order would call those the same entry.
 */
export function digestOf(dir, files) {
  const h = createHash("sha256");
  for (const name of files) {
    h.update(name);
    h.update("\0");
    h.update(createHash("sha256").update(readFileSync(join(ROOT, dir, name))).digest());
    h.update("\0");
  }
  return `sha256-${h.digest("hex")}`;
}

/** `1.2.0` against `1.10.0`, numerically. Returns <0, 0 or >0. */
export function compareVersions(a, b) {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/**
 * A PNG's dimensions, straight out of the IHDR.
 *
 * Twenty-four bytes rather than an image library, because the only question
 * asked of a sprite sheet here is whether the rows and columns a mascot claims
 * are actually in the picture — and that is arithmetic on two integers.
 */
export function pngSize(path) {
  const fd = readFileSync(path);
  const magic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (fd.length < 24 || !fd.subarray(0, 8).equals(magic)) return null;
  return { width: fd.readUInt32BE(16), height: fd.readUInt32BE(20) };
}

/**
 * How long a WAV is, in milliseconds, out of its header. Null for anything else.
 *
 * The same trade `pngSize` makes and for the same reason: the one question worth
 * asking of a notification sound is whether it is a *blip* or somebody's
 * favourite song, and that is a division of two integers out of the `fmt ` and
 * `data` chunks. Only WAV, because that is the only one of the three formats
 * whose length is arithmetic rather than a decoder — an MP3 is frames and an M4A
 * is an atom tree, and a validator that needed either would be a validator with
 * a dependency.
 */
export function wavMs(path) {
  const b = readFileSync(path);
  if (b.length < 44 || b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") return null;
  let at = 12;
  let rate = 0;
  let channels = 0;
  let bits = 0;
  while (at + 8 <= b.length) {
    const id = b.toString("ascii", at, at + 4);
    const size = b.readUInt32LE(at + 4);
    if (id === "fmt " && at + 24 <= b.length) {
      channels = b.readUInt16LE(at + 10);
      rate = b.readUInt32LE(at + 12);
      bits = b.readUInt16LE(at + 22);
    }
    if (id === "data") {
      const bytesPerFrame = (channels * bits) / 8;
      if (!rate || !bytesPerFrame) return null;
      return Math.round((size / bytesPerFrame / rate) * 1000);
    }
    // Chunks are word-aligned: an odd size is followed by a pad byte, and a
    // walk that ignored it lands one byte into the next chunk's id and reads
    // the rest of the file as garbage.
    at += 8 + size + (size % 2);
  }
  return null;
}

export function sizeOf(dir, name) {
  return statSync(join(ROOT, dir, name)).size;
}

export function readJson(path) {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
}
