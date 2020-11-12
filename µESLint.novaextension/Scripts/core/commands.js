/**
 * @file Core extension commands functionality.
 */
const { ESLint } = require('./eslint')
const { prefixCommand } = require('../lib/extension')
const { runAsync } = require('../lib/process')
const { notify, requireJSON } = require('../lib/utils')

/**
 * Wrap an ESLint file open command so that the user gets notified
 * when no pertinent file can be retrieved.
 * @returns {*} Whatever the wrapped function returns.
 * @param {string} key - The base message localisation ID.
 * @param {Function} wrapped - The opening function to wrap.
 * @private
 */
function _wrapOpenCmd (key, wrapped) {
  return function (path) {
    const notifyAndQuit = msgID => {
      notify(id, nova.localize(msgID))
      return null
    }

    const id = `${prefixCommand()}.open-${key}`
    if (!path) return notifyAndQuit(`${id}.msg.no-path`)

    const files = wrapped(path)
    if (!files) return notifyAndQuit(`${id}.msg.no-match`)
    return files
  }
}

/**
 * Load a YAML file as if it was JSON.
 * @returns {*} The parsed YAML document.
 * @param {string} path - The path to the YAML file.
 * @throws {Error} When a parsing error occurs.
 * @see {@link https://stackoverflow.com/a/46259737}
 */
async function _requireYAML (path) {
  const args = [
    '-ryaml',
    '-rjson',
    '-e', `puts YAML.load_file('${path.replace("'", "\\'")}').to_json`
  ]
  const opts = { args: args, shell: true }
  const { code, stdout, stderr } = await runAsync('ruby', opts)
  if (code > 0) throw new Error(stderr)
  return JSON.parse(stdout)
}

/**
 * Check if the ESLint config file open in an editor has `root` set to `true`.
 * @returns {boolean} Whether the config file is a root file.
 * @param {object} editor - The {@link TextEditor} instance to check.
 * @private
 */
async function _configIsRoot (editor) {
  let config
  try {
    const path = editor.document.path
    switch (editor.document.syntax.toLowerCase()) {
      case 'javascript':
        config = require(path)
        return config != null && typeof config === 'object' && config.root === true

      case 'json':
        config = requireJSON(path)
        if (config == null || typeof config !== 'object') return false
        return nova.path.basename(config).toLowerCase() === 'package.json'
          ? config.eslintConfig && config.eslintConfig.root === true
          : config.root === true

      case 'yaml':
        config = await _requireYAML(path)
        if (config == null || typeof config !== 'object') return false
        return config.root === true

      default:
        return false
    }
  } catch (error) {
    // We really don’t want parsing errors to mess this up…
    console.warn(error)
    return false
  }
}

/**
 * Open the ESLint config file(s) relevant to a document.
 * @param {object} editor - The {@link TextEditor} containing the document.
 * @param {boolean} [wrap=true] - Whether to use {@link _wrapOpenCmd}.
 */
exports.openConfig = async function (editor, wrap) {
  try {
    const path = editor.document.path || nova.workspace.path
    const find = wrap !== false
      ? _wrapOpenCmd('config', ESLint.config)
      : ESLint.config

    let found = find(path)
    if (found && found === path) {
      const isRoot = await _configIsRoot(editor)
      if (!isRoot) {
        const containing = nova.path.dirname(found)
        const lookupDir = nova.path.dirname(containing)
        found = containing !== lookupDir ? find(lookupDir) : null
      }
    }

    if (found) {
      const opened = await nova.workspace.openFile(found)
      const isRoot = await _configIsRoot(opened)
      if (!isRoot) exports.openConfig(opened, false)
    }
  } catch (error) {
    console.error(error)
  }
}

/**
 * Open the ESLint ignore file relevant to a document.
 * @param {object} editor - The {@link TextEditor} containing the document.
 */
exports.openIgnore = async function (editor) {
  const path = editor.document.path || nova.workspace.path
  const file = _wrapOpenCmd('ignore', ESLint.ignore)(path)
  if (file) nova.workspace.openFile(file)
}
