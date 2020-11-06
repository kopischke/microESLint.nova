/**
 * @file Main extension script.
 */
const cmds = require('./lib/commands')
const { ESLint } = require('./lib/eslint')
const ext = require('./lib/extension')
const { runAsync } = require('./lib/process')
const { getDocumentText } = require('./lib/utils')

/**
 * ESLint instances to use for linting.
 */
const linters = {}

/**
 * The IssueCollection used. We cannot use the default issue collection
 * provided via the AssistantRegistry because there is no way to void it,
 * e.g. on configuration changes.
 */
const collection = new IssueCollection()

/**
 * Extension state.
 * @property {boolean} activationErrorHandled - Has an activation error been handled already?
 * @property {boolean} nodeInstalled - Is node.js in the user’s path?
 */
const state = { activationErrorHandled: false, nodeInstalled: false }

/**
 * Configuration keys.
 * @property {boolean} disabled - The “Disable ESLint” workspace option.
 * @property {string} binpath - The cached `eslint` binary path.
 */
const configKeys = {
  disabled: `${ext.prefixConfig()}.disable`
}

/**
 * Extension binaries.
 */
const binaries = {
  which: nova.path.join(ext.vendorDir('npm-which'), 'bin', 'npm-which.js')
}

/**
 * Simple queue helping guarantee asynchronous linting chronology.
 * @see {@link maybeLint}
 */
const queue = {}

/**
 * A queue data item.
 * @typedef QueueData
 * @property {number} lastStarted - The index of the last started queue item.
 * @property {number} lastEnded - The index of the last ended queue item.
 */

/**
 * Check that Node.js is installed.
 * We need it both for `npm-which` to work and for ESLint (until someone
 * re-implements it in Rust, or Go, bless their little cotton socks).
 * @returns {boolean} Is Node.js installed in the user’s $PATH?
 */
async function hasNode () {
  if (!state.nodeInstalled) {
    const opts = { args: ['-s', 'node'], shell: true }
    const { code } = await runAsync('which', opts)
    state.nodeInstalled = code === 0
  }

  return state.nodeInstalled
}

/**
 * Get or create an ESLint instance for a config path.
 * @returns {?object} An ESLint instance, if a valid binary path was found.
 * @param {string} config - The path to an ESLint configuration file.
 */
async function getLinter (config) {
  let eslint = linters[config]
  if (eslint == null || !nova.fs.access(eslint, nova.fs.X_OK)) {
    const bin = binaries.which
    const cwd = nova.path.dirname(config)
    const opts = { args: ['eslint'], cwd: cwd, shell: true }

    const { code, stderr, stdout } = await runAsync(bin, opts)

    if (stderr.length) console.error(stderr)
    if (code === 0) eslint = stdout.split('\n')[0]
    linters[config] = eslint ? new ESLint(eslint) : null
  }

  return linters[config]
}

/**
 * Filter out ESLint issues that are not source code issues.
 * @returns {Array.<?object>} An array of {@link Issue} objects.
 * @param {Array.<?object>} issues - The issues to filter.
 * @param {object} document - The {@link TextDocument} the issues apply to.
 */
function filterIssues (issues, document) {
  if (issues.length === 1) {
    const issue = issues[0]

    // Suppress “file ignored” warnings for files that are ignored by default
    // and those that have been configured to be ignored by the user.
    // ESLint returns them as a one-warning result with message contents
    // that have been stable since the warnings have been introduced.
    // @see https://github.com/eslint/eslint/blame/HEAD/lib/cli-engine/cli-engine.js#L292-L298
    if (
      issue.severity === IssueSeverity.Warning &&
      issue.message.match(/^File ignored\b/)
    ) return []

    // Suppress parsing errors from file types not supposed to be linted.
    // Essentially, we weed out fatal parsing errors that stem from non-JS files.
    // This might suppress some plugins’ errors on malformed input.
    if (
      issue.severity === IssueSeverity.Error &&
      issue.code == null &&
      !document.syntax.match(/\bjavascript\b/i)
    ) return []
  }

  return issues
}

/**
 * Launch a lint operation, if possible.
 * Because lint operations are asynchronous and their duration can
 * vary widely depending on how busy the system is, we need to ensure
 * we respect their start chronology when processing their results
 * (i.e. ensure that slower older runs do not overwrite faster newer ones).
 * @returns {boolean} Whether a lint operation was started.
 * @param {object} editor - The TextEditor to lint.
 */
async function maybeLint (editor) {
  if (nova.workspace.config.get(configKeys.disabled)) {
    collection.clear()
    return []
  }

  // Do not lint documents we cannot walk the directory hierarchy of;
  // however, we do lint empty documents, in case some rule covers that.
  const doc = editor.document
  if (doc.isUntitled || doc.isRemote) return []

  // get this early, there can be race conditions
  const src = getDocumentText(doc)
  const uri = doc.uri
  const path = doc.path

  // We need: Node, an ESLint configuration, and an ESLint instance.
  if (!await hasNode()) return []
  const config = ESLint.config(path)
  if (config == null) return []
  const linter = await getLinter(config)
  if (linter == null) return []

  if (queue[uri] == null) queue[uri] = { lastStarted: 1, lastEnded: 0 }
  const index = queue[uri].lastStarted++

  try {
    const results = await linter.lint(src, path)
    // Drop results that ended out of order in the queue.
    if (queue[uri].lastEnded < index) {
      queue[uri].lastEnded = index
      collection.set(uri, filterIssues(results, doc))
    }
  } catch (error) {
    collection.remove(uri)
    console.error(error)
  }

  return []
}

/**
 * Ensure included binaries are executable.
 * @returns {number} The number of `chmod`ed binaries.
 * @throws {Error} When any of the extension binaries cannot be located.
 */
async function chmodBinaries () {
  const binfiles = Object.values(binaries)
  const nonexec = []
  binfiles.forEach(path => {
    if (!nova.fs.access(path, nova.fs.F_OK)) {
      const msg = `Can’t locate extension binaries at path “${path}”.`
      throw new Error(msg)
    }
    if (!nova.fs.access(path, nova.fs.X_OK)) nonexec.push(path)
  })

  if (nonexec.length) {
    const options = { args: ['+x'].concat(nonexec) }
    const results = await runAsync('/bin/chmod', options)
    if (results.code > 0) throw new Error(results.stderr)
  }
  return nonexec.length
}

/**
 * Update the extension configuration.
 */
function updateConfig () {
  const prefix = ext.prefixConfig()
  if (!nova.config.get(`${prefix}.updated.v1.1.0`)) {
    nova.config.remove(`${prefix}.eslint-path`)
    nova.config.set(`${prefix}.updated.v1.1.0`, true)
  }
}

/**
 * Register the ESLint IssueAssistant.
 */
function registerAssistant () {
  const selector = { syntax: '*' }
  const object = { provideIssues: maybeLint }
  nova.assistants.registerIssueAssistant(selector, object)
}

/**
 * Register the extension Commands.
 */
function registerCommands () {
  const prefix = ext.prefixCommand()
  nova.commands.register(`${prefix}.open-config`, cmds.openESLintConfig)
  nova.commands.register(`${prefix}.open-ignore`, cmds.openESLintIgnore)
  nova.commands.register(`${prefix}.workspace-prefs`, _ => {
    nova.workspace.openConfig()
  })
}

/**
 * Register configuration listeners.
 */
function registerConfigListeners () {
  nova.workspace.config.onDidChange(configKeys.disabled, (newValue, oldValue) => {
    if (newValue !== oldValue) nova.workspace.textEditors.forEach(maybeLint)
  })
}

/**
 * Initialise the extension in the workspace.
 * Inform user of errors while activating (once only).
 */
exports.activate = async function () {
  try {
    const chmodding = chmodBinaries()
    updateConfig()
    registerAssistant()
    registerCommands()
    registerConfigListeners()
    await chmodding
  } catch (error) {
    console.error(error)
    if (!nova.inDevMode() && !state.activationErrorHandled) {
      const msg = nova.localize(`${ext.prefixMessage()}.msg.activation-error`)
      nova.workspace.showErrorMessage(msg)
      state.activationErrorHandled = true
    }
  }
}

/**
 * Clean up after the extension.
 */
exports.deactivate = function () {
  collection.clear()
}
