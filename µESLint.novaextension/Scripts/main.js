/**
 * @file Main extension script.
 */
const { findInPATH, makeExecutable } = require('./core/binaries')
const cmds = require('./core/commands')
const { ESLint } = require('./core/eslint')
const { changedIssues, filterIssues } = require('./core/issues')

const ext = require('./lib/extension')
const { runAsync } = require('./lib/process')
const { documentIsClosed, documentIsOpenInEditors, getDocumentText } = require('./lib/utils')

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
 * Get the ESLint instance responsible for files in a specified directory.
 * @returns {?object} An ESLint instance, if a valid binary path was found.
 * @param {string} dir - The path to the directory.
 */
async function getLinter (dir) {
  const bin = binaries.which
  const opts = { args: ['eslint'], cwd: dir, shell: true }
  const { code, stderr, stdout } = await runAsync(bin, opts)
  if (stderr.length) console.error(stderr)
  return code === 0 ? new ESLint(stdout.split('\n')[0]) : null
}

/**
 * Launch a lint operation, if possible.
 * @returns {boolean} Whether a lint operation was started.
 * @param {object} editor - The TextEditor to lint.
 */
async function maybeLint (editor) {
  const noIssues = (uri) => {
    if (collection.has(uri)) collection.remove(uri)
    return []
  }

  if (nova.workspace.config.get(configKeys.disabled)) {
    collection.clear()
    return []
  }

  // Do not lint documents we cannot walk the directory hierarchy of;
  // however, we do lint empty documents, in case some rule covers that.
  const doc = editor.document
  const uri = doc.uri
  const path = doc.path
  if (doc.isUntitled || doc.isRemote) return noIssues(uri)

  // Get this early, there can be race conditions.
  const src = getDocumentText(doc)
  if (ESLint.config(path) == null) return noIssues(uri)

  // We need Node (both for npm-which and eslint).
  // To not flood the user’s system with searches, we throttle them
  // (the original `null` timestamp ensures we always do the first pass).
  if (!state.nodeInstall.found && !throttled(state.nodeInstall.lastChecked)) {
    state.nodeInstall.found = await findInPATH('node')
    state.nodeInstall.lastChecked = Date.now()
  }
  if (!state.nodeInstall.found) return noIssues(uri)

  // A `null` ESLint instance should only be present on the very first attempt,
  // or when neither a global nor a local install is found. We always search for
  // a binary in the former case (throttling does not happen on `null` timestamps),
  // but throttle searches in the latter case, so as to not tax the user’s system.
  // We do not throttle a search when the provided binary is not valid, as that can
  // only happen when it has been deinstalled or disabled in the meantime and the
  // first search will either set it to a new valid ESLint instance, or to `null`.
  const dir = nova.path.dirname(path)
  if (linters[dir] == null) linters[dir] = { eslint: null, lastUpdated: null }
  let eslint = linters[dir].eslint
  const throttle = throttled(linters[dir].lastUpdated)
  if ((eslint == null && !throttle) || !eslint.valid) {
    linters[dir].updating = true
    try {
      eslint = await getLinter(dir)
      linters[dir].eslint = eslint
      linters[dir].lastUpdated = Date.now()
    } finally {
      linters[dir].updating = false
    }
  }

  // Asynchronous update check to catch new project-local installs
  // that would otherwise be shadowed by a global ESLint install.
  if (eslint != null && !linters[dir].updating && !throttle) {
    getLinter(dir)
      .then(linter => {
        const update = () => {
          linters[dir].eslint = linter
          linters[dir].lastUpdated = Date.now()
        }
        if ((linter == null) !== (eslint == null)) update()
        if (linter != null && eslint != null && linter.binary !== eslint.binary) update()
      })
      .catch(console.error)
      .finally(_ => { linters[dir].updating = false })
  }

  if (eslint == null) return noIssues(uri)

  // Because lint operations are asynchronous and their duration can
  // vary widely depending on how busy the system is, we need to ensure
  // we respect their start chronology when processing their results
  // (i.e. ensure that slower older runs do not overwrite faster newer ones).
  if (queue[uri] == null) queue[uri] = { lastStarted: 1, lastEnded: 0 }
  const index = queue[uri].lastStarted++
  try {
    const results = await eslint.lint(src, path)
    if (queue[uri].lastEnded < index) {
      queue[uri].lastEnded = index
      if (documentIsClosed(doc)) {
        noIssues(uri)
      } else {
        const issues = filterIssues(results, doc)
        const changed = changedIssues(collection.get(uri), issues)
        if (changed) collection.set(uri, issues)
      }
    }
  } catch (error) {
    noIssues(uri)
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
 * Register TextEditor listeners.
 */
function registerEditorListeners () {
  // There is a race condition where TextEditor destructions while linting
  // lead to zombie issues. We can’t resolve that inside the linting operation,
  // because that always has a valid editor context (and hence an open document).
  nova.workspace.onDidAddTextEditor(added => {
    added.onDidDestroy(destroyed => {
      const doc = destroyed.document
      const uri = doc.uri
      if (documentIsClosed(doc)) {
        if (collection.has(uri)) collection.remove(uri)
      } else {
        maybeLint(documentIsOpenInEditors(doc)[0])
      }
    })
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
    registerCommands()
    registerConfigListeners()
    registerEditorListeners()
    registerAssistant()
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
