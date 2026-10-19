import type { Open } from '@shaderera/core'
import { openMatter } from './matter.ts'

// MATTER: two million particles, one body, no cuts; every transition is a morph, cut to the song.
const open: Open = (host) => openMatter(host)
export default open
