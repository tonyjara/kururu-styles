/**
 * The pictures for the two skins that show what a skin can be, drawn by code.
 *
 *     node tools/art.mjs
 *
 * `skins/ironclad` and `skins/handheld` are made of nine-slices and tiles, and
 * every one of them is generated here rather than drawn in an editor, for one
 * reason: a registry of other people's pictures needs at least one entry whose
 * pictures anybody can regenerate, read and change by editing a number. These
 * are that entry. They are also the reference for what each part *is* — the
 * slice of a bezel, the corner of a status bar, the left edge of a selected row
 * — in a form the studio's own guesses were checked against.
 *
 * Everything is drawn at 1x on a small canvas and shown by kururu at 3x or 4x,
 * which is what pixel art is: a 24px bezel is 72px on screen and every pixel in
 * it is a deliberate square. The PNG encoder is the one `tools/icon.mjs` in
 * kururu uses, copied rather than imported because this repository has no
 * dependencies and may not grow one.
 *
 * Deterministic: the grain is a seeded generator, so running this twice writes
 * the same bytes and the digests in `index.json` do not move.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// A tiny raster
// ---------------------------------------------------------------------------

function image(width, height) {
  return { width, height, data: Buffer.alloc(width * height * 4) };
}

/** `#rgb`, `#rrggbb` or `#rrggbbaa` → [r, g, b, a]. */
function rgba(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const n = Number.parseInt(h.padEnd(8, "f"), 16);
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

function put(img, x, y, colour) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const [r, g, b, a] = typeof colour === "string" ? rgba(colour) : colour;
  const at = (y * img.width + x) * 4;
  img.data[at] = r;
  img.data[at + 1] = g;
  img.data[at + 2] = b;
  img.data[at + 3] = a;
}

function rect(img, x, y, w, h, colour) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(img, x + i, y + j, colour);
}

/** A one-pixel outline just inside the box. */
function ring(img, x, y, w, h, colour) {
  rect(img, x, y, w, 1, colour);
  rect(img, x, y + h - 1, w, 1, colour);
  rect(img, x, y, 1, h, colour);
  rect(img, x + w - 1, y, 1, h, colour);
}

/** Light along the top and left, shadow along the bottom and right — the whole of how a pixel looks raised. */
function bevel(img, x, y, w, h, light, dark) {
  rect(img, x, y, w, 1, light);
  rect(img, x, y, 1, h, light);
  rect(img, x, y + h - 1, w, 1, dark);
  rect(img, x + w - 1, y, 1, h, dark);
}

/** A rivet: three tones in a 3×3, the light catching its top-left. */
function rivet(img, cx, cy, light, mid, dark) {
  rect(img, cx - 1, cy - 1, 3, 3, mid);
  put(img, cx - 1, cy - 1, light);
  put(img, cx, cy - 1, light);
  put(img, cx - 1, cy, light);
  put(img, cx + 1, cy + 1, dark);
  put(img, cx + 1, cy, dark);
  put(img, cx, cy + 1, dark);
}

/** Knock the corners off a box, so a nine-slice reads as rounded plastic rather than a rectangle. */
function round(img, r) {
  const corners = [
    [0, 0, 1, 1],
    [img.width - 1, 0, -1, 1],
    [0, img.height - 1, 1, -1],
    [img.width - 1, img.height - 1, -1, -1],
  ];
  for (const [ox, oy, dx, dy] of corners) {
    for (let j = 0; j < r; j++) {
      for (let i = 0; i < r; i++) {
        const cx = i + 0.5 - r;
        const cy = j + 0.5 - r;
        if (cx * cx + cy * cy > (r + 0.2) * (r + 0.2)) put(img, ox + i * dx, oy + j * dy, [0, 0, 0, 0]);
      }
    }
  }
}

/** Grain over the whole picture, seeded, so plastic and steel are not flat. */
function grain(img, amount, seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  for (let i = 0; i < img.width * img.height; i++) {
    const at = i * 4;
    if (img.data[at + 3] === 0) continue;
    const d = Math.round((next() - 0.5) * 2 * amount);
    for (let c = 0; c < 3; c++) img.data[at + c] = Math.max(0, Math.min(255, img.data[at + c] + d));
  }
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

function encodePng(img) {
  const stride = img.width * 4;
  const raw = Buffer.alloc((stride + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    raw[y * (stride + 1)] = 0;
    img.data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(img.width, 0);
  header.writeUInt32BE(img.height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function write(skin, name, img) {
  const dir = join(ROOT, "skins", skin);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), encodePng(img));
  console.log(`  ${skin}/${name} ${img.width}×${img.height}`);
}

// ---------------------------------------------------------------------------
// Ironclad — riveted steel, a HUD along the bottom, one red line
// ---------------------------------------------------------------------------

const IRON = {
  edge: "#0c0e10",
  dark: "#1c2024",
  deep: "#262b30",
  face: "#3a4047",
  light: "#5b636b",
  glint: "#7c858e",
  rivetL: "#a7b0b8",
  rivetM: "#6d757d",
  rivetD: "#14171a",
  red: "#b71c1c",
  redL: "#e53935",
  redD: "#5c0b0b",
};

/** The steel frame both the pane and every dialog wear. Six pixels a side; the middle is glass. */
function steelFrame(size, { lip, rivetTint }) {
  const img = image(size, size);
  const n = size;
  ring(img, 0, 0, n, n, IRON.edge);
  rect(img, 1, 1, n - 2, n - 2, IRON.face);
  bevel(img, 1, 1, n - 2, n - 2, IRON.light, IRON.dark);
  // The inner step: a second, smaller bevel the other way round, so the frame
  // reads as a plate with a hole punched in it rather than as a flat band.
  bevel(img, 4, 4, n - 8, n - 8, IRON.dark, IRON.light);
  ring(img, 5, 5, n - 10, n - 10, lip);
  rect(img, 6, 6, n - 12, n - 12, [0, 0, 0, 0]);
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4], [n - 4, n - 4]]) {
    rivet(img, cx, cy, IRON.rivetL, rivetTint ?? IRON.rivetM, IRON.rivetD);
  }
  return img;
}

function ironclad() {
  console.log("ironclad");

  const sidebar = image(16, 16);
  rect(sidebar, 0, 0, 16, 16, IRON.deep);
  rect(sidebar, 0, 0, 16, 1, "#2b3035");
  rect(sidebar, 0, 15, 16, 1, "#20242a");
  grain(sidebar, 5, 11);
  write("ironclad", "sidebar.png", sidebar);

  const well = image(16, 16);
  rect(well, 0, 0, 16, 16, "#1a1e22");
  rect(well, 0, 15, 16, 1, "#121518");
  grain(well, 4, 23);
  write("ironclad", "well.png", well);

  write("ironclad", "pane.png", steelFrame(24, { lip: IRON.edge }));
  write("ironclad", "pane-on.png", steelFrame(24, { lip: IRON.red, rivetTint: "#7d5a5a" }));
  write("ironclad", "dialog.png", steelFrame(24, { lip: IRON.dark }));

  // The strip a pane's tabs sit in: a recess, dark, lit along its lower edge.
  const strip = image(12, 12);
  rect(strip, 0, 0, 12, 12, "#23272b");
  rect(strip, 0, 0, 12, 1, IRON.rivetD);
  rect(strip, 0, 11, 12, 1, "#4a525a");
  write("ironclad", "tabstrip.png", strip);

  // A tab at rest is a slot; the selected one is a plate raised out of it.
  const tab = image(10, 10);
  rect(tab, 0, 0, 10, 10, IRON.dark);
  bevel(tab, 0, 0, 10, 10, IRON.edge, "#4a525a");
  write("ironclad", "tab.png", tab);

  const tabOn = image(10, 10);
  ring(tabOn, 0, 0, 10, 10, IRON.edge);
  rect(tabOn, 1, 1, 8, 8, IRON.face);
  bevel(tabOn, 1, 1, 8, 8, IRON.light, IRON.rivetD);
  write("ironclad", "tab-on.png", tabOn);

  const button = image(12, 12);
  ring(button, 0, 0, 12, 12, IRON.edge);
  rect(button, 1, 1, 10, 10, IRON.red);
  bevel(button, 1, 1, 10, 10, IRON.redL, IRON.redD);
  write("ironclad", "button.png", button);

  // The selected row: a raised plate whose left three pixels are the red bar.
  // In a nine-slice the left slice is the whole left edge, so this is how a
  // stripe down one side of a row is drawn with one picture.
  const row = image(12, 12);
  ring(row, 0, 0, 12, 12, IRON.edge);
  rect(row, 1, 1, 10, 10, IRON.face);
  bevel(row, 1, 1, 10, 10, IRON.light, IRON.dark);
  rect(row, 1, 1, 2, 10, IRON.red);
  put(row, 1, 1, IRON.redL);
  write("ironclad", "row-on.png", row);

  // The HUD. Rivets live in the 8px end slices so they land at the bar's ends;
  // the middle repeats a plain riveted-steel stripe across the width.
  const bar = image(32, 16);
  rect(bar, 0, 0, 32, 16, IRON.face);
  grain(bar, 4, 5);
  rect(bar, 0, 0, 32, 1, IRON.edge);
  rect(bar, 0, 1, 32, 1, IRON.light);
  rect(bar, 0, 14, 32, 1, IRON.dark);
  rect(bar, 0, 15, 32, 1, IRON.edge);
  for (const [cx, cy] of [[4, 5], [4, 10], [27, 5], [27, 10]]) rivet(bar, cx, cy, IRON.rivetL, IRON.rivetM, IRON.rivetD);
  write("ironclad", "statusbar.png", bar);
}

// ---------------------------------------------------------------------------
// Handheld — grey plastic, a dark screen bezel, one red LED, magenta buttons
// ---------------------------------------------------------------------------

const SHELL = {
  face: "#c9c5bd",
  faceDark: "#bfbbb3",
  light: "#e9e6e0",
  dark: "#a19c94",
  edge: "#7f7a72",
  groove: "#8f8a82",
  bezel: "#47454d",
  bezelL: "#5e5b66",
  bezelD: "#2c2b31",
  lip: "#1f1e24",
  ledOn: "#e0353a",
  ledGlow: "#ff8a8c",
  ledOff: "#5a1c1f",
  magenta: "#a53c6c",
  magentaL: "#c95a8b",
  magentaD: "#6d2547",
  magentaEdge: "#4a1a31",
  green: "#8bac0f",
  greenL: "#9bbc0f",
  greenD: "#306230",
};

/** The screen surround: dark plastic, ten pixels deep, with the power light in its top-left. */
function screenBezel(lit) {
  const n = 32;
  const img = image(n, n);
  rect(img, 0, 0, n, n, SHELL.bezel);
  ring(img, 0, 0, n, n, SHELL.edge);
  bevel(img, 1, 1, n - 2, n - 2, SHELL.bezelL, SHELL.bezelD);
  bevel(img, 8, 8, n - 16, n - 16, SHELL.bezelD, SHELL.bezelL);
  ring(img, 9, 9, n - 18, n - 18, SHELL.lip);
  rect(img, 10, 10, n - 20, n - 20, [0, 0, 0, 0]);
  round(img, 4);
  // The LED. Off, it is a dark dot in the plastic; on, it is lit and bleeds
  // one pixel into the bezel around it.
  if (lit) {
    rect(img, 3, 4, 4, 4, SHELL.ledGlow);
    rect(img, 4, 5, 2, 2, SHELL.ledOn);
    put(img, 4, 5, "#ffd2d3");
  } else {
    rect(img, 4, 5, 2, 2, SHELL.ledOff);
    put(img, 4, 5, "#7a2a2e");
  }
  return img;
}

function handheld() {
  console.log("handheld");

  const well = image(16, 16);
  rect(well, 0, 0, 16, 16, SHELL.face);
  grain(well, 3, 7);
  write("handheld", "well.png", well);

  const sidebar = image(16, 16);
  rect(sidebar, 0, 0, 16, 16, SHELL.faceDark);
  grain(sidebar, 3, 9);
  write("handheld", "sidebar.png", sidebar);

  write("handheld", "pane.png", screenBezel(false));
  write("handheld", "pane-on.png", screenBezel(true));

  // Inside the bezel, above the glass: a band of the same plastic, slightly
  // recessed, that the tabs sit in.
  const strip = image(8, 8);
  rect(strip, 0, 0, 8, 8, SHELL.bezel);
  rect(strip, 0, 0, 8, 1, SHELL.bezelD);
  rect(strip, 0, 7, 8, 1, SHELL.bezelL);
  write("handheld", "tabstrip.png", strip);

  const tab = image(12, 12);
  rect(tab, 0, 0, 12, 12, SHELL.bezelD);
  bevel(tab, 0, 0, 12, 12, SHELL.lip, SHELL.bezelL);
  round(tab, 3);
  write("handheld", "tab.png", tab);

  const tabOn = image(12, 12);
  rect(tabOn, 0, 0, 12, 12, SHELL.green);
  bevel(tabOn, 0, 0, 12, 12, SHELL.greenL, SHELL.greenD);
  round(tabOn, 3);
  write("handheld", "tab-on.png", tabOn);

  const button = image(16, 16);
  rect(button, 0, 0, 16, 16, SHELL.magenta);
  ring(button, 0, 0, 16, 16, SHELL.magentaEdge);
  bevel(button, 1, 1, 14, 14, SHELL.magentaL, SHELL.magentaD);
  round(button, 4);
  write("handheld", "button.png", button);

  // A groove pressed into the shell, for the row you are on.
  const row = image(12, 12);
  rect(row, 0, 0, 12, 12, "#b7b3ab");
  bevel(row, 0, 0, 12, 12, SHELL.dark, SHELL.light);
  round(row, 2);
  write("handheld", "row-on.png", row);

  // The bottom of the shell: a highlight along the top edge, a groove along the
  // bottom, and the speaker grille in the right-hand slice — six slanted slots,
  // which is what the right end of the bar is for.
  const bar = image(40, 16);
  rect(bar, 0, 0, 40, 16, SHELL.face);
  grain(bar, 3, 3);
  rect(bar, 0, 0, 40, 1, SHELL.light);
  rect(bar, 0, 14, 40, 1, SHELL.dark);
  rect(bar, 0, 15, 40, 1, SHELL.edge);
  for (let k = 0; k < 4; k++) {
    for (let t = 0; t < 7; t++) {
      put(bar, 26 + k * 3 + t, 11 - t, SHELL.groove);
      put(bar, 26 + k * 3 + t + 1, 11 - t, SHELL.light);
    }
  }
  write("handheld", "statusbar.png", bar);

  const dialog = image(24, 24);
  rect(dialog, 0, 0, 24, 24, SHELL.face);
  ring(dialog, 0, 0, 24, 24, SHELL.edge);
  bevel(dialog, 1, 1, 22, 22, SHELL.light, SHELL.dark);
  ring(dialog, 5, 5, 14, 14, SHELL.dark);
  rect(dialog, 6, 6, 12, 12, [0, 0, 0, 0]);
  round(dialog, 3);
  write("handheld", "dialog.png", dialog);
}

ironclad();
handheld();
