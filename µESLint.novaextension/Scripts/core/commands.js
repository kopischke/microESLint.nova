/**
 * @file Core extension commands functionality.
 */
const { ESLint } = require('./eslint')
const { prefixCommand } = require('../lib/extension')
const { notify } = require('../lib/utils')

/**
 * Open the ESLint file(s) relevant to a TextEditor.
 * @param {string} what - The type of file(s) to open: one of “config” or “ignore”.
 * @param {object} editor - The TextEditor context.
 */
exports.open = function (what, editor) {
  const id = `${prefixCommand()}.open-${what}`
  const path = editor.document.path || nova.workspace.path
  if (path) {
    const args = what === 'config' ? [path, true] : [path]
    const files = ESLint[what](...args)
    if (files != null) {
      const open = [].concat(files)
      open.forEach(file => { nova.workspace.openFile(file) })
    } else {
      notify(id, nova.localize(`${id}.msg.no-match`))
    }
  } else {
    notify(id, nova.localize(`${id}.msg.no-path`))
  }
}
