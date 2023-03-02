import chalk from 'chalk'
import glob from 'fast-glob'
import globToRegExp from 'glob-to-regexp'
import { isMacOSVersionGreaterThanOrEqualTo } from 'macos-version'

import { getExcludeInfo, question } from '../cli/index.js'
import { read, appendExcludes, save } from '../plist/index.js'
import { config } from '../state/index.js'
import { print } from '../usage.js'
import { restartMDS } from './exec.js'

const {
  excludes: { get: getExcludes, insert, removeOne }
} = config

function finalMessage () {
  isMacOSVersionGreaterThanOrEqualTo('11')
    ? console.log(
      `${chalk.green.bold('Done.')}
    Verify that new directories were added by navigating to System Settings > Siri & Spotlight > Spotlight Privacy`
    )
    : console.log(
      `${chalk.green.bold('Done.')}
    Verify that new directories were added by navigating to System Preferences > Spotlight > Privacy`
    )
}

export async function include (args: string[]): Promise<number> {
  const confirm = !args.includes('--force')
  let excludeName: string
  if (args[0]) {
    excludeName = args[0]
  } else {
    print()
    throw new Error('First Argument Missing!')
  }

  let searchDir: string = process.env.PWD ?? ''
  if (args[1] && args[1] !== '--force') {
    searchDir = args[1]
  }
  if (searchDir.includes('~')) {
    if (!process.env.HOME) { throw new Error('env $HOME undefined.') }
    searchDir.replace('~', process.env.HOME)
  }

  const p = read()

  const copy: string[] = JSON.parse(JSON.stringify(p.Exclusions))
  const newExcludes: string[] = []
  const rming: string[] = []

  const path = `${searchDir}/**/${excludeName}`
  const re = globToRegExp(path)

  for (const exc of copy) {
    if (!re.test(exc)) {
      newExcludes.push(exc)
    } else {
      rming.push(exc)
    }
  }

  p.Exclusions = newExcludes

  for (const r of rming) {
    console.log(r)
  }
  console.log(
    `Found (${rming.length}) excluded dirs that match the expression:`
  )
  console.log(path)

  if (confirm) {
    if ((
      await question('\nRemove all from Spotlight excluded list? (y/N)')
    ).toLowerCase() !== 'y') {
      return 1
    }
  }
  save(p)
  return 0
}
export async function job (args: string[]): Promise<number> {
  const es = await getExcludes()
  for (const { name, base } of es) {
    await exclude([name, base, '--force'])
  }
  return 0
}
export async function add (args: string[]): Promise<number> {
  const toAdd = getExcludeInfo(args)
  await insert(toAdd)

  return 0
}
export async function remove (args: string[]): Promise<number> {
  const ex = getExcludeInfo(args)
  await removeOne(ex)
  return await include(args)
}
export async function list (args: string[]): Promise<number> {
  const es = await getExcludes()
  if (!es.length) {
    console.error('you have 0 list')
  }
  for (const { name, base } of es) {
    const path = `${base}/**/${name}`
    console.log(path)

    if (args.includes('--showPaths')) {
      const r = globToRegExp(path)

      const p = read()

      let pCount = 0
      for (const e of p.Exclusions) {
        if (r.test(e)) {
          console.log(`    ${e}`)
          pCount++
        }
      }
      console.log(`    ---- (${pCount}) matching directories found here. ----`)
    }
  }
  return 0
}

export async function exclude (args: string[]): Promise<number> {
  const confirm = !args.includes('--force')
  let excludeName: string
  if (args[0]) {
    excludeName = args[0]
  } else {
    print()
    throw new Error('First Argument Missing!')
  }

  let searchDir: string = process.env.PWD ?? ''
  if (args[1] && args[1] !== '--force') {
    searchDir = args[1]
  }
  if (searchDir.includes('~')) {
    if (!process.env.HOME) throw new Error('env $HOME undefined.')
    searchDir.replace('~', process.env.HOME)
  }

  const m = await getMatches()
  if (confirm) {
    if ((await question('Confirm (y/N)?')).toLowerCase() !== 'y') {
      return 1
    }
  }
  appendExcludes(m)
  restartMDS()
  finalMessage()
  return 0

  async function getMatches (): Promise<string[]> {
    const dirs = await glob(['**/' + excludeName], {
      ignore: ['**/' + excludeName + '/*/**'],
      onlyDirectories: true,
      cwd: searchDir,
      absolute: true
    })
    if (!dirs.length) {
      console.warn('No match.')
      return []
    }
    for (const d of dirs) {
      console.log(d)
    }
    console.log(
      `\nThese ${dirs.length} directories will be added to Spotlight's excluded dirs list, if not added already.\n`
    )
    return dirs
  }
}
