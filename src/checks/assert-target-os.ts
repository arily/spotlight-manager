import chalk from 'chalk'
import {
  macOSVersion,
  // isMacOSVersion,
  // isMacOSVersionGreaterThanOrEqualTo,
  // assertMacOSVersion,
  assertMacOSVersionGreaterThanOrEqualTo,
  assertMacOS
  // isMacOS
} from 'macos-version'

/* pre-requirement checks */
// need macos
assertMacOS()
// need macos >= 10.14(Mojave)
assertMacOSVersionGreaterThanOrEqualTo('10.14')

console.debug(chalk.green(`passed system requirement checks: ${macOSVersion() as string}`))
