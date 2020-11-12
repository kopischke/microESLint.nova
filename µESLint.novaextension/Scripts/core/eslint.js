/**
 * @file ESLint linter class file.
 */
const { tmpDir } = require('../lib/extension')
const { runAsync } = require('../lib/process')
const { homePath, requireJSON } = require('../lib/utils')

class ESLint {
  /**
   * An ESLint CLI instance.
   * @param {string} binPath - The path to the binary to use.
   * @property {string} binary - The path to the ESLint binary.
   */
  constructor (binPath) {
    const _path = nova.path.normalize(binPath)
    Object.defineProperties(this, {
      binary: { get: () => _path },
      valid: { get: () => nova.fs.access(_path, nova.fs.X_OK) }
    })
  }

  /**
   * Get the ESLint config or ignore file closest to a file path.
   * Will look upwards through directories until it either finds a configuration
   * file or it reaches the user’s home directory.
   * @returns {?string} The path to the ESLint configuration file (if any).
   * @param {string} forPath – The path to check.
   * @param {string|Array.<string>} configFileNames - An ordered set of config file
   * name(s) to look for. The first item in the list that is found will be returned.
   * @param {?string} packageSection - The package.json section to look for. If
   * provided, package.json files are checked automatically (no need to add them
   * to the `configFileNames` list) as the last item.
   * @private
   */
  static _getConfig (forPath, configFileNames, packageSection) {
    const home = homePath()
    const names = [].concat(configFileNames)
    if (packageSection) names.push('package.json')

    const path = nova.path.normalize(forPath)
    let dir = nova.fs.stat(path).isFile() ? nova.path.dirname(path) : path
    if (!dir.startsWith(home)) return null

    do {
      const inDir = nova.fs.listdir(dir).map(name => name.toLowerCase())
      const found = names.find(name => inDir.includes(name))
      if (found) {
        const file = nova.path.join(dir, found)
        if (found !== 'package.json') return file
        if (packageSection) {
          const pkg = requireJSON(file)
          if (pkg != null && typeof pkg === 'object' && packageSection in pkg) {
            return file
          }
        }
      }
      dir = nova.path.dirname(dir)
    } while (dir !== home)

    return null
  }

  /**
   * Find the ESLint configuration file(s) for a path.
   * ESLint configuration file format precedence will be respected.
   * @see {@link https://eslint.org/docs/user-guide/configuring#configuration-file-formats}
   * @returns {?Array.<string>} The paths to the ESLint configuration file (if any).
   * @param {string} forPath – The path to check.
   * @param {boolean} [all=false] - Whether to find all config files in the hierarchy.
   */
  static config (forPath, all) {
    const names = [
      '.eslintrc.js',
      '.eslintrc.cjs',
      '.eslintrc.yaml',
      '.eslintrc.yml',
      '.eslintrc.json',
      '.eslintrc'
    ]

    const files = []
    let found, lastPath
    let path = forPath
    do {
      found = ESLint._getConfig(path, names, 'eslintConfig')
      if (found != null) files.push(found)
      if (!all) break
      lastPath = path
      path = nova.path.dirname(nova.path.dirname(found))
    } while (found != null && path !== lastPath)

    return files.length ? files : null
  }

  /**
   * Find the ESLint ignore file for a path.
   * @returns {?string} The path to the ESLint ignore file (if any).
   * @param {string} forPath – The path to check.
   */
  static ignore (forPath) {
    return ESLint._getConfig(forPath, '.eslintignore', 'eslintIgnore')
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
