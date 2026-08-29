import { transposeChord } from "./transpose";

function isSectionHeader(line) {
  return /^\[.*\]$/.test(String(line || "").trim());
}

function extractChords(line) {
  const re = /[A-Ga-g][#b]?(?:m|maj|min|dim|aug|sus|add)?\d*(?:\/[A-Ga-g][#b]?)?/g;
  return String(line || "").match(re) || [];
}

function isChordLine(line) {
  const words = String(line || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  const chords = extractChords(line);
  return chords.length === words.length && chords.length > 0;
}

export function buildMap(cifraText) {
  const lines = String(cifraText || "").split("\n");
  const sections = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (isSectionHeader(line)) {
      current = { title: line.replace(/[\[\]]/g, ""), chords: [], lyrics: [], lines: [] };
      sections.push(current);
      continue;
    }

    if (!current) {
      current = { title: "Introdução", chords: [], lyrics: [], lines: [] };
      sections.push(current);
    }

    if (isChordLine(line)) {
      current.chords.push(line);
      current.lines.push({ chords: line, lyric: "" });
    } else {
      current.lyrics.push(line);
      current.lines.push({ chords: "", lyric: line });
    }
  }

  return sections;
}

export function transposeMap(sections, semitones) {
  return sections.map((section) => ({
    ...section,
    chords: section.chords.map((line) =>
      line.split(/\s+/).map((chord) => transposeChord(chord, semitones)).join(" ")
    ),
    lines: section.lines.map((line) => ({
      ...line,
      chords: line.chords
        ? line.chords.split(/\s+/).map((chord) => transposeChord(chord, semitones)).join(" ")
        : "",
    })),
  }));
}
