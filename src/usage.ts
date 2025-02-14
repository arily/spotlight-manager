import chalk from 'chalk'

export const USAGE = `
spotlight-manager <SUBCOMMAND> [<subcommand_args...>] [flags]

SUBCOMMANDS:

    ${chalk.bold('exclude')}         <DIRNAME_TO_EXCLUDE> <SEARCH_DIR (optional)> [--force]
                    Add all matching dirs to spotlight's exclusions.
        
        <DIRNAME_TO_EXCLUDE>    Name of directory you want to exclude.
        <SEARCH_DIR>            The directory in which to recursively search.
                                (optional): Will use cwd by default.
        --force                 Do not ask for confirmation, useful for 
                                calling from another script.

    ${chalk.bold('include')}        <DIRNAME_TO_INCLUDE> <SEARCH_DIR (optional)> [--force]
                    Remove excluded dirs matching these rules from spotlight's 
                    exclusions. (re-enable indexing of this directory)

    ${chalk.bold('job')}             Search for any new exclusions that match saved 
                    exclusion rules and exclude all at once. (use for cron job)
                        <!> NOTE: job can only exclude new exclusions. <!> 
                    This prevents unrelated exclusions from being affected.

    ${chalk.bold('add')}             <DIRNAME_TO_EXCLUDE> <SEARCH_DIR (optional)> [--force]
                    Add exclusion rule to be checked by job, and run job once.

    ${chalk.bold('remove')}          <DIRNAME_TO_EXCLUDE> <SEARCH_DIR> [--force]
                    Remove exclusion rule checked by job, and run !! unexclude !!
                    NOT job because job does not remove exclusions.
                    <!> Assumes matching exclusions were all added by manager <!>

    ${chalk.bold('list')}            [--showPaths] 
                    List all added exclude rules. (Only lists rules added via 
                    <add>. Rules added directly via <exclude> subcommand
                    are not tracked.)
        --showPaths             Print all added exclude rules and all 
                                actual paths the rule matches that are
                                excluded in the plist.

FLAGS:
    -h | --help     Print this page.
`
export function print () { console.log(USAGE) }
