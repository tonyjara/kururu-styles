/**
 * The pictures for the skins that show what a skin can be, drawn by code.
 *
 *     node tools/art.mjs
 *
 * `skins/ironclad`, `skins/handheld`, `skins/cobble`, `skins/quest`,
 * `skins/world-1-1`, `skins/grand-prix` and `skins/paddock` are made of nine-slices and tiles, and every one of them is
 * generated here rather than drawn in an editor, for one reason: a registry of
 * other people's pictures needs entries whose pictures anybody can regenerate,
 * read and change by editing a number. These are those entries. They are also
 * the reference for what each part *is* — the slice of a bezel, the corner of a
 * status bar, the left edge of a selected row — in a form the studio's own
 * guesses were checked against.
 *
 * Everything is drawn at 1x on a small canvas and shown by kururu at 2x or 3x,
 * which is what pixel art is: a 24px bezel is 72px on screen and every pixel in
 * it is a deliberate square. The PNG encoder is the one `tools/icon.mjs` in
 * kururu uses, copied rather than imported because this repository has no
 * dependencies and may not grow one.
 *
 * The last three are homages. Each is drawn from memory of a kind of game rather
 * than from any game's files — an inventory bevel, a dungeon wall, a brick in a
 * blue sky are shapes, not sprites — and each is named for what it shows rather
 * than for anything somebody owns, because this repository is public and a
 * registry is not the place to find out where the line is.
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

  // The boxes the rows sit in: a plate recessed into the steel, bevelled the
  // other way round from the raised row, so the selected row stands out of it.
  const panel = image(12, 12);
  ring(panel, 0, 0, 12, 12, IRON.edge);
  rect(panel, 1, 1, 10, 10, IRON.dark);
  bevel(panel, 1, 1, 10, 10, IRON.rivetD, IRON.light);
  write("ironclad", "panel.png", panel);

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

  // The boxes the rows sit in: a lighter inset in the shell, so the groove of
  // the selected row still reads as a groove.
  const panel = image(12, 12);
  rect(panel, 0, 0, 12, 12, "#cdc9c1");
  bevel(panel, 0, 0, 12, 12, SHELL.dark, SHELL.light);
  round(panel, 2);
  write("handheld", "panel.png", panel);

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

// ---------------------------------------------------------------------------
// Sprites and patterns, for the three homages
// ---------------------------------------------------------------------------

/** Rows of characters, one pixel each; `.` leaves the pixel alone. */
function sprite(img, x, y, rows, key) {
  rows.forEach((row, j) => {
    [...row].forEach((ch, i) => {
      if (ch === ".") return;
      const colour = key[ch];
      if (colour) put(img, x + i, y + j, colour);
    });
  });
}

/** The shape once in `edge` a pixel out in each direction, then once in `fill`: an outlined sprite. */
function outlined(img, x, y, rows, fill, edge) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) sprite(img, x + dx, y + dy, rows, { X: edge });
  sprite(img, x, y, rows, { X: fill });
}

/**
 * Courses of bricks. Each brick is `brick.w`×`brick.h` *including* one pixel of
 * mortar along its right and bottom, lit along its top and left; alternate
 * courses are shifted by half a brick unless `offset` is off, which makes them
 * blocks. Drawn with a period that divides the slice, so a nine-slice edge
 * repeats without a seam.
 */
function bricks(img, x, y, w, h, brick, { face, light, mortar, offset = true }) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const course = Math.floor(j / brick.h);
      const shift = offset && course % 2 ? Math.floor(brick.w / 2) : 0;
      const bx = (i + shift) % brick.w;
      const by = j % brick.h;
      let colour = face;
      if (bx === brick.w - 1 || by === brick.h - 1) colour = mortar;
      else if (bx === 0 || by === 0) colour = light;
      put(img, x + i, y + j, colour);
    }
  }
}

/** Scatter single pixels of the given colours, seeded, for sand and stone. */
function speckle(img, colours, chance, seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (next() < chance) put(img, x, y, colours[Math.floor(next() * colours.length)]);
    }
  }
}

/** Paste one picture onto another, skipping its transparent pixels. */
function blit(dst, src, x, y) {
  for (let j = 0; j < src.height; j++) {
    for (let i = 0; i < src.width; i++) {
      const at = (j * src.width + i) * 4;
      if (src.data[at + 3] === 0) continue;
      put(dst, x + i, y + j, [src.data[at], src.data[at + 1], src.data[at + 2], src.data[at + 3]]);
    }
  }
}

/** A filled box with its corners knocked off — `round` on something solid. */
function pill(w, h, r, colour) {
  const img = image(w, h);
  rect(img, 0, 0, w, h, colour);
  round(img, r);
  return img;
}

const HEART = [".X.X.", "XXXXX", "XXXXX", ".XXX.", "..X.."];
const CLOUD = ["....XXXX....", "..XXXXXXXX..", ".XXXXXXXXXX.", "XXXXXXXXXXXX", "XXXXXXXXXXXX", ".XXXXXXXXXX."];
const PUFF = ["..XXXX..", ".XXXXXX.", "XXXXXXXX", ".XXXXXX."];

// ---------------------------------------------------------------------------
// Cobble — an inventory screen: grey plates, slots, stone buttons, sand, cobblestone
// ---------------------------------------------------------------------------

const GUI = {
  edge: "#000000",
  face: "#c6c6c6",
  light: "#ffffff",
  dark: "#555555",
  strip: "#9d9d9d",
  slot: "#8b8b8b",
  slotDark: "#373737",
  stone: "#6f6f6f",
  stoneL: "#a0a0a0",
  stoneD: "#3a3a3a",
  sand: "#dbd3a4",
  sandL: "#e6dfb7",
  sandD: "#cfc79a",
  sandOn: "#cdc49a",
  xp: "#7fe61f",
  xpDark: "#2d6a00",
  mortar: "#3a3a3a",
  stones: [["#8a8a8a", "#9a9a9a"], ["#7a7a7a", "#8a8a8a"], ["#6f6f6f", "#7f7f7f"], ["#8f8f8f", "#9f9f9f"], ["#737373", "#838383"], ["#828282", "#929292"]],
};

/** The plate: black, then white on the lit sides and grey on the shaded ones, then the face. */
function plate(img, x, y, w, h) {
  ring(img, x, y, w, h, GUI.edge);
  rect(img, x + 1, y + 1, w - 2, h - 2, GUI.face);
  bevel(img, x + 1, y + 1, w - 2, h - 2, GUI.light, GUI.dark);
}

/** A slot is the plate's bevel the other way round: dark where the plate is lit. */
function slot(img, x, y, w, h, face = GUI.slot) {
  rect(img, x, y, w, h, face);
  bevel(img, x, y, w, h, GUI.slotDark, GUI.light);
}

/** The frame a terminal sits in: a plate with a slot punched through it. Lit, the slot's lip is white all round. */
function inventoryFrame(lit) {
  const n = 16;
  const img = image(n, n);
  plate(img, 0, 0, n, n);
  if (lit) {
    ring(img, 3, 3, n - 6, n - 6, GUI.light);
    ring(img, 4, 4, n - 8, n - 8, GUI.light);
  } else {
    bevel(img, 4, 4, n - 8, n - 8, GUI.slotDark, GUI.light);
  }
  rect(img, 5, 5, n - 10, n - 10, [0, 0, 0, 0]);
  return img;
}

function cobble() {
  console.log("cobble");

  const sand = image(16, 16);
  rect(sand, 0, 0, 16, 16, GUI.sand);
  speckle(sand, [GUI.sandL, GUI.sandD], 0.22, 31);
  write("cobble", "sidebar.png", sand);

  // Cobblestone: stones in six greys on dark mortar, each lit along its top,
  // laid on a torus — a stone that runs off the right edge comes back on the
  // left — so the tile has no straight seam. A tile whose every stone stopped
  // at its border would have a line across the well every 48px, and that is
  // exactly the grid this is trying not to be.
  const well = image(16, 16);
  rect(well, 0, 0, 16, 16, GUI.mortar);
  const stones = [[0, 0, 6, 5], [12, -2, 3, 5], [6, 2, 6, 4], [12, 3, 4, 5], [0, 5, 4, 6], [4, 6, 8, 5], [12, 8, 3, 6], [-1, 11, 7, 4], [6, 12, 6, 6]];
  stones.forEach(([sx, sy, sw, sh], k) => {
    const [face, lit] = GUI.stones[k % GUI.stones.length];
    for (let j = 0; j < sh - 1; j++) {
      for (let i = 0; i < sw - 1; i++) {
        put(well, (sx + i + 16) % 16, (sy + j + 16) % 16, j === 0 && i < sw - 2 ? lit : face);
      }
    }
  });
  grain(well, 4, 17);
  write("cobble", "well.png", well);

  write("cobble", "pane.png", inventoryFrame(false));
  write("cobble", "pane-on.png", inventoryFrame(true));

  const dialog = image(12, 12);
  plate(dialog, 0, 0, 12, 12);
  write("cobble", "dialog.png", dialog);

  // Tabs sit in a slot row; a tab at rest is a slot, the selected one a plate.
  const strip = image(8, 8);
  slot(strip, 0, 0, 8, 8, GUI.strip);
  write("cobble", "tabstrip.png", strip);

  const tab = image(8, 8);
  slot(tab, 0, 0, 8, 8);
  write("cobble", "tab.png", tab);

  const tabOn = image(8, 8);
  plate(tabOn, 0, 0, 8, 8);
  write("cobble", "tab-on.png", tabOn);

  const button = image(12, 12);
  ring(button, 0, 0, 12, 12, GUI.edge);
  rect(button, 1, 1, 10, 10, GUI.stone);
  grain(button, 6, 41);
  bevel(button, 1, 1, 10, 10, GUI.stoneL, GUI.stoneD);
  write("cobble", "button.png", button);

  // The row you are on wears the hotbar's selector: two pixels of white with a
  // dark edge inside, over sand a shade darker than the rest.
  const row = image(12, 12);
  rect(row, 0, 0, 12, 12, GUI.sandOn);
  ring(row, 0, 0, 12, 12, GUI.light);
  ring(row, 1, 1, 10, 10, GUI.light);
  ring(row, 2, 2, 8, 8, GUI.dark);
  write("cobble", "row-on.png", row);

  // The boxes the rows sit in are plates on the sand, like any inventory.
  const panel = image(12, 12);
  plate(panel, 0, 0, 12, 12);
  write("cobble", "panel.png", panel);

  // The status bar is a plate with the experience bar along its top edge: green
  // between two black lines, notched every eight pixels.
  const bar = image(32, 12);
  rect(bar, 0, 0, 32, 12, GUI.face);
  rect(bar, 0, 0, 32, 1, GUI.edge);
  rect(bar, 0, 1, 32, 1, GUI.xp);
  for (let x = 7; x < 32; x += 8) put(bar, x, 1, GUI.xpDark);
  rect(bar, 0, 2, 32, 1, GUI.edge);
  rect(bar, 0, 3, 32, 1, GUI.light);
  rect(bar, 0, 11, 32, 1, GUI.dark);
  write("cobble", "statusbar.png", bar);
}

// ---------------------------------------------------------------------------
// Quest — an 8-bit dungeon: blue stone walls, a black HUD with hearts, gold on what is picked
// ---------------------------------------------------------------------------

const NES = {
  black: "#000000",
  white: "#fcfcfc",
  grey: "#7c7c7c",
  greyL: "#bcbcbc",
  greyD: "#3c3c3c",
  blueD: "#0000bc",
  blue: "#0078f8",
  blueL: "#3cbcfc",
  gold: "#f8b800",
  goldL: "#f8d878",
  goldD: "#ac7c00",
  red: "#f83800",
  floor: "#0c1428",
  floorLine: "#08101c",
  floorOn: "#121e34",
  wellLine: "#0e0e0e",
};

/** One course of stone blocks all the way round; lit, the room is the brighter blue. */
function dungeonWall(lit) {
  const img = image(24, 24);
  bricks(img, 0, 0, 24, 24, { w: 8, h: 8 }, {
    face: lit ? NES.blue : NES.blueD,
    light: lit ? NES.blueL : NES.blue,
    mortar: NES.black,
    offset: false,
  });
  rect(img, 8, 8, 8, 8, [0, 0, 0, 0]);
  return img;
}

function quest() {
  console.log("quest");

  const floor = image(16, 16);
  rect(floor, 0, 0, 16, 16, NES.floor);
  rect(floor, 0, 0, 16, 1, NES.floorLine);
  rect(floor, 0, 0, 1, 16, NES.floorLine);
  write("quest", "sidebar.png", floor);

  const well = image(16, 16);
  rect(well, 0, 0, 16, 16, NES.black);
  rect(well, 0, 0, 16, 1, NES.wellLine);
  rect(well, 0, 0, 1, 16, NES.wellLine);
  write("quest", "well.png", well);

  write("quest", "pane.png", dungeonWall(false));
  write("quest", "pane-on.png", dungeonWall(true));

  const strip = image(8, 8);
  rect(strip, 0, 0, 8, 8, NES.black);
  rect(strip, 0, 7, 8, 1, NES.greyD);
  write("quest", "tabstrip.png", strip);

  // Item boxes: black, outlined in blue; the one in hand is outlined in gold.
  const tab = image(10, 10);
  rect(tab, 0, 0, 10, 10, NES.black);
  ring(tab, 0, 0, 10, 10, NES.blue);
  write("quest", "tab.png", tab);

  const tabOn = image(10, 10);
  rect(tabOn, 0, 0, 10, 10, NES.black);
  ring(tabOn, 0, 0, 10, 10, NES.gold);
  write("quest", "tab-on.png", tabOn);

  const button = image(12, 12);
  ring(button, 0, 0, 12, 12, NES.black);
  rect(button, 1, 1, 10, 10, NES.gold);
  bevel(button, 1, 1, 10, 10, NES.goldL, NES.goldD);
  write("quest", "button.png", button);

  const row = image(12, 12);
  rect(row, 0, 0, 12, 12, NES.floorOn);
  ring(row, 0, 0, 12, 12, NES.gold);
  ring(row, 1, 1, 10, 10, NES.goldD);
  write("quest", "row-on.png", row);

  // The boxes the rows sit in are HUD boxes: black, outlined in blue.
  const panel = image(12, 12);
  rect(panel, 0, 0, 12, 12, NES.black);
  ring(panel, 0, 0, 12, 12, NES.blue);
  write("quest", "panel.png", panel);

  // The HUD. Its top slice is seven pixels so the corners can hold the map on
  // the left and the hearts on the right — corners never stretch, which is what
  // makes a heart safe there and not in a slice that has to fill the width.
  // The third heart is half gone, because it always is.
  const bar = image(48, 16);
  rect(bar, 0, 0, 48, 16, NES.black);
  rect(bar, 0, 0, 48, 1, NES.greyD);
  rect(bar, 2, 1, 12, 5, NES.grey);
  for (const x of [5, 8, 11]) rect(bar, x, 1, 1, 5, NES.black);
  put(bar, 6, 3, NES.greyL);
  sprite(bar, 27, 1, HEART, { X: NES.red });
  sprite(bar, 33, 1, HEART, { X: NES.red });
  sprite(bar, 39, 1, HEART, { X: NES.greyD });
  sprite(bar, 39, 1, HEART.map((r) => r.slice(0, 3)), { X: NES.red });
  rect(bar, 0, 15, 48, 1, NES.greyD);
  write("quest", "statusbar.png", bar);

  const dialog = image(24, 24);
  rect(dialog, 0, 0, 24, 24, "#0a1020");
  ring(dialog, 0, 0, 24, 24, NES.gold);
  ring(dialog, 1, 1, 22, 22, NES.goldD);
  ring(dialog, 2, 2, 20, 20, NES.black);
  write("quest", "dialog.png", dialog);
}

// ---------------------------------------------------------------------------
// World 1-1 — bricks in a blue sky, a gold block for the pane you are in, a pipe, a cloud, the ground
// ---------------------------------------------------------------------------

const SKY = {
  sky: "#5c94fc",
  cloud: "#fcfcfc",
  cloudShade: "#a4e4fc",
  black: "#000000",
  brick: "#c84c0c",
  brickL: "#fc9838",
  ground: "#fc9838",
  groundD: "#c84c0c",
  groundL: "#fce0a8",
  gold: "#f8b800",
  goldL: "#fce0a8",
  goldD: "#ac7c00",
  pipe: "#80d010",
  pipeL: "#b8f818",
  pipeD: "#005800",
  red: "#d82800",
  redL: "#fc7460",
  redD: "#a81000",
};

/** The gold block with a dot in each corner; `hole` leaves the middle open for a terminal. */
function goldBlock(n, dot, hole) {
  const img = image(n, n);
  ring(img, 0, 0, n, n, SKY.black);
  rect(img, 1, 1, n - 2, n - 2, SKY.gold);
  bevel(img, 1, 1, n - 2, n - 2, SKY.goldL, SKY.goldD);
  const d = dot.size;
  for (const [x, y] of [[dot.at, dot.at], [n - dot.at - d, dot.at], [dot.at, n - dot.at - d], [n - dot.at - d, n - dot.at - d]]) {
    rect(img, x, y, d, d, SKY.goldD);
  }
  if (hole) {
    ring(img, hole - 1, hole - 1, n - 2 * hole + 2, n - 2 * hole + 2, SKY.black);
    rect(img, hole, hole, n - 2 * hole, n - 2 * hole, [0, 0, 0, 0]);
  }
  return img;
}

function world11() {
  console.log("world-1-1");

  // Sky with a cloud and a puff. The tile is 64 wide and 128 tall — 192 by 384
  // on screen — and both sit in its lower half, so that in a sidebar of the
  // usual height they float in the empty stretch between the agents and the
  // dev servers rather than behind a heading. The first cut had a cloud every
  // 96px and the sidebar read as wallpaper.
  const sky = image(64, 128);
  rect(sky, 0, 0, 64, 128, SKY.sky);
  outlined(sky, 36, 70, CLOUD, SKY.cloud, SKY.black);
  sprite(sky, 37, 75, [".XXXXXXXXXX."], { X: SKY.cloudShade });
  outlined(sky, 8, 104, PUFF, SKY.cloud, SKY.black);
  sprite(sky, 9, 107, [".XXXXXX."], { X: SKY.cloudShade });
  write("world-1-1", "sidebar.png", sky);

  const well = image(8, 8);
  rect(well, 0, 0, 8, 8, SKY.sky);
  write("world-1-1", "well.png", well);

  // A pane is a brick block: two courses deep on every side, the middle open.
  const brick = image(24, 24);
  bricks(brick, 0, 0, 24, 24, { w: 8, h: 4 }, { face: SKY.brick, light: SKY.brickL, mortar: SKY.black });
  rect(brick, 8, 8, 8, 8, [0, 0, 0, 0]);
  write("world-1-1", "pane.png", brick);

  write("world-1-1", "pane-on.png", goldBlock(24, { at: 3, size: 2 }, 8));

  // The tab strip is a length of pipe, seen from the side.
  const strip = image(8, 10);
  rect(strip, 0, 0, 8, 10, SKY.pipe);
  rect(strip, 0, 0, 8, 1, SKY.black);
  rect(strip, 0, 1, 8, 1, SKY.pipeL);
  rect(strip, 0, 8, 8, 1, SKY.pipeD);
  rect(strip, 0, 9, 8, 1, SKY.black);
  write("world-1-1", "tabstrip.png", strip);

  // A tab at rest is an outline on the pipe; the selected one is a coin's gold.
  const tab = image(10, 10);
  ring(tab, 0, 0, 10, 10, SKY.black);
  write("world-1-1", "tab.png", tab);

  const tabOn = image(10, 10);
  ring(tabOn, 0, 0, 10, 10, SKY.black);
  rect(tabOn, 1, 1, 8, 8, SKY.gold);
  bevel(tabOn, 1, 1, 8, 8, SKY.goldL, SKY.goldD);
  write("world-1-1", "tab-on.png", tabOn);

  const button = image(12, 12);
  ring(button, 0, 0, 12, 12, SKY.black);
  rect(button, 1, 1, 10, 10, SKY.red);
  bevel(button, 1, 1, 10, 10, SKY.redL, SKY.redD);
  round(button, 1);
  write("world-1-1", "button.png", button);

  write("world-1-1", "row-on.png", goldBlock(12, { at: 2, size: 2 }, 0));

  // The boxes the rows sit in are white, outlined and shaded like the cloud
  // dialog, so the clouds behind the sidebar stay behind it.
  const panel = pill(16, 16, 4, SKY.black);
  const panelFace = pill(14, 14, 3, SKY.cloud);
  rect(panelFace, 0, 12, 14, 2, SKY.cloudShade);
  round(panelFace, 3);
  blit(panel, panelFace, 1, 1);
  write("world-1-1", "panel.png", panel);

  // The ground. Its surface is the top slice — a black line and a highlight —
  // and the rounded stones are in the bottom slice, under the text, because a
  // pattern in the middle would repeat vertically to fill whatever height the
  // bar comes out at and be cut where it met the edges.
  const bar = image(32, 8);
  rect(bar, 0, 0, 32, 8, SKY.ground);
  rect(bar, 0, 0, 32, 1, SKY.black);
  rect(bar, 0, 1, 32, 1, SKY.groundL);
  for (const x of [1, 17]) {
    ring(bar, x, 3, 14, 4, SKY.groundD);
    for (const [cx, cy] of [[x, 3], [x + 13, 3], [x, 6], [x + 13, 6]]) put(bar, cx, cy, SKY.ground);
  }
  rect(bar, 0, 7, 32, 1, SKY.black);
  write("world-1-1", "statusbar.png", bar);

  // Every dialog is a cloud: a black rounded outline with a white one inside it
  // and a band of pale blue along the bottom for its underside.
  const dialog = pill(24, 24, 6, SKY.black);
  const inner = pill(22, 22, 5, SKY.cloud);
  rect(inner, 0, 19, 22, 3, SKY.cloudShade);
  round(inner, 5);
  blit(dialog, inner, 1, 1);
  write("world-1-1", "dialog.png", dialog);
}


// ---------------------------------------------------------------------------
// Grand Prix and Paddock — carbon, kerbs, a timing tower
// ---------------------------------------------------------------------------

/**
 * Two skins from one function, because they are one design in two lights: the
 * dark one is a car's carbon fibre and the light one is a garage's white
 * walls, and everything else — the kerb along the top of the pane you are in,
 * the red marker on the selected row, the chequered ends of the status bar —
 * is the same picture in the other palette.
 *
 * Motor racing in general rather than any series in particular: a kerb, a
 * chequer and a timing tower are the furniture of every circuit, and none of
 * them is a mark. No logo, no wordmark and no team's livery is drawn here, and
 * the red is a red rather than anybody's.
 *
 * **The frames are thin and the middles are clear.** These are modern cars, not
 * pixel art, so everything is drawn at 1x and shown at 2x, and the ground under
 * every part is the theme's — which is what lets the selected tab, the quiet
 * button and the dialog follow `chromeHigh` and `chrome` rather than a colour
 * baked into a picture. The exception is the two textures, the sidebar and the
 * well, and they are drawn within a step of the theme's own chrome so the
 * contrast the theme was checked at is the contrast on screen.
 *
 * `pane` and `pane-on` are cut to the same slices on purpose. A frame takes
 * room, and a focused pane whose frame was a pixel thicker would resize its
 * terminal every time the focus moved.
 */
const CIRCUIT = {
  "grand-prix": {
    // Twill: four tones close enough together to read as a weave rather than
    // as a pattern somebody has to read text over.
    weave: ["#15161a", "#1b1d21", "#121316", "#1f2126"],
    asphalt: "#0b0c0e",
    speck: ["#121316", "#17181c", "#0e0f11"],
    face: "#17181b",
    raised: "#212328",
    sunk: "#111215",
    rule: "#2e3035",
    edge: "#08090a",
    red: "#ff4545",
    redD: "#b3161c",
    kerbW: "#f2f2f2",
    chequer: ["#f2f2f2", "#0b0c0e"],
    lightEdge: "#ffffff2e",
    darkEdge: "#00000066",
  },
  paddock: {
    // A garage wall: white panels a hair apart, with a seam every so often.
    weave: ["#eeeff1", "#eceef0", "#f0f1f3", "#e9ebee"],
    asphalt: "#e6e7ea",
    speck: ["#dcdee2", "#eff0f2", "#d6d8dc"],
    face: "#eeeff1",
    raised: "#e1e3e7",
    sunk: "#f8f8f9",
    rule: "#c8cbd1",
    edge: "#9da2aa",
    red: "#c8101e",
    redD: "#8c0a14",
    kerbW: "#ffffff",
    chequer: ["#ffffff", "#18191c"],
    lightEdge: "#ffffff99",
    darkEdge: "#18191c33",
  },
};

/** A 2/2 twill, the weave every carbon part is laid up in. Two-pixel tows turning every block. */
function twill(size, tones) {
  const img = image(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const bx = x >> 1;
      const by = y >> 1;
      const along = (bx + by) % 2 === 0;
      // Along a tow its two pixels are lit and shaded across it; that is what
      // makes a weave catch the light differently block by block.
      const lit = along ? (y & 1) === 0 : (x & 1) === 0;
      put(img, x, y, tones[(along ? 0 : 2) + (lit ? 1 : 0)]);
    }
  }
  return img;
}

/** Red and white kerb blocks, `block` pixels each, along a row of `h`. */
function kerb(img, x, y, w, h, block, { red, white }) {
  for (let i = 0; i < w; i++) {
    const colour = Math.floor(i / block) % 2 === 0 ? red : white;
    rect(img, x + i, y, 1, h, colour);
  }
}

function circuit(id) {
  console.log(id);
  const P = CIRCUIT[id];
  const clear = [0, 0, 0, 0];

  // The sidebar is the weave; the paddock's is the same function with tones a
  // breath apart, which reads as a panelled wall rather than as cloth.
  write(id, "sidebar.png", twill(8, P.weave));

  const well = image(16, 16);
  rect(well, 0, 0, 16, 16, P.asphalt);
  speckle(well, P.speck, 0.22, id === "paddock" ? 41 : 17);
  write(id, "well.png", well);

  // The pane: three rows across the top, two down each side and along the
  // bottom, and a clear middle. At rest the top is a plain rule; on the pane
  // you are in it is a kerb — the one picture in the skin that says "here".
  // Twelve wide with two-pixel sides leaves an eight-pixel middle, which is
  // two kerb blocks, so the repeat never cuts a block in half.
  const pane = image(12, 12);
  rect(pane, 0, 0, 12, 3, P.face);
  rect(pane, 0, 2, 12, 1, P.rule);
  rect(pane, 0, 3, 2, 9, P.face);
  rect(pane, 10, 3, 2, 9, P.face);
  rect(pane, 0, 10, 12, 2, P.face);
  rect(pane, 1, 3, 1, 8, P.rule);
  rect(pane, 10, 3, 1, 8, P.rule);
  rect(pane, 1, 10, 10, 1, P.rule);
  rect(pane, 2, 3, 8, 7, clear);
  write(id, "pane.png", pane);

  const paneOn = image(12, 12);
  kerb(paneOn, 0, 0, 12, 2, 4, { red: P.red, white: P.kerbW });
  rect(paneOn, 0, 2, 12, 1, P.redD);
  rect(paneOn, 0, 3, 2, 9, P.face);
  rect(paneOn, 10, 3, 2, 9, P.face);
  rect(paneOn, 0, 10, 12, 2, P.face);
  rect(paneOn, 1, 3, 1, 8, P.red);
  rect(paneOn, 10, 3, 1, 8, P.red);
  rect(paneOn, 1, 10, 10, 1, P.red);
  rect(paneOn, 2, 3, 8, 7, clear);
  write(id, "pane-on.png", paneOn);

  // The tab strip is the weave's flat neighbour with a rule underneath.
  const strip = image(6, 6);
  rect(strip, 0, 0, 6, 6, P.face);
  rect(strip, 0, 5, 6, 1, P.rule);
  write(id, "tabstrip.png", strip);

  // Tabs are a timing tower's rows: at rest, a hairline divider on the right;
  // the selected one, a red marker along its top. Both clear in the middle so
  // the theme's ground under them is the one the contrast check measured.
  const tab = image(6, 6);
  rect(tab, 5, 1, 1, 4, P.rule);
  write(id, "tab.png", tab);

  const tabOn = image(6, 6);
  rect(tabOn, 0, 0, 6, 1, P.red);
  rect(tabOn, 5, 1, 1, 4, P.rule);
  write(id, "tab-on.png", tabOn);

  // A button is a lit edge and a shaded one over whatever fill the button
  // already has — the accent on a primary, `chromeHigh` on a quiet one. A red
  // picture here would have made every quiet button red too.
  const button = image(6, 6);
  rect(button, 0, 0, 6, 1, P.lightEdge);
  rect(button, 0, 5, 6, 1, P.darkEdge);
  write(id, "button.png", button);

  // The selected row is the leader's row on the tower: a red bar down its left.
  const row = image(8, 8);
  rect(row, 0, 0, 2, 8, P.red);
  write(id, "row-on.png", row);

  const panel = image(6, 6);
  rect(panel, 0, 0, 6, 6, P.sunk);
  ring(panel, 0, 0, 6, 6, P.rule);
  write(id, "panel.png", panel);

  // The status bar: a red rule along its top, and a chequer at each end. The
  // chequers are in the end slices, which repeat down the bar's height, so a
  // taller bar has more rows of squares rather than stretched ones.
  const bar = image(32, 12);
  rect(bar, 0, 0, 32, 12, P.face);
  rect(bar, 0, 0, 32, 1, P.red);
  for (const x0 of [0, 24]) {
    for (let j = 1; j < 12; j++) {
      for (let i = 0; i < 8; i++) {
        put(bar, x0 + i, j, P.chequer[((i >> 1) + ((j - 1) >> 1)) % 2]);
      }
    }
  }
  // Clear between the ends, so the bar's ground is the theme's and its labels
  // are read against the colour they were checked against.
  rect(bar, 8, 1, 16, 11, clear);
  write(id, "statusbar.png", bar);

  // A dialog is a rule round the edge and a red stripe across the top, the
  // graphic a broadcast puts up when somebody is talking on the radio.
  const dialog = image(12, 12);
  ring(dialog, 0, 0, 12, 12, P.rule);
  rect(dialog, 0, 0, 12, 2, P.red);
  write(id, "dialog.png", dialog);
}

// ---------------------------------------------------------------------------
// The people — sprite sheets for the packs that are homages
// ---------------------------------------------------------------------------

/**
 * Four little figures, so a pack that dresses the window in bricks and blue sky
 * has somebody in it rather than a fox.
 *
 * The same argument the skins above make, twice over. **Drawn from the idea of a
 * kind of character rather than from anybody's sprite** — a person in a cap, a
 * person in a pointed hat with a sword, a person in a helmet, a person with a
 * pick — because those are silhouettes, and a silhouette at sixteen pixels is
 * not a thing anybody owns. Nothing here was traced, ripped or recoloured from a
 * game's files, and none of them is named after a character.
 *
 * And **drawn by code so they can be changed**: the bodies below are ASCII, one
 * character per pixel, which is the same `sprite()` the picture skins use. A
 * contributor who wants the cap a pixel taller edits a row of text.
 *
 * ## The sheet shape, which is kururu's and is strict
 *
 * One PNG, square cells, one clip per row:
 *
 *     row 0   idle      2 frames
 *     row 1   working   4 frames
 *
 * Sixteen-pixel cells, because sixteen pixels is what the badge beside a working
 * agent actually is — `docs/styles.md` in kururu is emphatic that a sheet has to
 * be checked at the size it is drawn at, and drawing these at the badge's own
 * size sidesteps the question. Six frames of 16×16 is a 96×32 picture and about
 * four hundred bytes.
 *
 * ## Why the walk is a bounce
 *
 * Four frames: legs apart, legs together and the whole body up a pixel, legs
 * further apart, together and up again. That is a *bounce*, not a walk cycle,
 * and it is deliberate — a real cycle needs the arms to swing opposite the legs
 * to read, the arms here are two pixels each, and two pixels cannot swing. What
 * survives at this size is vertical motion, so that is what these do. The
 * animals in `mascots/` have six and eight frames because they were photographed
 * sprites with the room for them.
 *
 * The trim is **computed from the finished sheet**, never typed: it is the union
 * bounding box over every frame of both clips, which is the rule kururu states
 * and the one that keeps a bobbing figure from being rescaled per frame.
 */
const FIGURE_LEGS = {
  /** Standing: both feet down, a gap between them. */
  stand: ["....oppppppo....", "....opo..opo....", "...obbo..obbo..."],
  /** Mid-stride. */
  step: ["....oppppppo....", "...opo...opo....", "..obbo...obbo..."],
  /**
   * Pushing off: the same shins, on wider feet.
   *
   * The first cut moved the *legs* further apart and it read as the splits
   * rather than as a stride — at three rows of leg there is no knee to bend, so
   * separation past a couple of pixels stops looking like walking and starts
   * looking like an injury. Lengthening the feet says the same thing and stays
   * inside the silhouette.
   */
  stride: ["....oppppppo....", "...opo...opo....", "..obbbo..obbbo.."],
  /** Passing: feet together under the body. */
  pass: ["....oppppppo....", "......oppo......", ".....obbbbo....."],
};

/**
 * A torso in the plumber's cut — sleeves, two gloved hands, a bib — which three
 * of the four wear. Only the colours differ, which is the whole reason it is one
 * block of text rather than three.
 */
const TORSO_SLEEVED = ["...ottTTTTtto...", "..ogtTTTTTTtgo..", "...oTTTTTTTTo...", "....oTTTTTTo...."];

/** Bare arms, for the one in a tunic. */
const TORSO_BARE = ["...osttttttso...", "..osttttttttso..", "...otttttttto...", "....owwwwwwo...."];

const FIGURES = [
  {
    id: "plumber",
    name: "Plumber",
    description: "A short person in a red cap and blue overalls, bouncing along. For a window made of bricks and blue sky.",
    head: [
      "......oooo......",
      ".....occccoo....",
      "....occccccooo..",
      "....ossesesso...",
      "....oshhhhhso...",
      ".....osssso.....",
    ],
    torso: TORSO_SLEEVED,
    palette: {
      o: "#1a1008", c: "#d22b2b", s: "#f0b088", e: "#241a12", h: "#5a3a18",
      t: "#d22b2b", T: "#2b58c4", g: "#f4f0e8", p: "#2b58c4", b: "#6b4420",
    },
  },
  {
    id: "hero",
    name: "Hero",
    description: "A small person in a green tunic and a pointed cap, with a sword out. For a window made of dungeon walls.",
    head: [
      "........oo......",
      "......occco.....",
      "....occccccoo...",
      "....ossesesso...",
      "....osssssso....",
      ".....osssso.....",
    ],
    torso: TORSO_BARE,
    palette: {
      o: "#101808", c: "#3aa03a", s: "#f0c090", e: "#201810", t: "#3aa03a",
      w: "#7a4a1c", p: "#e8d8b0", b: "#7a4a1c", m: "#d8e4ec", M: "#8c9aa6",
    },
    prop: "sword",
  },
  {
    id: "knight",
    name: "Knight",
    description: "A figure in a full steel helm with the visor down, sword drawn. For the riveted window, and for anybody who wants to be looked at sternly.",
    head: [
      "......oooo......",
      ".....oCCCCo.....",
      "....occccccoo...",
      "....oceeeecoo...",
      "....occccccoo...",
      ".....occcco.....",
    ],
    torso: TORSO_SLEEVED,
    palette: {
      // Light pauldrons over a darker breastplate, not the other way round: the
      // first cut had the chest lighter than the sleeves and the whole figure
      // read as one grey blob at sixteen pixels.
      o: "#0c0e10", c: "#6d757d", C: "#a7b0b8", e: "#14171a", t: "#9aa2aa",
      T: "#4a5157", g: "#c2cad2", p: "#3a4047", b: "#1c2024", m: "#d8e4ec", M: "#8c9aa6",
    },
    prop: "sword",
  },
  {
    id: "miner",
    name: "Miner",
    description: "A bearded person in a hard hat with the lamp lit, carrying a pick. For the inventory-screen window.",
    head: [
      "......oooo......",
      ".....occccoo....",
      "...loccccccoo...",
      "....ossesesso...",
      "....oshhhhhso...",
      ".....osssso.....",
    ],
    torso: TORSO_SLEEVED,
    palette: {
      o: "#14100c", c: "#b8860b", l: "#ffe066", s: "#e0a878", e: "#201810",
      h: "#4a3520", t: "#2f6aa8", T: "#24547f", g: "#8a6a3a", p: "#5a4028", b: "#2e2218",
      m: "#9aa4ac", w: "#6b4420",
    },
    prop: "pick",
  },
];

/**
 * A prop in the figure's right hand.
 *
 * Drawn after the body and *not* included in the bob, which is the one thing
 * here that is a decision rather than a drawing: a sword that rose and fell with
 * the shoulder would read as being waved, and what is wanted is somebody walking
 * while holding one. It sits still and the person bounces past it, which is also
 * what carrying something looks like.
 */
function prop(img, ox, oy, kind, key) {
  if (kind === "sword") {
    // Blade up the right edge, a crossguard at the hand, one pixel of shine.
    for (let y = 3; y <= 8; y++) put(img, ox + 13, oy + y, key.m);
    for (let y = 3; y <= 8; y++) put(img, ox + 14, oy + y, key.M);
    put(img, ox + 13, oy + 2, key.o);
    rect(img, ox + 12, oy + 9, 3, 1, key.o);
    put(img, ox + 13, oy + 10, key.o);
  }
  if (kind === "pick") {
    // A haft over the shoulder and a head across the top of it.
    for (let y = 4; y <= 10; y++) put(img, ox + 13, oy + y, key.w);
    rect(img, ox + 11, oy + 3, 4, 1, key.m);
    put(img, ox + 11, oy + 4, key.m);
    put(img, ox + 14, oy + 4, key.m);
  }
}

/** One 16px cell: head, torso, legs, prop, all shifted down by the bounce. */
function figure(img, ox, oy, spec, { legs, bob }) {
  const key = spec.palette;
  const top = oy + 1 - bob;
  sprite(img, ox, top, spec.head, key);
  sprite(img, ox, top + 6, spec.torso, key);
  sprite(img, ox, top + 10, FIGURE_LEGS[legs], key);
  if (spec.prop) prop(img, ox, oy, spec.prop, key);
}

/**
 * The union bounding box of every non-transparent pixel in the sheet, expressed
 * as the square kururu's `trim` wants.
 *
 * Computed rather than typed, and over the *whole sheet* rather than per frame,
 * for the reason kururu's docs give and this script would otherwise get wrong on
 * its own output: the bounce is a figure sitting one pixel higher in its cell,
 * and a trim measured per frame would cancel exactly the motion the frames were
 * drawn for.
 */
function sheetTrim(img, cell) {
  let x0 = cell;
  let y0 = cell;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] === 0) continue;
      const cx = x % cell;
      const cy = y % cell;
      if (cx < x0) x0 = cx;
      if (cy < y0) y0 = cy;
      if (cx > x1) x1 = cx;
      if (cy > y1) y1 = cy;
    }
  }
  // Square, because a cell is square and a badge scales one number. The larger
  // of the two sides wins and is centred on the other axis, which is what keeps
  // a tall figure from being squashed to its own width.
  const size = Math.max(x1 - x0 + 1, y1 - y0 + 1);
  return {
    x: Math.max(0, Math.min(cell - size, x0 - Math.floor((size - (x1 - x0 + 1)) / 2))),
    y: Math.max(0, Math.min(cell - size, y0 - Math.floor((size - (y1 - y0 + 1)) / 2))),
    size,
  };
}

const CELL = 16;

/** Row 0 is the idle clip and row 1 is the walk — see the header for the poses. */
const IDLE = [
  { legs: "stand", bob: 0 },
  { legs: "stand", bob: 1 },
];
const WALK = [
  { legs: "step", bob: 0 },
  { legs: "pass", bob: 1 },
  { legs: "stride", bob: 0 },
  { legs: "pass", bob: 1 },
];

/**
 * A sheet and its manifest, row 1 working and row 0 idle, with the trim read off
 * the finished picture. Shared by the people and the hand so that the one rule
 * every generated mascot has to keep — the trim is measured, never typed — is
 * written once.
 */
function mascot(spec, img, { working, idle, blocked, done }) {
  const dir = join(ROOT, "mascots", spec.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "sheet.png"), encodePng(img));
  const trim = sheetTrim(img, CELL);
  const manifest = {
    schema: 1,
    kind: "mascot",
    id: spec.id,
    name: spec.name,
    version: "1.0.0",
    description: spec.description,
    author: "kururu-styles",
    licence: "CC0-1.0",
    sheet: "sheet.png",
    frame: CELL,
    trim,
    working: { row: 1, col: 0, ...working },
    idle: { row: 0, col: 0, ...idle },
    ...(blocked && { blocked }),
    ...(done && { done }),
  };
  writeFileSync(join(dir, "mascot.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`  mascots/${spec.id}/sheet.png ${img.width}×${img.height}  trim ${trim.x},${trim.y} ${trim.size}px`);
}

function people() {
  for (const spec of FIGURES) {
    const img = image(CELL * Math.max(IDLE.length, WALK.length), CELL * 2);
    IDLE.forEach((pose, i) => figure(img, i * CELL, 0, spec, pose));
    WALK.forEach((pose, i) => figure(img, i * CELL, CELL, spec, pose));
    mascot(spec, img, {
      working: { count: WALK.length, cycle: 640 },
      idle: { count: IDLE.length, cycle: 1600 },
    });
  }
}

// ---------------------------------------------------------------------------
// A hand, waving
// ---------------------------------------------------------------------------

/**
 * A cartoon hand in a cuff, which waves while its agent works.
 *
 * Drawn here rather than found, and not for want of looking: what the open
 * archives have under "hand" is cursors, first-person spell-casting photographs
 * and a pixel *Creation of Adam* whose licence is given as "CC1", which is not
 * a licence anybody can check. A registry that refuses a sprite it cannot name the licence of
 * is left with drawing one, and drawing it in code keeps it in the same state as
 * the four people above — anybody can change the wave by editing a number.
 *
 * Three fingers and a thumb, which is the cartoon convention and also the only
 * hand that fits. Four two-pixel fingers with an outline between each are
 * thirteen pixels wide before the thumb, and a wave needs two pixels of swing to
 * either side of that inside sixteen.
 *
 * ## Why the wave is a tilt in blocks
 *
 * The obvious wave is a shear about the wrist, each row shifted in proportion to
 * its height. The first cut did that and the fingers broke: a two-pixel finger
 * that steps sideways half way up its own length reads as a knuckle bent the
 * wrong way, and at sixteen pixels there is nothing else in the finger to
 * contradict it. So the hand moves in three rigid blocks — the fingers by the
 * full lean, the knuckles and the top of the palm by half of it, the wrist not at
 * all — and the only steps land where a hand actually bends.
 *
 * The outline is drawn *after* the tilt, round whatever pixels landed, rather
 * than being part of the rows. Tilted with the fill, an outline drawn into the
 * picture opens at every step; traced afterwards it is closed by construction,
 * and the gaps between the fingers come out of the same pass for free, because a
 * one-pixel gap is a transparent pixel with fill on both sides of it.
 */
const HAND = [
  "................",
  "........hs......",
  ".....hs.hs.hs...",
  ".....hs.hs.hs...",
  ".....hs.hs.hs...",
  ".....hs.hs.hs...",
  "..hs.hs.hs.hs...",
  "..hss.sssssssS..",
  "...hsssssssssS..",
  "....hssssssssS..",
  ".....sssssssSS..",
  ".....ssssssSS...",
  "......cccccc....",
  "......cccccC....",
  "................",
  "................",
];

/**
 * The emoji's yellow rather than a skin tone, so that the hand is nobody's in
 * particular; light on the left of every finger, shade down the right of the
 * palm. A blue cuff, because a wrist that ends in nothing reads as a glove.
 */
const HAND_KEY = { h: "#ffe28a", s: "#ffc83d", S: "#e09a1a", c: "#5b8fe0", C: "#3d6cb8" };
const HAND_EDGE = "#4a2c08";

/**
 * The two strokes on the side a hand has just swung away from. Grey and not the
 * outline's brown, because the brown vanishes against a dark sidebar and these
 * have no fill beside them to be seen against.
 */
const HAND_MARK = "#9aa4b8";

/** How far each row moves for a lean of `lean`: fingers, then knuckles and palm, then wrist. */
function handShift(y, lean) {
  if (y <= 5) return lean;
  if (y <= 9) return Math.sign(lean) * Math.floor(Math.abs(lean) / 2);
  return 0;
}

/**
 * Copy `cell` into `img` at (ox, oy) and trace `edge` a pixel out round whatever
 * landed in it — the outline-afterwards described above, shared with the drinks
 * below, which need it for the same reason when a can rattles a pixel.
 */
function traced(img, ox, oy, cell, edge) {
  const filled = (x, y) =>
    x >= 0 && y >= 0 && x < cell.width && y < cell.height && cell.data[(y * cell.width + x) * 4 + 3] > 0;
  for (let y = 0; y < cell.height; y++) {
    for (let x = 0; x < cell.width; x++) {
      const at = (y * cell.width + x) * 4;
      if (filled(x, y)) put(img, ox + x, oy + y, [...cell.data.subarray(at, at + 4)]);
      else if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) put(img, ox + x, oy + y, edge);
    }
  }
}

function handFrame(img, ox, oy, lean) {
  const cell = image(CELL, CELL);
  HAND.forEach((row, y) => {
    const dx = handShift(y, lean);
    [...row].forEach((ch, x) => {
      if (HAND_KEY[ch]) put(cell, x + dx, y, HAND_KEY[ch]);
    });
  });
  traced(img, ox, oy, cell, HAND_EDGE);
  if (Math.abs(lean) === 2) {
    const marks = lean > 0 ? [[2, 2], [1, 3], [1, 4], [2, 5]] : [[13, 2], [14, 3], [14, 4], [13, 5]];
    for (const [x, y] of marks) put(img, ox + x, oy + y, HAND_MARK);
  }
}

/**
 * Idle is a lazy half-wave, two frames slow. Working is the whole wave, out to
 * the marks on each side and back through the middle without stopping there —
 * a frame at zero would be a beat where the hand holds still, which is the idle
 * clip's job and would make the two harder to tell apart at a glance.
 */
const HAND_IDLE = [0, 1];
const HAND_WAVE = [-2, -1, 1, 2, 1, -1];

function hand() {
  const img = image(CELL * Math.max(HAND_IDLE.length, HAND_WAVE.length), CELL * 2);
  HAND_IDLE.forEach((lean, i) => handFrame(img, i * CELL, 0, lean));
  HAND_WAVE.forEach((lean, i) => handFrame(img, i * CELL, CELL, lean));
  mascot(
    {
      id: "hand",
      name: "Hand",
      description: "A cartoon hand in a blue cuff, drawn at the badge's own sixteen pixels. Waves hello while it works and lifts a lazy palm while it waits.",
    },
    img,
    {
      working: { count: HAND_WAVE.length, cycle: 600 },
      idle: { count: HAND_IDLE.length, cycle: 1800 },
    },
  );
}

// ---------------------------------------------------------------------------
// Drinks — a cup of tea, a can of soda, a cup of bubble tea
// ---------------------------------------------------------------------------

/**
 * Three drinks, for the agent that runs on them.
 *
 * Drawn here for the reason the hand is, narrower: the open archives have drinks
 * by the dozen and every one of them is an icon. A mascot is two clips, and a
 * still cup with a licence is a picture of a mascot rather than one. The one
 * drink that came animated, a steaming mug, is `mascots/coffee`, cut from its
 * artist's own sheet; these are the ones nobody had drawn moving.
 *
 * Each is a body and something that rises off it. The body is ASCII through a
 * key and outlined afterwards, the hand's way, so a cup nudged a pixel keeps a
 * closed edge. What rises — steam, fizz — is drawn after the outline and is
 * never outlined itself, because a ring round a wisp of steam makes it solid.
 * It is grey-blue rather than white for the reason the hand's marks are grey:
 * white vanishes on a light sidebar and these have no fill beside them.
 *
 * Working and idle are the same drink at two tempos, never two drawings: a badge
 * that changed what it was when its agent stopped would read as a different
 * agent. Working has more coming off it and moves faster; idle is one wisp, one
 * bubble, a settling — still warm, still open, not busy.
 */
const DRINK_EDGE = "#3a2a24";

/**
 * A tile scrolled up through a window, a row a frame: what steam and fizz both
 * are. Window row `y` shows tile row `(y + frame) % period`, so whatever is in
 * the tile rises and wraps, and a clip as long as the period loops without a
 * seam. `colours` runs top to bottom of the window and its last entry fills the
 * rest, which is how a wisp thins out as it climbs.
 */
function rising(tile, frame, { x, top, height, colours }) {
  const out = [];
  for (let j = 0; j < height; j++) {
    const row = tile[(j + frame) % tile.length];
    const colour = colours[Math.min(j, colours.length - 1)];
    [...row].forEach((ch, i) => {
      if (ch === "X") out.push([x + i, top + j, colour]);
    });
  }
  return out;
}

/**
 * One drink cell. `body` is painted through `key` and moved by `dx`/`dy`, then
 * `inside` — pixels that sit on the body and change no edge, a tag or a pearl —
 * then the outline, then `over`, which floats above it unoutlined.
 */
function drinkFrame(img, ox, oy, { body, key, dx = 0, dy = 0, inside = [], over = [] }) {
  const cell = image(CELL, CELL);
  sprite(cell, dx, dy, body, key);
  for (const [x, y, colour] of inside) put(cell, x + dx, y + dy, colour);
  traced(img, ox, oy, cell, DRINK_EDGE);
  for (const [x, y, colour] of over) put(img, ox + x, oy + y, colour);
}

/** An S of steam with one gap in eight, so it reads as a curl going up rather than a wire standing still. */
const WISP = [".X.", "X..", "X..", ".X.", "..X", "..X", ".X.", "..."];
const STEAM = ["#e3e8ef", "#c9d1dc", "#aeb9c8"];

// Tea: a china cup on a saucer, a tea bag's tag hanging down the front.

const TEA = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "..wttttttttW....",
  "..wwwwwwwwwWhh..",
  "..wwwwwwwwwW.h..",
  "..wwwwwwwwwWhh..",
  "...wwwwwwwW.....",
  "....wwwwwW......",
  ".ssssssssssss...",
  "..SSSSSSSSSS....",
  "................",
];
const TEA_KEY = { w: "#fbf6ec", W: "#d6cab6", h: "#fbf6ec", t: "#b8622a", s: "#efe6d6", S: "#c4b6a0" };
const TAG = { y: "#f2b632", Y: "#c4851a", string: "#8c7a66" };

/** The tag at `top`, three by two, and the string from the rim down to it. */
function teaBag(top) {
  const out = [];
  for (let y = 7; y < top; y++) out.push([6, y, TAG.string]);
  out.push([5, top, TAG.y], [6, top, TAG.y], [7, top, TAG.Y]);
  out.push([5, top + 1, TAG.Y], [6, top + 1, TAG.Y], [7, top + 1, TAG.Y]);
  return out;
}

/** Idle: one wisp, the bag at rest. Working: two wisps out of phase and the bag dunked twice a loop. */
const TEA_IDLE = WISP.map((_, f) => ({ tag: 10, wisps: [[6, f]] }));
const TEA_WORK = WISP.map((_, f) => ({ tag: [10, 9, 8, 9, 10, 9, 8, 9][f], wisps: [[3, f], [7, (f + 4) % WISP.length]] }));

function teaFrame(img, ox, oy, { tag, wisps }) {
  const over = wisps.flatMap(([x, f]) => rising(WISP, f, { x, top: 0, height: 6, colours: STEAM }));
  drinkFrame(img, ox, oy, { body: TEA, key: TEA_KEY, inside: teaBag(tag), over });
}

// Soda: a red can, opened, with a white swoosh.

const SODA = [
  "................",
  "................",
  "................",
  "................",
  "................",
  ".....ggkkgg.....",
  "....GGGGGGGG....",
  "....lrrrrrrR....",
  "....lrrrrwwR....",
  "....lrwwwwrR....",
  "....lwwrrrrR....",
  "....lrrrrrrR....",
  "....lrrrrrrR....",
  "....GGGGGGGG....",
  ".....gggggg.....",
  "................",
];
const SODA_KEY = { r: "#e2483d", l: "#ff8f80", R: "#a32a22", w: "#fff4ec", g: "#d5dbe3", G: "#8f98a6", k: "#4e5561" };

/**
 * Bubbles off the tab, six rows of them. Never two in one column on adjacent
 * rows, because two bubbles touching vertically read as a line standing still
 * rather than as two things rising.
 */
const FIZZ = ["X...X.", "..X...", "....X.", ".X....", "...X.X", "..X..."];
const BUBBLE = ["#d7ecfb", "#a9d2f0"];
const ONE_BUBBLE = ["..", "..", "X.", ".X", "..", ".."];

/** Idle: one bubble, slowly. Working: the fizz, and the can rattles a pixel on every other frame. */
const SODA_IDLE = ONE_BUBBLE.map((_, f) => ({ f, tile: ONE_BUBBLE, x: 7, rattle: 0 }));
const SODA_WORK = FIZZ.map((_, f) => ({ f, tile: FIZZ, x: 5, rattle: f % 2 }));

function sodaFrame(img, ox, oy, { f, tile, x, rattle }) {
  const over = rising(tile, f, { x, top: 0, height: 4 - rattle, colours: BUBBLE });
  drinkFrame(img, ox, oy, { body: SODA, key: SODA_KEY, dy: -rattle, over });
}

// Bubble tea: a clear cup of milk tea, pearls at the bottom, a fat pink straw.

const BOBA = [
  "..........pP....",
  ".........pP.....",
  "........pP......",
  ".......pP.......",
  "....LLLLLLLL....",
  "....cmmmmmmM....",
  "....cmmmmmmM....",
  "....cmmmmmmM....",
  "....cmmmmmmM....",
  "....cmmmmmmM....",
  ".....cmmmmM.....",
  ".....cmmmmM.....",
  ".....cmmmmM.....",
  ".....cmmmmM.....",
  ".....cccccc.....",
  "................",
];
const BOBA_KEY = { p: "#ff86b8", P: "#d4508c", L: "#f7d4e2", c: "#eef5f9", m: "#dcb48a", M: "#c39568" };
/**
 * The pearls, a pixel apart in a checker and swapped between the two, which at
 * this size is a jostle. Single dots, because four pixels across will not hold a
 * round pearl and anything bigger merges into a lump: the first cut was a heap
 * and read as one, and the cut before that put two dots over a line and smiled.
 */
const PEARLS = [
  ["o.o.", ".o.o", "o.o."],
  [".o.o", "o.o.", ".o.o"],
];
const PEARL = "#3b2416";

/** Where a pearl is on its way up the straw, a row at a time, filling the straw's width. */
const STRAW = [[7, 3], [8, 2], [9, 1], [10, 0]];

/** Idle: the pearls settle back and forth, slowly. Working: they jostle and one goes up the straw. */
const BOBA_IDLE = [0, 1].map((k) => ({ pearls: k, sip: -1 }));
const BOBA_WORK = [0, 1, 2, 3, 4, 5].map((f) => ({ pearls: f % 2, sip: f < STRAW.length ? f : -1 }));

function bobaFrame(img, ox, oy, { pearls, sip }) {
  const inside = [];
  PEARLS[pearls].forEach((row, j) => {
    [...row].forEach((ch, i) => {
      if (ch === "o") inside.push([6 + i, 11 + j, PEARL]);
    });
  });
  if (sip >= 0) {
    const [x, y] = STRAW[sip];
    inside.push([x, y, PEARL], [x + 1, y, PEARL]);
  }
  drinkFrame(img, ox, oy, { body: BOBA, key: BOBA_KEY, inside });
}

function drinks() {
  const kinds = [
    {
      id: "tea",
      name: "Tea",
      description: "A china cup of tea on a saucer, the bag's tag hanging down the front. Dunks the bag and steams while it works; one wisp while it waits.",
      frame: teaFrame,
      idle: TEA_IDLE,
      working: TEA_WORK,
      cycles: { idle: 2400, working: 960 },
    },
    {
      id: "soda",
      name: "Soda",
      description: "An opened red can with a white swoosh. Fizzes and rattles while it works; lets one bubble up while it waits.",
      frame: sodaFrame,
      idle: SODA_IDLE,
      working: SODA_WORK,
      cycles: { idle: 2400, working: 540 },
    },
    {
      id: "boba",
      name: "Boba",
      description: "A cup of milk tea with pearls at the bottom and a fat pink straw. Sends a pearl up the straw while it works; the pearls settle while it waits.",
      frame: bobaFrame,
      idle: BOBA_IDLE,
      working: BOBA_WORK,
      cycles: { idle: 2000, working: 720 },
    },
  ];
  for (const kind of kinds) {
    const img = image(CELL * Math.max(kind.idle.length, kind.working.length), CELL * 2);
    kind.idle.forEach((pose, i) => kind.frame(img, i * CELL, 0, pose));
    kind.working.forEach((pose, i) => kind.frame(img, i * CELL, CELL, pose));
    mascot(kind, img, {
      working: { count: kind.working.length, cycle: kind.cycles.working },
      idle: { count: kind.idle.length, cycle: kind.cycles.idle },
    });
  }
}

// ---------------------------------------------------------------------------
// The racer — a helmet, a pit board and a chequered flag
// ---------------------------------------------------------------------------

/**
 * The one mascot here with a picture for every state, which is what kururu's
 * `blocked` and `done` clips are for: a helmet at rest on the grid, the same
 * helmet with the air streaming past it while it works, the pit board that
 * calls a car in when the agent is waiting on you, and the chequered flag when
 * its turn is over. Four rows rather than two:
 *
 *     row 0   idle      2 frames   a glint crossing the visor
 *     row 1   working   4 frames   speed lines, and a pixel of vibration
 *     row 2   blocked   2 frames   BOX, raised and lowered
 *     row 3   done      4 frames   the flag, waving
 *
 * A helmet rather than a car because a car is a wide thing and the badge is a
 * square: a side-on car at sixteen pixels letterboxes to five pixels tall. The
 * helmet is a generic full-face shape in a red of no one's; the pit board says
 * BOX, which is the word every series uses for "come in".
 *
 * The flag and the board carry an outline of their own in a mid grey, because
 * these sheets are not themed and the same picture has to read on the carbon
 * sidebar and on the paddock's white one: black squares vanish into the first
 * and white squares into the second, and the outline is what keeps the shape.
 */
const RACER_KEY = {
  o: "#0b0b0d",
  R: "#e8262e",
  r: "#a3141b",
  W: "#f4f4f4",
  v: "#1d2a3a",
  V: "#2f4560",
  g: "#bfe6ff",
};

const HELMET = [
  "....ooooo....",
  "..ooRRRRRoo..",
  ".oRRRRRRRRRo.",
  "oRRWWWWWWWRRo",
  "oRRRRRRoooooo",
  "oRRRRRovvvvvo",
  "oRRRRRoVvvvvo",
  "oRRRRRRoooooo",
  "oRRRRRRRRRRRo",
  ".orrrrrrrrro.",
  "..ooooooooo..",
];

function helmet(img, x, y, glint) {
  sprite(img, x, y, HELMET, RACER_KEY);
  if (glint !== null) put(img, x + 7 + glint, y + 5, RACER_KEY.g);
}

/**
 * Lines of air behind the helmet: three dashes in the three columns the helmet
 * leaves free, each a frame out of step with the one above, so the air reads as
 * moving past rather than blinking.
 */
const STREAKS = [5, 8, 11];

function racerWorking(img, ox, oy, f) {
  const bob = f % 2;
  STREAKS.forEach((y, k) => {
    const x = (k + f) % 4;
    rect(img, ox + Math.max(0, x - 2), oy + y + bob, Math.min(x, 3) - Math.max(0, x - 2) + 1, 1, "#9aa4b0");
  });
  helmet(img, ox + 3, oy + 2 + bob, null);
}

/** BOX in a three-by-five face, which is the smallest that still spells it. */
const BOX = [
  "XX..XXX.X.X",
  "X.X.X.X.X.X",
  "XX..X.X..X.",
  "X.X.X.X.X.X",
  "XX..XXX.X.X",
];

function pitBoard(img, ox, oy, raised, lit) {
  const y = oy + (raised ? 1 : 2);
  rect(img, ox + 7, y + 9, 2, 16 - (y - oy) - 9, "#8a8f97");
  rect(img, ox + 1, y, 14, 9, "#7b8089");
  rect(img, ox + 2, y + 1, 12, 7, "#141518");
  sprite(img, ox + 3, y + 2, BOX, { X: lit ? "#ffd400" : "#f4f4f4" });
}

/** A chequer of two-pixel squares, five by four, with each column lifted by the wave. */
function chequeredFlag(img, ox, oy, f) {
  rect(img, ox + 2, oy + 1, 1, 15, "#c9ccd2");
  put(img, ox + 2, oy + 1, "#f4f4f4");
  for (let i = 0; i < 12; i++) {
    // Lifted a square column at a time, so the squares stay square.
    const lift = Math.round(Math.sin(((i >> 1) / 6 + f / 4) * Math.PI * 2));
    const x = ox + 3 + i;
    const top = oy + 2 + lift;
    put(img, x, top, "#7b8089");
    for (let j = 0; j < 8; j++) {
      const white = ((i >> 1) + (j >> 1)) % 2 === 0;
      put(img, x, top + 1 + j, white ? "#f4f4f4" : "#16171a");
    }
    put(img, x, top + 9, "#7b8089");
  }
  rect(img, ox + 15, oy + 2, 1, 10, [0, 0, 0, 0]);
}

function racer() {
  const img = image(CELL * 4, CELL * 4);
  [null, 1].forEach((glint, i) => helmet(img, i * CELL + 2, 3, glint === null ? null : glint));
  [0, 1, 2, 3].forEach((f) => racerWorking(img, f * CELL, CELL, f));
  [true, false].forEach((raised, i) => pitBoard(img, i * CELL, CELL * 2, raised, raised));
  [0, 1, 2, 3].forEach((f) => chequeredFlag(img, f * CELL, CELL * 3, f));
  mascot(
    {
      id: "racer",
      name: "Racer",
      description: "A helmet on the grid, at speed while it works, a BOX board when it wants you and a chequered flag when it is done. Draws all four states.",
    },
    img,
    {
      working: { count: 4, cycle: 360 },
      idle: { count: 2, cycle: 2400 },
      blocked: { row: 2, col: 0, count: 2, cycle: 900 },
      done: { row: 3, col: 0, count: 4, cycle: 880 },
    },
  );
}

ironclad();
handheld();
cobble();
quest();
world11();
circuit("grand-prix");
circuit("paddock");
console.log("mascots:");
people();
hand();
drinks();
racer();
