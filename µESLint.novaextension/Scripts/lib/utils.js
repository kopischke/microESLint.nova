/**
 * @file Utility methods for boilerplate poorer extensions.
 */

/**
 * Shim for the `TextDocument.isClosed` instance method; as of Nova 2,
 * that always returns true, even in a `TextEditor.onDidDestroy` callback.
 * @returns {boolean} Whether the document is open in at least one editor.
 * @param {object} document - The TextDocument to check.
 */
exports.documentIsClosed = function (document) {
  const open = nova.workspace.textEditors.find(
    item => item.document.uri === document.uri
  )
  return open == null
}

/**
 * Get all editors in the workspace in which a TextDocument is open.
 * @returns {Array.<object>} All TextEditor instances the document is open in.
 * @param {object} document - The TextDocument to check.
 */
exports.documentIsOpenInEditors = function (document) {
  return nova.workspace.textEditors.filter(
    item => item.document.uri === document.uri
  )
}

/**
 * Get the locally valid configuration setting (workspace if set, else global).
 * @returns {?*} The configuration value (if any).
 * @param {string} key - The configuration key to look up.
 * @param {string} [type] - The type to coerce the configuration value to.
 * @see {@link https://docs.nova.app/api-reference/configuration/}
 */
exports.getLocalConfig = function (key, type) {
  const local = nova.workspace.config.get(key, type)
  return local != null ? local : nova.config.get(key, type)
}

/**
 * Get the full text contents of a document.
 * @returns {string} The document text.
 * @param {object} doc - The {@link TextDocument} whose text should be retrieved.
 */
exports.getDocumentText = function (doc) {
  return doc.isEmpty ? '' : doc.getTextInRange(new Range(0, doc.length))
}

/**
 * Get the current user’s qualified $HOME path.
 * @returns {string} The path.
 */
exports.homePath = function () {
  return nova.path.normalize(nova.path.expanduser('~'))
}

/**
 * Simple event notification.
 * @param {string} id - NotificationRequest.id.
 * @param {string} message - NotificationRequest.message.
 */
exports.notify = function (id, message) {
  const request = new NotificationRequest(id)
  request.title = nova.extension.name
  request.body = message
  nova.notifications.add(request)
}

/**
 * Like `require('/path/to/file.json')` in Node. Absolute paths only.
 * @returns {?object} The parsed contents of the JSON file (if found).
 * @param {string} path - The path to the JSON file.
 */
exports.requireJSON = function (path) {
  if (!nova.fs.access(path, nova.fs.R_OK)) return null
  const lines = nova.fs.open(path).readlines()
  return lines.length > 0 ? JSON.parse(lines.join('\n')) : null
}

/**
 * Shim for the `Workspace.contains` instance method; as of Nova 2,
 * that always returns true and `Workspace.relativizePath` always returns
 * a relative path, with as many  '../' as needed.
 * @see {@link https://docs.nova.app/api-reference/workspace/#contains-path}
 * @see {@link https://docs.nova.app/api-reference/workspace/#relativizepath-path}
 * @returns {boolean} Whether the path is inside the workspace’s directory hierarchy.
 * @param {string} path - The path to check.
 * @param {object} [workspace=nova.workspace] - The workspace to check.
 */
exports.workspaceContains = function (path, workspace) {
  workspace = workspace || nova.workspace
  const relative = workspace.relativizePath(path)
  return relative !== path && !relative.startsWith('../')
}
