# Shaderera opening film

Folder: `matter`

Two million particles as one body that never cuts: a line drawn by the song, a landscape grown
octave by octave, a city, a black hole, shards, waves, minimal surfaces. Every transition is a
morph, and every change lands on the song's 1/16 grid. Type in the corners reads the film's live
state; near the end the film's own source scrolls past. It closes on the name, in two parts, and
the slogan under it. 46.55 s, 60 fps, WebGPU.

This is Shaderera's opening film. Its defaults are Shaderera's name and slogan.

## Params

| Param | Default | What it sets |
|---|---|---|
| `first` | `SHADER` | the first part of the name, which lands on the last hit |
| `second` | `ERA` | the second part, which lands after the hall goes quiet |
| `slogan` | `The programmable era of ads.` | the line that decodes under the name |

The name is set in capitals and fitted to the frame's width, so a longer name is drawn smaller.

## Variants

- `main`: 1920×1080.
- `reel`: 1080×1920. The same film, framed upright.

```bash
npx shaderera render --variant reel
```

## Where to change things

- `src/clock.ts`: the song's grid (174.3 BPM, where bar 1 falls). Every time in the film is a bar,
  a beat or a 1/16 of this clock.
- `src/score.ts`: the score, which says what happens on each bar: which forms, the camera, the
  morphs, the looks, the cuts in time.
- `src/matter.wgsl`: the particles' compute, every form and how one becomes another.
- `src/post.wgsl`: the screen looks (ascii, dither, halftone, heat, glitch, pixel sort) and the lens.
- `src/track.wgsl`: blob tracking, measured from the frame that was drawn.
- `src/type.ts`: the type layer: the captions on each bar, the corner data, the source wall and
  the slogan.
- `src/gpu.ts`: the buffers and passes that tie it together; `PARTICLES` is the count.

### Another song

The picture reads the song through `audio/final-impact-2-end.analysis.json` (energy in four bands,
every frame). After replacing the song, measure it again:

```bash
node tools/analyze-music.ts audio/<song>.wav audio/<song>.analysis.json
```

Then point `SONG` and `ANALYSIS` in `src/clock.ts` at the new files, and set the new tempo and
first bar there. The film does not hash the song when it opens; `npm run check` (and
`npm run share`) first runs `node tools/check-analysis.ts`, which fails if the analysis was
measured from other bytes than `SONG`. The score is written in this song's bars, so a song with another form
needs the score's bars moved too.

## Assets

- Song: "Final Impact", made with Suno on a paid plan, under Suno's paid plan licence. It is
  **not** MIT: it is here so the film plays as it was made. Use your own song in your film.
- Fonts: IBM Plex Mono Regular and SemiBold, STIX Two Text Italic (SIL OFL 1.1).

Sources and hashes are in [ASSETS.md](ASSETS.md); the records are in `provenance/`.
