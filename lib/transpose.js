const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_MAP = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" };

export function parseRoot(chord) {
  const c = String(chord || "").trim();
  const two = c.slice(0, 2);
  if (FLAT_MAP[two]) return { root: FLAT_MAP[two], rest: c.slice(2) };
  if (NOTES.includes(two)) return { root: two, rest: c.slice(2) };
  if (NOTES.includes(c[0])) return { root: c[0], rest: c.slice(1) };
  return null;
}

export function transposeChord(chord, semitones) {
  const parsed = parseRoot(chord);
  if (!parsed) return chord;
  const idx = NOTES.indexOf(parsed.root);
  if (idx < 0) return chord;
  return NOTES[(idx + semitones + 12) % 12] + parsed.rest;
}

export function semitonesBetween(from, to) {
  const a = NOTES.indexOf(from);
  const b = NOTES.indexOf(to);
  if (a === -1 || b === -1) return 0;
  return (b - a + 12) % 12;
}
