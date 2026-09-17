/**
 * The pictures for the skins that show what a skin can be, drawn by code.
 *
 *     node tools/art.mjs
 *
 * `skins/ironclad`, `skins/handheld`, `skins/cobble`, `skins/quest` and
 * `skins/world-1-1` are made of nine-slices and tiles, and every one of them is
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

ironclad();
handheld();
cobble();
quest();
world11();
