/**
 * @file Document methods for boilerplate poorer extensions.
 * @version 1.0.0
 * @author Martin Kopischke <martin@kopischke.net>
 * @license MIT
 */

/**
 * Shim for the `TextDocument.isClosed` instance method; as of Nova 2,
 * that always returns true, even in a `TextEditor.onDidDestroy` callback.
 * @returns {boolean} Whether the document isn’t open in any editor.
 * @param {object} document - The {@link TextDocument} to check.
 */
exports.documentIsClosed = function (document) {
  const uri = document.uri
  return !nova.workspace.textEditors.some(e => e.document.uri === uri)
}

/**
 * Get all editors in the workspace in which a TextDocument is open.
 * @returns {Array.<object>} All TextEditor instances the document is open in.
 * @param {?object} document - The {@link TextDocument} to check.
 */
exports.documentIsOpenInEditors = function (document) {
  const uri = document.uri
  return nova.workspace.textEditors.filter(e => e.document.uri === uri)
}

/**
 * Find the open document corresponding to a path.
 * @returns {?object} The {@link TextDocument} found.
 * @param {string} path - The path to look for.
 */
exports.findDocumentByPath = function (path) {
  path = nova.path.normalize(path)
  return nova.workspace.textEditors.find(e => e.document.path === path)
}

/**
 * Find the open document corresponding to a URI.
 * @returns {?object} The {@link TextDocument} found.
 * @param {string} uri - The URI to look for.
 */
exports.findDocumentByURI = function (uri) {
  if (uri == null) return null
  return nova.workspace.textEditors.find(e => e.document.uri === uri)
}

/**
 * Get the full text contents of a document.
 * @returns {string} The document text.
 * @param {object} document - The {@link TextDocument} whose text should be retrieved.
 */
exports.getDocumentText = function (document) {
  return document.isEmpty
    ? ''
    : document.getTextInRange(new Range(0, document.length))
}
