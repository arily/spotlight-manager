#!/usr/bin/env node

import readline from 'readline'
import plist, { PlistObject } from 'plist'
import glob from 'fast-glob'
import fs from 'fs'
import child_process from 'child_process'
import globToRegExp from 'glob-to-regexp'
import { promisify } from 'util'
import { join } from 'path'

const PLIST_PATH = '/System/Volumes/Data/.Spotlight-V100/VolumeConfiguration.plist'
const USAGE = `
SPOTLIGHT MANAGER:

spotlight-manager <SUBCOMMAND> [<subcommand_args...>] [flags]

SUBCOMMANDS:

    exclude         <DIRNAME_TO_EXCLUDE> <SEARCH_DIR (optional)> [--force]
                    Add all matching dirs to spotlight's exclusions.
        
        <DIRNAME_TO_EXCLUDE>    Name of directory you want to exclude.

        <SEARCH_DIR>            The directory in which to recursively search.
                                (optional): Will use cwd by default.

        --force                 Do not ask for confirmation, useful for 
                                calling from another script.

    unexclude       <DIRNAME_TO_UNEXCLUDE> <SEARCH_DIR (optional)> [--force]
                    Remove excluded dirs matching these rules from spotlight's 
                    exclusions. (renable indexing of this directory)
    job   
                    Search for any new exclusions that match saved 
                    exclusion rules and exclude all at once. (use for cron job)
                        <!> NOTE: job can only exclude new exclusions. <!> 
                    This prevents unrelated exclusions from being affected.

    add             <DIRNAME_TO_EXCLUDE> <SEARCH_DIR (optional)> [--force]
                    Add exclusion rule to be checked by job, and run job once.

    remove          <DIRNAME_TO_EXCLUDE> <SEARCH_DIR> [--force]
                    Remove exclusion rule checked by job, and run !! unexclude !!
                    NOT job because job does not remove exclusions.
                    <!> Assumes matching exclusions were all added by manager <!>

    list            [--showPaths] 
                    List all added exclude rules. (Only lists rules added via 
                    <add>. Rules added directly via <exclude> subcommand
                    are not tracked.)

        --showPaths             Print all added exclude rules and all 
                                actual paths the rule matches that are
                                excluded in the plist.

FLAGS:

    -h | --help     Print this page.
`

const rl: readline.Interface = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})
function rlqConvert (query: string, cb: (er: Error | null, response: string) => void) {
  rl.question(query, (ans) => {
    cb(null, ans)
  })
}
const question = promisify(rlqConvert)

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

    const pl = plist.parse(plFile)

    const newM: string[] = []
    for (const m of matches) {
      if (!pl.Exclusions.includes(m)) {
        newM.push(m)
        pl.Exclusions.push(m)
      }
    }

    console.log('\n\nNew Paths:')
    for (const m of newM) { console.log(m) }
    console.log(`\n${newM.length}/${matches.length} paths are not already excluded.`)

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
    console.log('\nDone. Verify that new directories were added by navigating to System Preferences > Spotlight > Privacy')
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

  let plf
  try { plf = fs.readFileSync(PLIST_PATH) } catch (e) {
    throw new Error('Unable to read spotlight plist at ' + PLIST_PATH + '\nAre you sure you are running as sudo ?\n' +
            'In future versions of macOS beyond 11.2 (Big Sur) the plist path may have moved.')
  }

  const p = plist.parse(plf.toString())

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
    if ((await question('\nRemove all from Spotlight excluded list? (y/N)')).toLowerCase() != 'y') { return 1 }
  }
  fs.writeFileSync(PLIST_PATH, plist.build(p))
  return 0
}

async function cmdJob (args: string[]): Promise<number> {
  const es = getExcludes()
  for (const e of es) {
    if (e.length < 1) { continue }
    const name = e.split(' ~~~ ')[0]
    const base = e.split(' ~~~ ')[1]
    await cmdExclude([name, base, '--force'])
  }
  return 0
}

async function cmdAdd (args: string[]): Promise<number> {
  const toAdd = getExcludeInfo(args)
  const line = toAdd.name + ' ~~~ ' + toAdd.base
  const es = getExcludes()
  if (es.includes(line)) { throw new Error('This rule already exists in the excludes file.') }
  es.push(line)
  setExcludes(es)
  return await cmdJob([])
}

async function cmdRemove (args: string[]): Promise<number> {
  const ex = getExcludeInfo(args)
  const line = ex.name + ' ~~~ ' + ex.base
  const es = getExcludes()
  const newList: string[] = []
  for (const e of es) {
    if (e.length < 1) { continue }
    if (e !== line) {
      newList.push(e)
    }
  }
  setExcludes(newList)
  return await cmdInclude(args)
}

async function cmdList (args: string[]): Promise<number> {
  const es = getExcludes()
  for (const l of es) {
    if (l.length < 1) { continue }

    const nm = l.split(' ~~~ ')[0]
    const bs = l.split(' ~~~ ')[1]

    const secondStr = l.replace(' ~~~ ', ' inside of: ')
    console.log('Searching for ' + secondStr)

    if (args.includes('--showPaths')) {
      const r = globToRegExp(bs + '/**/' + nm)
      let plistStr: string
      try {
        plistStr = fs.readFileSync(PLIST_PATH, 'utf-8')
      } catch (e) { throw new Error('Could not read Spotlight plist. You may need to run this command using sudo.') }
      const p = plist.parse(plistStr.toString())
      let pcount = 0
      for (const e of p.Exclusions) {
        if (r.test(e)) {
          console.log(`    ${e}`)
          pcount++
        }
      }
      console.log(`    ---- (${pcount}) matching directories found here. ----`)
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

const fname = '.spotlight-manager'
if (!process.env.HOME) throw new Error('$HOME undefined')
const dfPath = join(process.env.HOME, fname)

function getExcludes (): string[] {
  if (!fs.existsSync(dfPath)) { fs.writeFileSync(dfPath, '') }
  const dotFs = fs.readFileSync(dfPath).toString().split('\n')
  return dotFs
}

function setExcludes (excludes: string[]) {
  let s = ''
  for (const e of excludes) {
    s += e + '\n'
  }
  fs.writeFileSync(dfPath, s)
}

async function errLaunch () {
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

void errLaunch()
