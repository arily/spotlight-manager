import '../checks/assert-target-os.js'

import readline from 'readline'

import * as command from '../command/index.js'
import * as usage from '../usage.js'

const rl: readline.Interface = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

export const question = async (query) =>
  await new Promise<string>((resolve, reject) => {
    rl.question(query, (answer) => {
      resolve(answer)
    })
  })

if (process.argv.includes('-h') || process.argv.includes('--help')) {
  usage.print()
  process.exit(0)
}

async function main (): Promise<number> {
  if (!process.argv[2]) {
    usage.print()
    throw new Error('Invalid usage: subcommand missing')
  }
  const subcommand = process.argv[2]
  const args = process.argv.slice(3)
  let exitcode = 1
  switch (subcommand) {
    case 'exclude':
      exitcode = await command.exclude(args)
      break
    case 'include':
      exitcode = await command.include(args)
      break
    case 'add':
      exitcode = await command.add(args)
      break
    case 'remove':
      exitcode = await command.remove(args)
      break
    case 'list':
      exitcode = await command.list(args)
      break
    case 'job':
      exitcode = await command.job(args)
      break
    default:
      usage.print()
      throw new Error('Invalid usage: no such subcommand')
  }
  return exitcode
}

export function getExcludeInfo (args: string[]): { name: string, base: string } {
  let excludeName: string
  if (args[0]) {
    excludeName = args[0]
  } else {
    usage.print()
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

  try {
    process.exit(await main())
  } catch (e) {
    if (!(e instanceof Error)) console.log(e)
    // e is Error
    console.log('')
    console.log(cBright + cFgred + 'Error:')
    console.log(cBright + cFgred + (e as Error).message)
    console.log(cReset)
    process.exit(1)
  }
}
