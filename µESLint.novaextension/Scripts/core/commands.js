/**
 * @file Core extension commands functionality.
 */
const { ESLint } = require('./eslint')
const { prefixCommand } = require('../lib/extension')
const { notify } = require('../lib/utils')

/**
 * Open an ESLint file relevant for a TextEditor.
 * @param {string} what - The file to open: one of “config” or “ignore”.
 * @param {object} editor - The TextEditor context.
 */
exports.open = function (what, editor) {
  const id = `${prefixCommand()}.open-${what}`
  const path = editor.document.path || nova.workspace.path
  if (path) {
    const target = ESLint[what](path)
    if (target) {
      nova.workspace.openFile(target)
    } else {
      notify(id, nova.localize(`${id}.msg.no-match`))
    }
  } else {
    notify(id, nova.localize(`${id}.msg.no-path`))
  }
}
