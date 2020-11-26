/**
 * @file Main extension script.
 */
const { findInPATH, makeExecutable } = require('./core/binaries')
const cmds = require('./core/commands')
const { ESLint } = require('./core/eslint')
const { changedIssues, filterIssues } = require('./core/issues')
const { Updatable } = require('./core/updatable')

const {
  documentIsClosed,
  documentIsOpenInEditors,
  findDocumentByURI,
  getDocumentText
} = require('./lib/document')
const ext = require('./lib/extension')
const { nixalize } = require('./lib/path')
const { runAsync } = require('./lib/process')

/**
 * Configuration keys.
 * @property {boolean} disabled - The “Disable ESLint” workspace option.
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
 * @property {boolean} nodePath - The Updatable Node executable path.
 */
const state = {
  activationErrorHandled: false,
  nodePath: new Updatable()
}

/**
 * Updatable ESLint instances to use for linting.
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
const throttled = (since) => {
  const limit = 60 * 1000 // = 1 min.
  return since != null && Date.now() - since <= limit
}

/**
 * Void the Issue collection for a URI (if necessary).
 * @returns {Array} An empty array (which we can return to the Assistant).
 * @param {string} uri - The URI to void.
 */
const noIssues = uri => {
  if (collection.has(uri)) collection.remove(uri)
  return []
}

/**
 * Get the ESLint instance responsible for files in a specified directory.
 * @returns {?object} An ESLint instance, if a valid binary path was found.
 * @param {string} dir - The path to the directory.
 * @throws {Error} 'ShellError' when executing `npm-which` fails.
 */
async function getLinter (dir) {
  const bin = binaries.which
  const opts = { args: ['eslint'], cwd: dir, shell: true }
  const { code, stderr, stdout } = await runAsync(bin, opts)

  // Currently, `npm-which` has a few quirks we need to handle:
  // - It always returns 0, even when it cannot locate an executable.
  //   The only differentiator is that it prints a found executable’s
  //   path on stdout, and a message on stderr when it doesn’t find anything.
  // - But it shows usage info on stdout when no argument is passed.
  // - And, of course, shells return diverse errors when the script itself
  //   cannot be run, flavoured to the shell and hence unparseable.
  if (code === 0 && stdout.length) {
    const path = stdout.split('\n')[0]
    if (nova.fs.access(path, nova.fs.X_OK)) return new ESLint(path)
  } else if (code > 1) {
    // We ignore code 1 as that code should never come from the shell itself,
    // and it also future proofs us against `npm-which` getting more idiomatic.
    if (nova.fs.access(bin, nova.fs.X_OK)) {
      const error = new Error(`Exit code ${code}: ${stderr}`)
      error.name = 'ShellError'
      throw error
    } else {
      console.info(`Trying to make '${bin}' executable, then re-trying to get a linter …`)
      await makeExecutable(bin)
      return getLinter(dir)
    }
  }

  return null
}

/**
 * Update the ESLint instance responsible for files in a specified directory.
 * @returns {object} Either the current or an updated ESLint instance.
 * @param {string} dir - The path to the directory.
 */
async function updateLinter (dir) {
  const current = linters[dir].value
  const updated = await getLinter(dir)
  if ((updated == null) !== (current == null)) return updated
  if (updated != null && current != null && updated.binary !== current.binary) {
    return updated
  }
  return current
}

/**
 * Launch a lint operation, if possible.
 * @returns {boolean} Whether a lint operation was started.
 * @param {object} editor - The TextEditor to lint.
 * @param {boolean} [retry=true] Whether to retry linting on execution errors.
 * Currently, retries happens when either the ESLint binary lookup or its
 * execution proper fails and we need to reset the path values for it or Node.
 * The retry attempts themselves set this to `false` as a loop breaker.
 */
async function maybeLint (editor, retry) {
  try {
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
    const config = ESLint.config(path)
    if (config == null) return noIssues(uri)

    // We need Node (both for npm-which and eslint).
    // To not flood the user’s system with searches, we throttle them
    // (the original `null` timestamp ensures we always do the first pass).
    // Also, because `access()` calls are slow, we do not check for the
    // validity of a once found Node executable every time, but rely on it
    // being reset when execution errors happen.
    const node = state.nodePath
    if (node.value == null && !throttled(node.time)) await node.update(findInPATH('node'))
    if (node.value == null) return noIssues(uri)

    // A `null` ESLint instance should only be present on the very first attempt,
    // or when neither a global nor a local install is found. We always search for
    // a binary in the former case (throttling does not happen on `null` timestamps),
    // but throttle searches in the latter case, so as to not tax the user’s system.
    // Because the `access()` call underlying `ESLint.valid` is costly, we do not check
    // before every operation; instead, we try again if a ProcessError' is thrown.
    const dir = nova.path.dirname(path)

    if (linters[dir] == null) linters[dir] = new Updatable()
    if (linters[dir].value == null && !throttled(linters[dir].time)) {
      try {
        await linters[dir].update(getLinter(dir))
      } catch (error) {
        console.error(error)
        if (error.name === 'ShellError' && maybeVoidNode() && retry !== false) {
          console.info('Retrying lint operation with re-set Node path …')
          return maybeLint(editor, false)
        }
      }
    }

    const eslint = linters[dir].value
    if (eslint == null) return noIssues(uri)

    // Asynchronous update check to catch new project-local installs
    // that would otherwise be shadowed by a global ESLint install.
    if (!linters[dir].updating && !throttled(linters[dir].time)) {
      try {
        linters[dir].update(updateLinter(dir))
      } catch (error) {
        console.error(error)
      }
    }

    // Because lint operations are asynchronous and their duration can
    // vary widely depending on how busy the system is, we need to ensure
    // we respect their start chronology when processing their results
    // (i.e. ensure that slower older runs do not overwrite faster newer ones).
    if (queue[uri] == null) queue[uri] = { lastStarted: 1, lastEnded: 0 }
    const index = queue[uri].lastStarted++
    try {
      const cwd = nova.path.dirname(config)
      const results = await eslint.lint(src, nixalize(path), cwd)
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
      console.error(error)
      noIssues(uri)
      if (error.name === 'ProcessError') {
        const noNode = maybeVoidNode()
        const noESLint = !eslint.valid
        if (noESLint) linters[dir] = new Updatable()
        if ((noNode || noESLint) && retry !== false) {
          const both = noNode && noESLint
          const info = both ? 'Node and ESLint paths' : `${noNode ? 'Node' : 'ESLint'} path`
          console.info(`Retrying lint operation with re-set ${info} …`)
          return maybeLint(editor, false)
        }
      }
    }
  } catch (error) {
    console.error(error)
  }

  return []
}

/**
 * Void our cached Node executable data if it is not valid anymore.
 * We call this when Node-dependent operations fail.
 * @returns {boolean} Whether the cached data was voided.
 */
function maybeVoidNode () {
  const node = state.nodePath.value
  const voidNode = node != null && !nova.fs.access(node, nova.fs.X_OK)
  if (voidNode) state.nodePath = new Updatable()
  return voidNode
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
  nova.commands.register(`${prefix}.open-config`, cmds.openConfig)
  nova.commands.register(`${prefix}.open-ignore`, cmds.openIgnore)
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
 * Because we piggyback on the Issue AssistantRegistry, but do not
 * actually use it, we do not fully participate in the teardown part
 * of its excellent event setup.
 */
function registerEditorListeners () {
  nova.workspace.onDidAddTextEditor(added => {
    // Clear issues when a document is closed. We can’t do that inside
    // the linting operation, because that always has a valid editor
    // context (and hence an open document).
    added.onDidDestroy(destroyed => {
      const doc = destroyed.document
      const uri = doc.uri
      if (documentIsClosed(doc)) {
        if (collection.has(uri)) collection.remove(uri)
      } else {
        // There is a race condition where a very rapid change just before
        // a TextEditor containing the document is destroyed leaves the
        // collection for that document in the wrong state.
        maybeLint(documentIsOpenInEditors(doc)[0])
      }
    })

    // Catch file rename operations on save, which for Nova means:
    // 1. closing the old document 2. opening the new document.
    // 1. needs handling as above, 2. will fire a change event for the
    // editor(s) containing the renamed file, but copying the issues over
    // will stop them flickering in and out of existence in the Issues pane.
    added.onWillSave(willSave => {
      const oldURI = willSave.document.uri
      const once = willSave.onDidSave(didSave => {
        const newURI = didSave.document.uri
        if (newURI !== oldURI && collection.has(oldURI)) {
          collection.set(newURI, collection.get(oldURI))
          if (!findDocumentByURI(oldURI)) collection.remove(oldURI)
        }
        once.dispose()
      })
    })
  })
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
