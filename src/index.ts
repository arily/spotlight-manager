import './checks/assert-target-os.js'

import readline from 'readline'
import plist from 'plist'
import glob from 'fast-glob'
import fs from 'fs'
import child_process from 'child_process'
import globToRegExp from 'glob-to-regexp'

import { USAGE } from './usage.js'

import { isMacOSVersionGreaterThanOrEqualTo } from 'macos-version'

import { createContext } from './config/index.js'
const config = createContext()

const { excludes: { get: getExcludes, insert, removeOne } } = config

interface SpotlightPList { Exclusions: string[] }
const { spotlightPList } = await config.get()
const PLIST_PATH = spotlightPList
const rl: readline.Interface = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const question = async (query) => await new Promise<string>((resolve, reject) => { rl.question(query, (answer) => { resolve(answer) }) })

if (process.argv.includes('-h') || process.argv.includes('--help')) {
  console.log(USAGE)
  process.exit(0)
}

async function main (): Promise<number> {
  if (!process.argv[2]) {
    console.log(USAGE)
    throw new Error('Invalid usage: subcommand missing')
  }
  const subcommand = process.argv[2]
  const args = process.argv.slice(3)
  let exitcode = 1
  switch (subcommand) {
    case 'exclude':
      exitcode = await cmdExclude(args)
      break
    case 'unexclude':
      exitcode = await cmdInclude(args)
      break
    case 'add':
      exitcode = await cmdAdd(args)
      break
    case 'remove':
      exitcode = await cmdRemove(args)
      break
    case 'list':
      exitcode = await cmdList(args)
      break
    case 'job':
      exitcode = await cmdJob(args)
      break
    default:
      console.log(USAGE)
      throw new Error('Invalid usage: no such subcommand')
  }
  return exitcode
}

async function cmdExclude (args: string[]): Promise<number> {
  const confirm = !args.includes('--force')
  let excludeName: string
  if (args[0]) {
    excludeName = args[0]
  } else {
    console.log(USAGE)
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
    if ((await question('Confirm (y/N)?')).toLowerCase() !== 'y') { return 1 }
  }
  const plF = generateNewPlist(m)
  writePlist(plF)
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
    for (const d of dirs) { console.log(d) }
    console.log(`\nThese (${dirs.length}) directories will be added to Spotlight's excluded dirs list, if not added already.\n`)
    return dirs
  }

  // Returns modified plist
  function generateNewPlist (matches: string[]): string {
    let plFile = ''
    try { plFile = fs.readFileSync(PLIST_PATH).toString() } catch (e) {
      throw new Error('Unable to read spotlight plist at ' + PLIST_PATH + '\nAre you sure you are running as sudo ?\n' +
                'In future versions of macOS beyond 11.2 (Big Sur) the plist path may have moved.')
    }

    const pl = plist.parse(plFile) as plist.PlistObject & SpotlightPList

    const newM: string[] = []
    for (const m of matches) {
      if (!pl.Exclusions.includes(m)) {
        newM.push(m)
        pl.Exclusions.push(m)
      }
    }

    console.log('\n\nNew Paths:')
    for (const m of newM) { console.log(m) }
    console.log(`\n${newM.length}/${matches.length} paths are not excluded.`)

    return plist.build(pl)
  }

  function writePlist (f: string) {
    fs.writeFileSync(PLIST_PATH, f)
    console.log('Plist updated. Restarting MDS...')
  }

  function restartMDS () {
    child_process.exec('launchctl stop com.apple.metadata.mds', (_err, stdout, stderr) => {
      if (stderr) { throw new Error(stderr) }
      child_process.exec('launchctl start com.apple.metadata.mds', (err2, stdout2, stderr2) => {
        if (stderr2) { throw new Error(stderr2) }

        if (stderr || stderr2) {
          throw new Error('There was an error restarting the com.apple.metadata.mds service, ' +
                        'which is required for changes to take effect. Restarting your computer will also restart the service')
        }
      })
    })
  }

  function finalMessage () {
    isMacOSVersionGreaterThanOrEqualTo('11')
      ? console.log('\nDone. Verify that new directories were added by navigating to System Settings > Siri & Spotlight > Spotlight Privacy')
      : console.log('\nDone. Verify that new directories were added by navigating to System Preferences > Spotlight > Privacy')
  }
}

async function cmdInclude (args: string[]): Promise<number> {
  const confirm = !args.includes('--force')
  let excludeName: string
  if (args[0]) {
    excludeName = args[0]
  } else {
    console.log(USAGE)
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

  let plf: string
  try { plf = fs.readFileSync(PLIST_PATH, 'utf-8') } catch (e) {
    throw new Error('Unable to read spotlight plist at ' + PLIST_PATH + '\nAre you sure you are running as sudo ?\n' +
            'In future versions of macOS beyond 11.2 (Big Sur) the plist path may have moved.')
  }

  const p = plist.parse(plf) as plist.PlistObject & SpotlightPList

  const excscopy: string[] = JSON.parse(JSON.stringify(p.Exclusions))
  const newexcs: string[] = []
  const rming: string[] = []
  const re = globToRegExp(searchDir + '/**/' + excludeName)

  for (const exc of excscopy) {
    if (!re.test(exc)) {
      newexcs.push(exc)
    } else {
      rming.push(exc)
    }
  }

  p.Exclusions = newexcs

  for (const r of rming) { console.log(r) }
  console.log(`Found (${rming.length}) excluded dirs that match the expression:`)
  console.log(searchDir + '/**/' + excludeName)

  if (confirm) {
    if ((await question('\nRemove all from Spotlight excluded list? (y/N)')).toLowerCase() !== 'y') { return 1 }
  }
  fs.writeFileSync(PLIST_PATH, plist.build(p))
  return 0
}

async function cmdJob (args: string[]): Promise<number> {
  const es = await getExcludes()
  for (const { name, base } of es) {
    await cmdExclude([name, base, '--force'])
  }
  return 0
}

async function cmdAdd (args: string[]): Promise<number> {
  const toAdd = getExcludeInfo(args)
  await insert(toAdd)

  return 0
}

async function cmdRemove (args: string[]): Promise<number> {
  const ex = getExcludeInfo(args)
  await removeOne(ex)
  return await cmdInclude(args)
}

async function cmdList (args: string[]): Promise<number> {
  const es = await getExcludes()
  if (!es.length) {
    console.error('you have 0 list')
  }
  for (const { name, base } of es) {
    console.log(`Searching for ${name} inside of: ${base}`)

    if (args.includes('--showPaths')) {
      const r = globToRegExp(base + '/**/' + name)
      let plistStr: string
      try {
        plistStr = fs.readFileSync(PLIST_PATH, 'utf-8')
      } catch (e) { throw new Error('Could not read Spotlight plist. You may need to run this command using sudo.') }
      const p = plist.parse(plistStr.toString()) as plist.PlistObject & SpotlightPList
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

function getExcludeInfo (args: string[]): { name: string, base: string } {
  let excludeName: string
  if (args[0]) {
    excludeName = args[0]
  } else {
    console.log(USAGE)
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

  while (searchDir.endsWith('/')) {
    searchDir = searchDir.substring(0, searchDir.length - 1)
  }
  while (excludeName.endsWith('/')) {
    excludeName = excludeName.substring(0, excludeName.length - 1)
  }
  while (excludeName.startsWith('/')) {
    excludeName = excludeName.substring(1)
  }
  searchDir = searchDir.replace('//', '/')
  excludeName = excludeName.replace('//', '/')

  const out = { name: excludeName, base: searchDir }
  return out
}

export async function errLaunch () {
  const cFgred = '\x1b[31m'
  const cBright = '\x1b[1m'
  const cReset = '\x1b[0m'

  try { process.exit(await main()) } catch (e) {
    if (!(e instanceof Error)) console.log(e)
    // e is Error
    console.log('')
    console.log(cBright + cFgred + 'Error:')
    console.log(cBright + cFgred + (e as Error).message)
    console.log(cReset)
    process.exit(1)
  }
}
