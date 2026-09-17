# Adding a style

Add a directory, run the validator, open a pull request. There is no account to
make, nothing to build and nothing to publish — when it merges, CI rebuilds
`index.json` and every kururu in the world can install it.

```sh
git clone git@github.com:tonyjara/kururu-styles.git
cd kururu-styles
# ... add your directory ...
node tools/validate.mjs
```

`validate.mjs` is the whole review. It is plain Node with no dependencies, it is
exactly what CI runs, and it will tell you everything that is wrong before a
human looks. A green run and a pull request is the entire process.

**Read [README.md](README.md) first** for the two rules that get a pull request
sent back (no URLs; fonts need a licence). Everything below assumes them.

---

## A theme

`themes/<your-id>/theme.json`, and nothing else in the directory.

A theme is **complete** — every token, no merge, no inheriting. See the README
for why that is the opposite of the rule for skins. The validator lists anything
you missed, so the fastest way to start is to copy the closest existing one:

```sh
cp -r themes/nord themes/my-theme
$EDITOR themes/my-theme/theme.json   # change id, name, version to 1.0.0, and the colours
```

### What each token is for

The jobs are named rather than the colours, so that a theme is forced to answer
"what is a danger label here" rather than leave it to whatever was set last.

| token | drawn where |
|---|---|
| `bg` | the ground a pane sits on, **and the terminal background** — tie these together or a pane and the emulator in it read as two surfaces that nearly match |
| `chrome` | sidebar, tab strips, dialogs — everything that is not a terminal |
| `chromeHigh` | hovered and selected chrome |
| `line` / `lineHigh` | borders and rules; the second is one that has been picked out |
| `text` / `textStrong` | body, and a step above it. If your palette's neutral ramp ends at `text`, use it for both — emphasis then comes from weight, which is honest |
| `dim` / `dimmer` | secondary text, and the least important thing on a row |
| `accent` | the focus ring, the unread mark, the terminal cursor, the first workspace tag |
| `onAccent` | text on top of `accent`. Usually the darkest colour in the palette |
| `idle` `working` `blocked` `done` `exited` | the five agent states. `working` must be **distinguishable from `accent` at a glance** — it was once the same colour, which made the one state worth spotting the least visible thing on the row |
| `danger` | a destructive *label* — a close cross, a delete row |
| `dangerBg` / `onDanger` | the one destructive *button*, which is a fill and needs its own pairing |
| `scrim` / `shadow` | behind a dialog, and under a menu. Both carry alpha; a light theme needs a light theme's scrim or the dialog reads as a modal over a photograph |

`terminal` is [ghostty's `ITheme`](https://ghostty.org) — sixteen ANSI slots plus
background, foreground, cursor, `cursorAccent` and `selectionBackground`. If the
palette you are porting publishes an ANSI set, **use it verbatim**, even where it
looks like an oversight. Catppuccin and Nord both give normal and bright the same
hue on the chromatic slots; that is the spec, and a flavour that invented a
brighter red would no longer be the thing on the tin.

`workspace` is eight tags drawn a few pixels wide on `--chrome`, so they are
chosen *against the chrome* rather than against each other. Keep `green` equal to
`accent` and `blue` equal to `done`, so that tagging a workspace never introduces
a colour the window did not already have. Where your palette has no yellow-green,
mixing two of its own colours beats inventing a ninth.

### If you are porting somebody's palette

Say so, and link it. `author` is whoever made the palette, not whoever wrote the
JSON; `homepage` is where it lives; `licence` is theirs.

```json
"author": "Arctic Ice Studio",
"homepage": "https://www.nordtheme.com",
"licence": "MIT",
```

Use the published values verbatim wherever the palette has an entry for the job.
Where it does not — kururu has jobs no editor theme has — choose something *from
inside that palette* rather than beside it, and prefer a mix of two of its own
colours to a new one.

---

## A skin

`skins/<your-id>/skin.json`, plus the pictures, fonts or stylesheet it names.

A skin is what the window is *made of*. It was radii, line weights and a type
ramp; it is now also **pictures** — one for each part of the chrome — and the
chrome colours that go with them. Winamp's skins were a directory of bitmaps,
and this is that, named for a multiplexer.

The quickest way to make one is inside kururu: *Settings → Skin studio* edits a
skin live, with the window as the preview, and writes exactly this directory to
`~/.config/kururu/styles/skins/<id>/`. Copy that folder here, run the validator,
open a pull request. The rest of this section is what the studio is writing.

```json
{
  "schema": 1,
  "kind": "skin",
  "id": "my-skin",
  "name": "My Skin",
  "version": "1.0.0",
  "description": "One line. What kind of window this is.",
  "author": "you",
  "licence": "CC0-1.0",
  "tokens": { "radiusXl": "0", "border": "2px", "gutter": "8px", "outlineOn": "none" },
  "colors": { "chrome": "#23272b", "text": "#d8dee3", "dim": "#9aa4ad" },
  "parts": {
    "pane":      { "image": "pane.png",      "mode": "nine", "slice": 6, "scale": 3 },
    "pane-on":   { "image": "pane-on.png",   "mode": "nine", "slice": 6, "scale": 3 },
    "statusbar": { "image": "statusbar.png", "mode": "nine", "slice": [3, 8, 3, 8], "scale": 3, "repeat": "repeat" },
    "sidebar":   { "image": "sidebar.png",   "mode": "tile", "scale": 3 }
  },
  "icons": { "close": "x", "run": ">" }
}
```

A skin is a **difference** from kururu's base: write only what you move. A skin
that moves nothing — no tokens, no parts, no colours — is refused, because it is
the default under another name.

### Parts

The regions of the window a picture can paint, named by what they are to the
person looking rather than by any class name, so kururu can reorganise its
stylesheet under you:

| part | paints |
|---|---|
| `sidebar` | the column of profiles, workspaces and agents |
| `well` | the ground the panes float on, seen in the gutters |
| `pane` | the frame around every terminal and reader |
| `pane-on` | the same frame on the focused pane — empty, it reuses `pane` |
| `tabstrip` | the bar along the top of a pane |
| `tab` | one tab at rest, and the `+` |
| `tab-on` | the selected tab — empty, it reuses `tab` |
| `tool` | the small icon buttons: split, close, run, the cog |
| `button` | the filled buttons in dialogs |
| `row-on` | the selected workspace and agent in the sidebar |
| `panel` | the three boxes in the sidebar: workspaces, agents, dev servers — what keeps the rows readable on a busy sidebar picture |
| `statusbar` | the bar along the bottom |
| `dialog` | every popup: Settings, prompts, menus |

Each part takes one PNG in your directory and a way of applying it:

- **`nine`** (the default) is a nine-slice. The picture's edges become the
  frame and its middle fills the inside, so a bezel, a bevelled button and a HUD
  bar are all this. `slice` is how thick the frame is, in the *picture's own
  pixels* — one number for all four sides or `[top, right, bottom, left]`. It has
  to leave a middle: top plus bottom no more than the picture's height, left
  plus right no more than its width. `repeat` says how the edges and middle fill
  — `stretch`, `repeat` or `round`. A transparent middle lets the theme's
  ground through.
- **`tile`** repeats the picture as a texture over the theme's colour. Draw it
  with transparency and it *tints* the theme rather than replacing it, which is
  the composable choice for anybody who wants grain without picking a colour.
- **`stretch`** fits the picture to the box. A backdrop.

`scale` is picture pixels to screen pixels, a whole number from 1 to 8. Pixel
art is drawn small and shown big — the two skins here are drawn at 1x and shown
at 3x — and a fractional scale is what makes it blur.

**A frame takes room.** A twelve-pixel bezel at 3x is thirty-six pixels of
frame, and the terminal inside the pane shrinks to fit; kururu resizes the pty
to the smaller box. That is the point of a bezel, and it is why `gutter` is a
token: two thick frames three pixels apart read as one slab with a seam.

**A screenshot beside the pictures.** Put a `shot.png` of the window wearing
the skin in your directory. The index carries its name, and the Styles tab
draws the card from it — a skin made of pictures cannot be previewed from
numbers, and a row that only said "Ironclad" would make people install it to
find out what it is.

`node tools/art.mjs` regenerates the pictures for `ironclad` and `handheld`
from code, and is the reference for what each part is: read it to see where a
rivet lands in a status bar, or how a red stripe down the left of a selected
row is one picture with a red left slice.

### Colours

A skin follows the theme unless it says otherwise, and a skin made of pictures
usually has to say otherwise for a few things — text that has to read against
its own bezel. `colors` takes any of the theme's `ui` tokens, as colours, and
overrides them while the skin is on. **Never the terminal's**: an agent's output
is not a skin's to recolour. A skin drawn for a palette ships with that palette
as a pack, which is what `ironclad` and `handheld` do.

### The tokens

`radiusXs` `radiusSm` `radiusMd` `radiusLg` `radiusXl` `radiusRound` ·
`border` `borderThick` `borderStyle` `gutter` `outlineOn` ·
`ui` `fsXs` `fsSm` `fsBase` `fsMd` `fsLg` `fsXl` `uiLineHeight`
`uiLetterSpacing` `uiSmoothing` ·
`frame` `frameOn` `elevDialog` `elevMenu` ·
`imageRendering` `overlay` `overlayOpacity` · `cursor` `cursorPointer`

Every value is a **CSS value as a string**, units and all: `"0"` and `"0px"` are
the same thing and `borderStyle` is not a number at all, so there is no unit
table to be wrong about. A token may reference a picture in your directory as
`url(cursor.png)` — kururu rewrites the name to its own asset URL at install —
and may never reference a URL.

A few are worth knowing about before you start.

**`ui` is a complete `font-family`, not a face to prepend.** A skin declaring what
the window is set in has to declare the fallbacks too, or a pixel face gets latin
and a humanist sans gets everything it does not cover, which is two fonts in one
label.

**The type ramp moves together.** Six steps, and the reason there are six rather
than sixty-two is that what a skin needs is a lever on the whole ramp: a face with
an eight-pixel em is unreadable at the size a humanist sans is comfortable at, so
every size in the window comes down together or none of them should.

**`outlineOn` is the focused pane's ring**, and a skin whose `pane-on` picture
already says which pane you are in sets it to `none`.

**`cursor` and `cursorPointer` are the pointer**, as complete `cursor` values:
`url(arrow.png) 2 2, auto` and `url(hand.png) 6 1, pointer`. A PNG up to 32px.

**`overlay` is painted over the entire window**, above the panes and above the
terminals, by one pointer-events-none layer. It is the old way of making a skin
look like something and the parts are the new one; if you use it, keep
`overlayOpacity` low, because this is on top of somebody's work.

### Icons

`close` `run` `restart` `caret` `add` `edit` `external` `split-right`
`split-down` `settings` `share` `follow` `pin` `panes` — named by the job, not
the shape, so that a skin is free to draw `close` as a pixel-art `X`.

Two ways to draw them. **Glyphs**: write only the ones you mean to change, a
character or two each, in the skin's own face. `null` is meaningful and is not
the same as leaving one out — it is a skin that has *considered* this icon and
kept kururu's. **A strip**: every icon as one picture,

```json
"iconSheet": { "image": "icons.png", "mode": "mask" }
```

fourteen square cells in a row, in the order above. `mask` draws each cell in the
button's text colour, so it follows the theme and lights up on hover; `image`
keeps your colours. A glyph you also name wins over the strip for that icon. The
studio's *Template strip…* button downloads the fourteen built-in drawings as a
strip to draw over.

### Shipping a font

```json
"fonts": [
  { "family": "Space Mono", "file": "space-mono-400.woff2", "weight": "400", "style": "normal" },
  { "family": "Space Mono", "file": "space-mono-700.woff2", "weight": "700", "style": "normal" }
]
```

Put the `.woff2` and its licence (`OFL.txt`) in the same directory. A variable
font is one entry with a range: `"weight": "400 700"`. Prefer woff2 — it is about
half the size of the same face as a ttf, and every asset here is downloaded by
somebody, once, possibly on a phone.

Kururu writes the `@font-face` itself, pointing at its own origin, and always
with `font-display: block`. That is not a preference: this face decides the size
of the chrome, so swapping it in late would reflow every pane a second after the
window settled — and a reflow in kururu resizes the terminals, which hands every
running agent a SIGWINCH.

### Shipping a stylesheet

Only for what the tokens and the parts genuinely cannot express, and scoped:

```css
[data-skin="my-skin"] .tab { text-transform: uppercase; }
```

CI checks the scoping, so two installed skins can never fight over one window,
and refuses `@import` and remote `url()`. A skin built out of tokens and parts
keeps working when kururu renames a class; a stylesheet does not.

---

## A mascot

`mascots/<your-id>/mascot.json` and `sheet.png`.

A mascot is a **rectangle of cells on one sheet**, and two clips cut from it.

```json
{
  "schema": 1,
  "kind": "mascot",
  "id": "my-mascot",
  "name": "My Mascot",
  "version": "1.0.0",
  "description": "What it does while it works, and what it does while it waits.",
  "author": "whoever drew it",
  "licence": "CC0-1.0",
  "source": "https://where-it-came-from",
  "sheet": "sheet.png",
  "frame": 32,
  "trim": { "x": 0, "y": 0, "size": 32 },
  "working": { "row": 1, "col": 0, "count": 8, "cycle": 760 },
  "idle":    { "row": 0, "col": 0, "count": 6, "cycle": 1800 }
}
```

- `frame` is the **square** cell size in pixels. The sheet is a grid of them.
- `trim` is the square inside a cell actually worth drawing. It has to be **one
  box for every frame of both clips**, not each frame's own bounding box — where
  a sprite sits in its cell is how a sheet draws a hop, so trimming each frame
  separately lands them all on the floor, and trimming each *clip* separately
  makes the sprite change size the moment its agent stops.
- `working` is what it does while the agent is going; `idle` is what it does
  while the agent is stopped and nothing is wrong. `cycle` is one full loop in
  milliseconds, not a frame rate.
- `idle` may be `null`, which means a plain dot. Some sheets hold only one
  animation worth having.

Only those two states animate. `blocked` and `done` stay dots on purpose: they
are the two that want a human, and a still dot among moving neighbours is what
makes them stand out.

### Cutting a sheet from an asset pack

Most packs ship one strip per animation, at that animal's own cell width. Kururu
wants a single sheet with a square cell and one clip per row. The five mascots
here were made by taking the idle strip and the walk strip, cropping **every
frame to the union bounding box of both**, and centring that in a square cell —
row 0 idle, row 1 working. The union is the load-bearing part, for the reason
under `trim` above.

Keep it small. Kururu ships an installed sheet to whatever is looking at it,
including a phone; the frog it has always used is fifteen kilobytes, and the
validator refuses anything over a megabyte.

### At 16px

That is how big the badge is in a sidebar row. A tall-ish silhouette reads far
better than a wide one, because a wide sprite in a square badge is letterboxed to
half height. Squint at it before you open the pull request.

---

## A pack

`packs/<your-id>/pack.json`. Three ids and nothing else.

```json
{
  "schema": 1,
  "kind": "pack",
  "id": "my-pack",
  "name": "My Pack",
  "version": "1.0.0",
  "description": "One line on why these three go together.",
  "author": "you",
  "licence": "CC0-1.0",
  "theme": "dungeon",
  "skin": "quest",
  "mascot": "deer"
}
```

All three must already exist in this repository — CI checks. A pack is a
reference and never a copy, so improving one of its parts improves the pack, and
somebody can install the pack and then keep only the mascot.

---

## Changing something that is already here

Bump the `version` in the manifest. **CI will refuse the pull request if you do
not**, because the alternative is silent: kururu compares versions to decide
whether there is an update, so an edit shipped under the old number never reaches
anybody who already installed it.

- **patch** (`1.0.0` → `1.0.1`) — a fix nobody asked for
- **minor** (`1.0.0` → `1.1.0`) — anything somebody would notice
- **major** (`1.0.0` → `2.0.0`) — something moved: a renamed file, a dropped clip

Do not touch `index.json`. It is generated, and CI rebuilds it after the merge —
if you regenerate it in your branch you will conflict with every other open pull
request.

If the style is somebody else's work and they have asked for it to be removed,
open an issue; that is a delete, not a version bump.
