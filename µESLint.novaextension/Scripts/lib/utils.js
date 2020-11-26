/**
 * @file General utility methods for boilerplate poorer extensions.
 * @version 3.1.0
 * @author Martin Kopischke <martin@kopischke.net>
 * @license MIT
 */

/**
 * Get the locally valid configuration setting (workspace if set, else global).
 * @returns {?*} The configuration value (if any).
 * @param {string} key - The configuration key to look up.
 * @param {string} [type] - The type to coerce the configuration value to.
 * @see {@link https://docs.nova.app/api-reference/configuration/}
 */
exports.getLocalConfig = function (key, type) {
  return nova.workspace.config.get(key) != null
    ? nova.workspace.config.get(key, type)
    : nova.config.get(key, type)
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
