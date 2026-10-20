# logo-frames

A logo end card on white: the wordmark over a tagline that parts before its last word. A small
framed picture pops into the gap and changes on every half beat, the gap widens to a row of five,
and the row closes as the line joins again. 6 s, 30 fps.

Made for wallloom (its wordmark, tagline and moulding colours are the defaults); the timing follows
the end of wallloom's opening film, in beats at 100.05 BPM.

## Params

| Param | Default | What it sets |
|---|---|---|
| `wordmark` | `wallloom` | the logo line |
| `before` | `ANY ART, FRAME, SIZE,` | the tagline before the pictures |
| `after` | `ANYWHERE` | the tagline's last word(s), pushed out by the row |

Longer words shrink the type to fit: the widest line, with the row of five open, stays inside
the frame (96% of the width in 16:9, 92% upright).

## Variants

- `main`: 1920×1080.
- `reel`: 1080×1920. The tagline sets on two lines, and the pictures open before the last word.
  Its size fits the widest row to the frame.

```bash
npx shaderera render --variant reel
```

## Where to change things

`src/composition.ts`: `COPY` (the words), `BEATS` (timing), `TYPE` (fonts, sizes, places, the
background), `MOULDINGS` (frame colours) and `PICTURES` (which paintings, in order).

## Assets

- Paintings: public domain from the Art Institute of Chicago (CC0).
- Fonts: DM Sans Light and Regular (SIL OFL 1.1).

Sources and hashes are in [ASSETS.md](ASSETS.md); the records are in `provenance/`.
