import chalk from 'chalk'
import {
  macOSVersion,
  isMacOSVersion,
  assertMacOSVersionGreaterThanOrEqualTo,
  assertMacOS
} from 'macos-version'

/* pre-requirement checks */
assertMacOS()
// >= Mojave
assertMacOSVersionGreaterThanOrEqualTo('10.14')

const ver = `${isMacOSVersion('<11') ? 'Mac OS X' : 'macOS'} ${macOSVersion() as string}`

console.debug(chalk.green(`passed system requirement checks: ${ver}`))
