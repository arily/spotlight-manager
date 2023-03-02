import child_process from 'child_process'

export function restartMDS () {
  child_process.exec(
    'launchctl stop com.apple.metadata.mds',
    (_err, stdout, stderr) => {
      if (stderr) {
        throw new Error(stderr)
      }
      child_process.exec(
        'launchctl start com.apple.metadata.mds',
        (err2, stdout2, stderr2) => {
          if (stderr2) {
            throw new Error(stderr2)
          }

          if (stderr || stderr2) {
            throw new Error(
              'There was an error restarting the com.apple.metadata.mds service, ' +
                'which is required for changes to take effect. Restarting your computer will also restart the service'
            )
          }
        }
      )
    }
  )
}
