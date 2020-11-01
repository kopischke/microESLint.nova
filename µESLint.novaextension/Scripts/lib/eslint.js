/**
 * @file ESLint linter class file.
 */
const { tmpDir } = require('./extension')
const { runAsync } = require('./process')
const { homePath, requireJSON } = require('./utils')

class ESLint {
  /**
   * An ESLint CLI instance.
   * @param {string} binPath - The path to the binary to use.
   * @property {string} binary - The path to the ESLint binary.
   */
  constructor (binPath) {
    const _path = nova.path.normalize(binPath)
    Object.defineProperties(this, { binary: { get: () => _path } })
  }

  /**
   * Check there is an ESLint configuration for a path.
   * Will look upwards through directories until it either finds a configuration
   * file or it reaches the user’s home directory. ESLint configuration file
   * format priorities are respected.
   * @see {@link https://eslint.org/docs/user-guide/configuring#configuration-file-formats}
   * @returns {?string} The path to the ESLint configuration file (if any).
   * @param {string} forPath – The path to check.
   */
  static config (forPath) {
    const home = homePath()
    const legal = [
      '.eslintrc.js',
      '.eslintrc.cjs',
      '.eslintrc.yaml',
      '.eslintrc.yml',
      '.eslintrc.json',
      '.eslintrc.js',
      '.eslintrc',
      'package.json'
    ]

    let dir = nova.path.normalize(forPath)
    if (nova.fs.stat(dir).isFile()) dir = nova.path.dirname(dir)

    do {
      const files = nova.fs.listdir(dir)
      const found = legal.filter(name => files.includes(name))
      if (found.length) {
        const conf = found[0]
        const file = nova.path.join(dir, conf)
        if (conf.startsWith('.eslintrc')) return file
        if (requireJSON(file).eslintConfig) return file
      }
      dir = nova.path.dirname(dir)
    } while (dir !== home)

    return null
  }

  /**
   * Check there is an ESLint ignore file for a path.
   * Will look upwards through directories until it either finds a configuration
   * file or it reaches the user’s home directory.
   * @returns {?string} The path to the ESLint ignore file (if any).
   * @param {string} forPath – The path to check.
   */
  static ignore (forPath) {
    const home = homePath()
    const file = '.eslintignore'

    let dir = nova.path.normalize(forPath)
    if (nova.fs.stat(dir).isFile()) dir = nova.path.dirname(dir)

    do {
      const found = nova.fs.listdir(dir).includes(file)
      if (found.length) return nova.path.join(dir, found[0])
      dir = nova.path.dirname(dir)
    } while (dir !== home)

    return null
  }

  /**
   * Get issues reported by ESLint for a source document.
   * @returns {Promise} Asynchronous issues collection.
   * @param {string} source - The source code to lint.
   * @param {string} path - The file path the source belongs to.
   */
  async lint (source, path) {
    const args = ['-f', 'json', '--stdin', '--stdin-filename', path]

    // Use caching if we can get hold of the temp directory.
    // Failure to do so just slightly degrades performance,
    // so that is not a show stopper.
    try {
      args.push('--cache', '--cache-location', tmpDir())
    } catch (error) {
      console.warn(error)
    }

    const cwd = nova.path.dirname(path) // plugins may fail when this is omitted
    const opts = { args: args, cwd: cwd, shell: false }
    const { code, stderr, stdout } = await runAsync(this.binary, opts, source)
    if (code > 1) {
      const error = new Error(stderr)
      error.name = 'ProcessError'
      throw error
    }

    const issues = []

    if (stdout && stdout.trim().length) {
      JSON.parse(stdout)[0].messages.forEach(message => {
        const issue = new Issue()
        issue.source = nova.extension.name
        issue.message = message.message
        issue.code = message.ruleId
        issue.line = message.line || 0
        issue.column = message.column || 0
        issue.endLine = message.endLine || issue.line
        issue.endColumn = message.endColumn || issue.column
        issue.severity = (message.fatal || message.severity === 2)
          ? IssueSeverity.Error
          : IssueSeverity.Warning

        issues.push(issue)
      })
    }

    return issues
  }
}

exports.ESLint = ESLint
