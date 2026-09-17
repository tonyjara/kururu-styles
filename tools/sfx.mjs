/**
 * The noises the packs make, synthesised by code.
 *
 *     node tools/sfx.mjs
 *
 * `sounds/coin`, `sounds/fanfare`, `sounds/anvil`, `sounds/blip` and
 * `sounds/knock` are generated here rather than recorded or downloaded, and the
 * reason is the one `tools/art.mjs` gives for the picture skins: a registry of
 * other people's files needs entries whose files anybody can regenerate, read
 * and change by editing a number. These are those entries.
 *
 * It is also the only honest way to get these particular sounds. **Every one of
 * them is an homage, and an homage is a shape rather than a sample.** A rising
 * two-note blip is what a coin sounds like in every game that has ever had one;
 * an ascending arpeggio is what *you found something* sounds like. Those are
 * idioms, and they are drawn here from a waveform and a frequency table. What is
 * emphatically not here is anybody's recording: this repository is public, it is
 * CC0, and a registry is not the place to find out where the line is. If you
 * want a particular game's actual coin, the answer is that you cannot have it
 * and neither can we.
 *
 * ## Why these are WAVs, and small ones
 *
 * Kururu's `SOUND_FORMATS` is three — wav, mp3, m4a — and deliberately excludes
 * everything it would need a transcoder for, because a registry entry is
 * downloaded to every machine kururu runs on and a Linux box has no `afconvert`.
 * Of the three, WAV is the one a dependency-free script can write, and at the
 * settings below a fifth of a second is under ten kilobytes, which is the same
 * order as the reference frog.
 *
 * **Mono, 22050Hz, 16-bit.** A notification is a blip through a laptop speaker
 * or a phone; stereo doubles the file to say nothing, and 44100 doubles it again
 * to carry harmonics above 11kHz that a square wave at these pitches does not
 * have. Both were tried and neither is audible.
 *
 * ## How loud
 *
 * Each sound's gains are set so its peak lands near where
 * `/System/Library/Sounds` sits, because a set of notification sounds quieter
 * than the machine's own would make kururu's volume slider mean something
 * different from every other one on the desktop. The balance *between* them is
 * deliberate and is not normalised away: the knock is the quietest on purpose,
 * since it is the one somebody picks to be told without being interrupted.
 *
 * Deterministic: the noise generator is seeded, so running this twice writes the
 * same bytes and the digests in `index.json` do not move.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const RATE = 22050;

// ---------------------------------------------------------------------------
// A tiny synthesiser
// ---------------------------------------------------------------------------

/**
 * A buffer of floats, one per sample, which is what everything below adds into.
 *
 * Floats rather than the 16-bit integers that go in the file, because these are
 * *summed*: two notes overlapping is one plus the other, and doing that in the
 * output format means clipping at every intermediate step rather than once at
 * the end.
 */
function track(ms) {
  return new Float64Array(Math.ceil((ms / 1000) * RATE));
}

/** Seeded, so a noise burst is the same noise burst on every machine. See the header. */
function noiseSource(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

/**
 * The three waves, as functions of phase in turns.
 *
 * `square` is the whole of the chiptune sound and is here with a duty cycle,
 * because 12.5% and 50% are audibly different instruments — the thin one is a
 * lead and the fat one is a bass, and a synthesiser with only the fat one makes
 * every sound below into the same sound. `triangle` is the soft one that a
 * fanfare wants so it does not read as an alarm. `sine` is for the body of a
 * knock, where a square would buzz.
 */
const WAVES = {
  square: (phase, duty = 0.5) => (phase % 1 < duty ? 1 : -1),
  triangle: (phase) => {
    const p = phase % 1;
    return p < 0.5 ? p * 4 - 1 : 3 - p * 4;
  },
  sine: (phase) => Math.sin(phase * Math.PI * 2),
};

/**
 * One note, mixed into a track at an offset.
 *
 * The envelope is an attack and an exponential decay and nothing else — no
 * sustain, no release. That is not a simplification, it is what all five of
 * these sounds are: something struck. A sustain stage would be a knob with one
 * setting.
 *
 * `bend` is the pitch sliding over the note's life, in semitones, and it is what
 * separates a blip from a *whoop*. The knock below is a sine bent down fourteen
 * semitones over its own length and almost nothing else.
 */
function note(out, at, { freq, ms, wave = "square", duty = 0.5, gain = 0.5, attack = 2, bend = 0, curve = 5 }) {
  const start = Math.round((at / 1000) * RATE);
  const n = Math.round((ms / 1000) * RATE);
  const rise = Math.max(1, Math.round((attack / 1000) * RATE));
  const shape = WAVES[wave];
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const at = start + i;
    if (at >= out.length) break;
    const t = i / n;
    // The envelope: linear up over the attack so there is no click, then
    // exponential down, which is what a struck thing does and what a linear
    // fade conspicuously does not.
    const env = (i < rise ? i / rise : 1) * Math.exp(-curve * t);
    const hz = freq * Math.pow(2, (bend * t) / 12);
    phase += hz / RATE;
    out[at] += shape(phase, duty) * gain * env;
  }
}

/** A burst of noise: the metal in an anvil and the wood in a knock. */
function hiss(out, at, { ms, gain = 0.3, curve = 20, seed = 1 }) {
  const start = Math.round((at / 1000) * RATE);
  const n = Math.round((ms / 1000) * RATE);
  const next = noiseSource(seed);
  // One-pole low-pass, so the burst is a *thump* or a *tsh* rather than the
  // full-spectrum hiss that reads as a broken speaker at any volume.
  let last = 0;
  for (let i = 0; i < n; i++) {
    const to = start + i;
    if (to >= out.length) break;
    last = last * 0.6 + next() * 0.4;
    out[to] += last * gain * Math.exp((-curve * i) / n);
  }
}

// ---------------------------------------------------------------------------
// WAV
// ---------------------------------------------------------------------------

/**
 * Floats to a RIFF file.
 *
 * The clip is `tanh` rather than a hard clamp: every one of these sums two or
 * three voices and the peaks land above one, and a hard clamp flattens the top
 * of a square wave into a different square wave with an audible crunch on it.
 * `tanh` bends it instead, which is what a soft limiter is.
 */
function encodeWav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    data.writeInt16LE(Math.round(Math.tanh(samples[i]) * 32000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // the size of this chunk: PCM has no extra fields
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28); // bytes per second
  header.writeUInt16LE(2, 32); // bytes per frame
  header.writeUInt16LE(16, 34); // bits
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function write(id, samples) {
  const dir = join(ROOT, "sounds", id);
  mkdirSync(dir, { recursive: true });
  const bytes = encodeWav(samples);
  writeFileSync(join(dir, `${id}.wav`), bytes);
  console.log(`  sounds/${id}/${id}.wav  ${(samples.length / RATE).toFixed(2)}s  ${(bytes.length / 1024).toFixed(1)}KB`);
}

/** Equal temperament from A4, so the tables below can be written as note names. */
const A4 = 440;
const STEPS = { C: -9, "C#": -8, D: -7, "D#": -6, E: -5, F: -4, "F#": -3, G: -2, "G#": -1, A: 0, "A#": 1, B: 2 };
function hz(name) {
  const m = /^([A-G]#?)(\d)$/.exec(name);
  return A4 * Math.pow(2, STEPS[m[1]] / 12 + (Number(m[2]) - 4));
}

// ---------------------------------------------------------------------------
// Coin — World 1-1
// ---------------------------------------------------------------------------

/**
 * Two notes, up a perfect fifth, the second one held.
 *
 * This is the coin idiom and it is entirely in the interval: a short note, a
 * higher one four times as long, both on a thin square. The pitches here are B5
 * and F#6 — a fifth rather than the minor seventh the most famous version uses,
 * which is a deliberate step away from quoting it and also, to my ear, brighter.
 */
function coin() {
  const out = track(420);
  note(out, 0, { freq: hz("B5"), ms: 70, duty: 0.25, gain: 0.85, curve: 1 });
  note(out, 70, { freq: hz("F#6"), ms: 330, duty: 0.25, gain: 0.85, curve: 4 });
  return out;
}

// ---------------------------------------------------------------------------
// Fanfare — Quest
// ---------------------------------------------------------------------------

/**
 * *You found something.* An ascending major arpeggio, four notes, ending on the
 * octave and held.
 *
 * A major triad is not anybody's melody — it is the first thing a person plays
 * on a new instrument — and that is precisely why it is what is here. The famous
 * secret-discovered jingles are specific sequences with specific owners; the
 * *feeling* is "the notes went up and stopped on a nice one", which this is.
 *
 * Triangle under square: the square carries the tune and the triangle gives it a
 * body, which is the difference between a fanfare and a fire alarm.
 */
function fanfare() {
  const out = track(900);
  const tune = ["C5", "E5", "G5", "C6"];
  tune.forEach((name, i) => {
    const at = i * 90;
    const long = i === tune.length - 1;
    note(out, at, { freq: hz(name), ms: long ? 520 : 110, duty: 0.5, gain: 0.5, curve: long ? 3.4 : 2 });
    note(out, at, { freq: hz(name) / 2, ms: long ? 520 : 110, wave: "triangle", gain: 0.32, curve: long ? 3.4 : 2 });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Anvil — Ironclad
// ---------------------------------------------------------------------------

/**
 * Struck steel: a noise transient, two inharmonic partials that ring on, and a
 * low thud underneath.
 *
 * The partials are the whole trick. A metal bar's overtones are *not* whole
 * multiples of its fundamental, which is why a bell does not sound like a
 * trumpet — so these are at 2.76 and 5.4 times, which are roughly a real bar's
 * first two, and they are sines because a square at those frequencies is a
 * fistful of aliasing at 22kHz.
 */
function anvil() {
  const out = track(700);
  hiss(out, 0, { ms: 90, gain: 0.5, curve: 26, seed: 0x5eed });
  const f = 300;
  note(out, 0, { freq: f, ms: 180, wave: "sine", gain: 0.6, attack: 1, curve: 14 });
  note(out, 0, { freq: f * 2.76, ms: 620, wave: "sine", gain: 0.34, attack: 1, curve: 5 });
  note(out, 0, { freq: f * 5.4, ms: 480, wave: "sine", gain: 0.2, attack: 1, curve: 7 });
  return out;
}

// ---------------------------------------------------------------------------
// Blip — Handheld
// ---------------------------------------------------------------------------

/**
 * The noise a menu makes: two short square notes, the second lower, over in a
 * fifth of a second.
 *
 * The narrow duty cycle is doing the period work here. A 50% square is a round
 * flute of a thing; 12.5% is the reedy, slightly rude tone a four-channel sound
 * chip makes, and it is what makes this read as *a device* rather than as a
 * synthesiser being polite.
 */
function blip() {
  const out = track(220);
  note(out, 0, { freq: hz("E6"), ms: 60, duty: 0.125, gain: 0.85, curve: 3 });
  note(out, 62, { freq: hz("B5"), ms: 140, duty: 0.125, gain: 0.85, curve: 5 });
  return out;
}

// ---------------------------------------------------------------------------
// Knock — Cobble
// ---------------------------------------------------------------------------

/**
 * A block put down: a filtered thump with the pitch falling out from under it.
 *
 * The bend is the whole sound — minus fourteen semitones over eighty
 * milliseconds is a sine that starts as a note and lands as a thud, which is
 * what every percussive *place* sound in every block game is doing. Noise over
 * the top for the grit, and nothing else; this one wants to be the quietest in
 * the set, because it is the one a person picks when they want to be told
 * without being interrupted.
 */
function knock() {
  const out = track(260);
  note(out, 0, { freq: hz("A3"), ms: 130, wave: "sine", gain: 0.82, attack: 1, bend: -14, curve: 9 });
  hiss(out, 0, { ms: 55, gain: 0.28, curve: 30, seed: 0xc0b8 });
  return out;
}

// ---------------------------------------------------------------------------

console.log("sounds:");
write("coin", coin());
write("fanfare", fanfare());
write("anvil", anvil());
write("blip", blip());
write("knock", knock());
