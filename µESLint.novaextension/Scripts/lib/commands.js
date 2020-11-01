/**
 * @file Commands functionality.
 */
const { ESLint } = require('./eslint')
const { prefixCommand } = require('./extension')
const { notify } = require('./utils')

/**
 * Open the ESLint configuration file relevant for a TextEditor.
 * @param {object} editor - The TextEditor context.
 */
exports.openESLintConfig = function (editor) {
  const id = `${prefixCommand()}.open-config`
  const path = editor.document.path || nova.workspace.path
  if (path) {
    const config = ESLint.config(path)
    if (config) {
      nova.workspace.openFile(config)
    } else {
      notify(id, nova.localize(`${id}.msg.no-config`))
    }
  } else {
    notify(id, nova.localize(`${id}.msg.no-path`))
  }
}

/**
 * Open the ESLint ignore file relevant for a TextEditor.
 * @param {object} editor - The TextEditor context.
 */
exports.openESLintIgnore = function (editor) {
  const id = `${prefixCommand()}.open-ignore`
  const path = editor.document.path || nova.workspace.path
  if (path) {
    const ignore = ESLint.ignore(path)
    if (ignore) {
      nova.workspace.openFile(ignore)
    } else {
      notify(id, nova.localize(`${id}.msg.no-config`))
    }
  } else {
    notify(id, nova.localize(`${id}.msg.no-path`))
  }
}
