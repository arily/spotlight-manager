import fs from 'fs'
import plist from 'plist'

import { config } from '../state/index.js'

const { spotlightPList } = await config.get()
export const PLIST_PATH = spotlightPList

export interface SpotlightPList {
  Exclusions: string[]
}

export function read () {
  let plFile = ''
  try {
    plFile = fs.readFileSync(PLIST_PATH).toString()
  } catch (e) {
    throw new Error(
      `Unable to read spotlight plist at ${PLIST_PATH}\nAre you sure you are running as sudo ?\nIn future versions of macOS beyond 11.2 (Big Sur) the plist path may have moved.`
    )
  }

  const pl = plist.parse(plFile) as plist.PlistObject & SpotlightPList
  return pl
}

// Returns modified plist
export function newList (matches: string[]): string {
  const pl = read()
  const newM: string[] = []
  for (const m of matches) {
    if (!pl.Exclusions.includes(m)) {
      newM.push(m)
      pl.Exclusions.push(m)
    }
  }

  console.log('\n\nNew Paths:')
  for (const m of newM) {
    console.log(m)
  }
  console.log(`\n${newM.length}/${matches.length} paths are not excluded.`)

  return plist.build(pl)
}

export function appendExcludes (matches: string[]) {
  fs.writeFileSync(PLIST_PATH, newList(matches))
  console.log('Plist updated. Restarting MDS...')
}

export function save (p: plist.PlistObject & SpotlightPList) {
  fs.writeFileSync(PLIST_PATH, plist.build(p))
}
