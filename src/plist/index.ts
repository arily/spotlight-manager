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
export function newList (matches: string[]) {
  const pl = read()
  const newM: string[] = []
  for (const m of matches) {
    if (!pl.Exclusions.includes(m)) {
      newM.push(m)
    }
  }
  if (!newM.length) {
    return null
  }
  console.log('\n\nNew Paths:')
  for (const m of newM) {
    console.log(m)
  }
  console.log(`\n${newM.length} / ${matches.length} paths are not excluded.`)
  const newArr = pl.Exclusions.concat(newM)
  pl.Exclusions = [...new Set(newArr)]
  if (newArr.length !== pl.Exclusions.length) console.error('found duplicates, removed')
  return plist.build(pl)
}

export function concatExcludes (matches: string[]) {
  const rs = newList(matches)
  if (!rs) {
    console.log('No new paths.')
    return false
  } else {
    fs.writeFileSync(PLIST_PATH, rs)
    console.log('Plist updated.')
    return true
  }
}

export function save (p: plist.PlistObject & SpotlightPList) {
  fs.writeFileSync(PLIST_PATH, plist.build(p))
}
