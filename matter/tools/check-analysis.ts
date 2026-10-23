// Checks that the analysis the film reads was measured from the song it plays: node tools/check-analysis.ts
// The film does not hash the song when it opens (every viewer would download it first), so this runs
// in `npm run check` and before `npm run share`. Exits 1 on a mismatch.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { ANALYSIS, SONG } from '../src/clock.ts'

const root = new URL('..', import.meta.url)
const analysis = JSON.parse(readFileSync(new URL(ANALYSIS, root), 'utf8'))
const sha256 = createHash('sha256').update(readFileSync(new URL(SONG, root))).digest('hex')
if (analysis.of?.sha256 !== sha256) {
  console.error(`${ANALYSIS} was measured from other bytes than ${SONG}; run node tools/analyze-music.ts ${SONG} ${ANALYSIS}`)
  process.exit(1)
}
console.log(`${ANALYSIS} is of ${SONG} (sha256 ${sha256.slice(0, 12)})`)
