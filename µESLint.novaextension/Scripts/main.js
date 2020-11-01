/**
 * @file Main extension script.
 */
const cmds = require('./lib/commands')
const { ESLint } = require('./lib/eslint')
const { prefixCommand, prefixConfig, prefixMessage } = require('./lib/extension')
const { runAsync } = require('./lib/process')
const { getDocumentText } = require('./lib/utils')

/**
 * ESLint instance to use for linting.
 */
let linter = null

/**
 * The IssueCollection used. We cannot use the default issue collection
 * provided via the AssistantRegistry because there is no way to void it,
 * e.g. on configuration changes.
 */
const collection = new IssueCollection()

/**
 * Extension notifications.
 */
const notifications = {
  'activation-error': { fallback: 'ESLint not found', level: 'error', fired: false },
  'no-linter': { fallback: 'Activation error', level: 'warning', fired: false }
}

/**
 * Configuration keys.
 * @property {boolean} disabled - The “Disable ESLint” workspace option.
 * @property {string} binpath - The cached `eslint` binary path.
 */
const configKeys = {
  disabled: `${prefixConfig()}.disable`,
  binpath: `${prefixConfig()}.eslint-path`
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
 * Create an ESLint instance with a confirmed binary path.
 * @returns {?object} An ESLint instance, if a valid binary path was found.
 */
async function makeLinter () {
  let eslint = nova.config.get(configKeys.binpath)
  if (eslint == null || !nova.fs.access(eslint, nova.fs.X_OK)) {
    eslint = null

    const opts = { args: ['eslint'], shell: true }
    const { code, stderr, stdout } = await runAsync('which', opts)
    if (stderr.length) console.error(stderr)
    if (code === 0) eslint = stdout.split('\n')[0]

    nova.config.set(configKeys.binpath, eslint)
  }

  linter = eslint ? new ESLint(eslint) : null
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
function maybeLint (editor) {
  if (nova.workspace.config.get(configKeys.disabled)) {
    collection.clear()
    return []
  }

  // Do not lint documents we cannot walk the directory hierarchy of;
  // however, we do lint empty documents, in case some rule covers that.
  const doc = editor.document
  if (doc.isUntitled || doc.isRemote) return []

  if (linter == null) {
    makeLinter()
      .then(_ => { if (linter) return maybeLint(editor) })
      .catch(console.error)
    return []
  }

  const uri = doc.uri
  const path = doc.path

  if (ESLint.config(path) != null) {
    if (queue[uri] == null) queue[uri] = { lastStarted: 1, lastEnded: 0 }
    const index = queue[uri].lastStarted++

    return linter.lint(getDocumentText(doc), path)
      .then(results => {
        if (queue[uri].lastEnded < index) {
          queue[uri].lastEnded = index
          collection.set(uri, filterIssues(results, doc))
        }
      })
      .catch(error => {
        console.error(error)
        collection.remove(uri)
        makeLinter()
      })
      .finally(function () { return [] })
  }
}

/**
 * Notify the user just once.
 * @param {string} key - The key of the notification to fire.
 */
function notifyOnce (key) {
  const notif = notifications[key]
  if (!notif.fired) {
    const msg = nova.localize(`${prefixMessage()}.${key}`, notif.fallback)
    switch (notif.level) {
      case 'error':
        nova.workspace.showErrorMessage(msg)
        break
      case 'warning':
        nova.workspace.showWarningMessage(msg)
        break
      default:
        nova.workspace.showInformativeMessage(msg)
    }
    notif.fired = true
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
  const prefix = prefixCommand()
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
exports.activate = function () {
  try {
    makeLinter()
      .then(_ => { if (!linter) notifyOnce('no-linter') })
      .catch(console.error)
    registerAssistant()
    registerCommands()
    registerConfigListeners()
  } catch (error) {
    console.error(error)
    if (!nova.inDevMode()) notifyOnce('activation-error')
  }
}
