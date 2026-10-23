// The song's grid. audio/final-impact-2-end.wav (the owner's Suno song, whole, with the hall
// tools/cut-song.ts gives its ending) is 174.3 BPM. The film starts two bars in, so the song's bar 3
// is at 0.446 s; bars keep the song's numbers.
// The picture asks this clock for every time it uses.

export const SONG = 'audio/final-impact-2-end.wav'
/** The song measured by tools/analyze-music.ts; tools/check-analysis.ts checks it is of SONG's bytes. */
export const ANALYSIS = 'audio/final-impact-2-end.analysis.json'
export const FPS = 60
export const DURATION = 46.55
export const BPM = 174.3
export const BEAT = 60 / BPM
export const BAR = 4 * BEAT
export const SIXTEENTH = BEAT / 4
export const BAR1 = 0.4462 - 2 * BAR

/** Time of bar n (1-based), plus beats and sixteenths into it. */
export const bar = (n: number, beat = 0, sixteenth = 0) => BAR1 + (n - 1) * BAR + beat * BEAT + sixteenth * SIXTEENTH

/** Index of the 1/16 that t falls in (0 at bar 1), and the time since it began. */
export const sixteenthAt = (t: number) => Math.floor((t - BAR1) / SIXTEENTH)
export const sinceSixteenth = (t: number) => t - (BAR1 + sixteenthAt(t) * SIXTEENTH)

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
