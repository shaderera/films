# Shaderera films

Official films made with [Shaderera](https://github.com/shaderera/shaderera), each one a complete
project you can fork: the film is `render(t)` in code, with its params, fonts, pictures and their
licences beside it.

## Films

| Film | Category | Length | Ratios |
|---|---|---|---|
| [logo-frames](logo-frames/) | Logo reveal | 6 s | 16:9, 9:16 |
| [matter](matter/) | Title | 46.55 s | 16:9, 9:16 |

## Fork a film

Node.js 24 and ffmpeg are needed (`npx shaderera doctor` says what is missing).

```bash
git clone https://github.com/shaderera/films
cd films/logo-frames
npm install
npx shaderera check                 # the same t gives the same frame
npx shaderera still 0 3.4 --sheet   # stills, in out/stills/
npx shaderera render                # the film, in out/
```

Each film's `README.md` lists its params and variants; its `ASSETS.md` lists every outside file
with its source and licence.

## Licences

The code is MIT ([LICENSE](LICENSE)). Fonts, pictures and sound keep their own licences, listed in
each film's `ASSETS.md`. Names and logos shown as film defaults (such as "wallloom") are their
owners' marks; the MIT licence does not grant them. Change them with the film's params.

Some films carry a song that is not MIT (MATTER's "Final Impact" is Shaderera's own); its
`ASSETS.md` says so. Use your own song in your film.
