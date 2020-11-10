/**
 * @file Process management functionality.
 * @version 1.1.0
 * @author Martin Kopischke <martin@kopischke.net>
 * @license MIT
 * @see {@link Process}
 */

/**
 * The result of running an external process.
 * @typedef {object} ProcessResult
 * @property {number} code - The exit code of the process.
 * @property {string} stdout - The process’ stdout output.
 * @property {string} stderr - The process’ stderr output.
 */

/**
 * Run a process with defined options asynchronously.
 * @returns {Promise} Resolves to a {@link ProcessResult}.
 * @param {string} path - The path to the process to run.
 * @param {object} options - The {@link Process} options.
 * @param {string} [stdin] - Stdin input to the process.
 * @throws {Error} When an error occurs at the JS or API level.
 */
exports.runAsync = function (path, options, stdin) {
  return new Promise((resolve, reject) => {
    const stdout = []
    const stderr = []
    try {
      const run = new Process(path, options)
      run.onStdout(line => stdout.push(line))
      run.onStderr(line => stderr.push(line))
      run.onDidExit(code => {
        const result = { code: code, stdout: stdout.join(''), stderr: stderr.join('') }
        resolve(result)
      })

      run.start()

      if (stdin != null && stdin.toString() !== '') {
        const writer = run.stdin.getWriter()
        writer.write(stdin.toString())
        writer.close()
      }
    } catch (error) {
      reject(error)
    }
  })
}
