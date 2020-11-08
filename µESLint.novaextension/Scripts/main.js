/**
 * @file Main extension script.
 */
const { findInPATH, makeExecutable } = require('./core/binaries')
const cmds = require('./core/commands')
const { ESLint } = require('./core/eslint')
const { filterIssues, updateIssues } = require('./core/issues')

const ext = require('./lib/extension')
const { runAsync } = require('./lib/process')
const { getDocumentText } = require('./lib/utils')

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
 * The IssueCollection used. We cannot use the default issue collection
 * provided via the AssistantRegistry because there is no way to void it,
 * e.g. on configuration changes.
 */
const collection = new IssueCollection()

/**
 * Extension state.
 * @property {boolean} activationErrorHandled - Has an activation error been handled already?
 * @property {boolean} nodeInstall - Is node.js in the user’s path?
 */
const state = {
  activationErrorHandled: false,
  nodeInstall: { found: false, lastChecked: null }
}

/**
 * ESLint instances to use for linting.
 */
const linters = {}

/**
 * A queue data item.
 * @typedef QueueData
 * @property {number} lastStarted - The index of the last started queue item.
 * @property {number} lastEnded - The index of the last ended queue item.
 */

/**
 * Simple queue helping guarantee asynchronous linting chronology.
 * @see {@link maybeLint}
 */
const queue = {}

/**
 * Check if we should throttle an operation.
 * @returns {boolean} Whether the operation should be throttled.
 * @param {?number} since - The UNIX timestamp to check the throttling delay for.
 */
function throttled (since) {
  const limit = 60 * 1000 // = 1 min.
  return since != null && Date.now() - since <= limit
}

/**
 * Get or create an ESLint instance for a document path.
 * @returns {?object} An ESLint instance, if a valid config and binary path were found.
 * @param {string} docPath - The path to a document to lint.
 */
async function getLinter (docPath) {
  const config = ESLint.config(docPath)
  if (config == null) return null

  // A `null` ESLint instance should only be present on the very first attempt,
  // or when neither a global nor a local install is found. We always search for
  // a binary in the former case (throttling does not happen on `null` timestamps),
  // but throttle searches in the latter case, so as to not tax the user’s system.
  // We do not throttle a search when the provided binary is not valid, as that can
  // only happen when it has been deinstalled or disabled in the meantime and the
  // first search will either set it to a new valid ESLint instance, or to `null`.
  if (linters[config] == null) linters[config] = { eslint: null, lastUpdated: null }
  let eslint = linters[config].eslint
  const since = linters[config].lastUpdated
  if ((eslint == null && !throttled(since)) || !nova.fs.access(eslint, nova.fs.X_OK)) {
    const bin = binaries.which
    const cwd = nova.path.dirname(config)
    const opts = { args: ['eslint'], cwd: cwd, shell: true }

    const { code, stderr, stdout } = await runAsync(bin, opts)

    if (stderr.length) console.error(stderr)
    eslint = code === 0 ? new ESLint(stdout.split('\n')[0]) : null
    linters[config] = { eslint: eslint, lastUpdated: Date.now() }
  }

  return eslint
}

/**
 * Launch a lint operation, if possible.
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

  // Get this early, there can be race conditions.
  const src = getDocumentText(doc)
  const uri = doc.uri
  const path = doc.path

  // We need Node (both for npm-which and eslint).
  // To not flood the user’s system with searches, we throttle them
  // (the original `null` timestamp ensures we always do the first pass).
  const since = state.nodeInstall.lastChecked
  if (!state.nodeInstall.found && !throttled(since)) {
    state.nodeInstall.found = await findInPATH('node')
    state.nodeInstall.lastChecked = Date.now()
  }
  if (!state.nodeInstall.found) return []

  const linter = await getLinter(path)
  if (linter == null) return []

  // Because lint operations are asynchronous and their duration can
  // vary widely depending on how busy the system is, we need to ensure
  // we respect their start chronology when processing their results
  // (i.e. ensure that slower older runs do not overwrite faster newer ones).
  if (queue[uri] == null) queue[uri] = { lastStarted: 1, lastEnded: 0 }
  const index = queue[uri].lastStarted++
  try {
    const results = await linter.lint(src, path)
    if (queue[uri].lastEnded < index) {
      queue[uri].lastEnded = index
      updateIssues(collection, filterIssues(results, doc), doc)
    }
  } catch (error) {
    updateIssues(collection, null, doc)
    console.error(error)
  }

  return []
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
    await makeExecutable(Object.values(binaries))
    updateConfig()
    registerAssistant()
    registerCommands()
    registerConfigListeners()
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
