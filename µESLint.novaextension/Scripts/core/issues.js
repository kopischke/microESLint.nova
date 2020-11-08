/**
 * @file Core extension issues functionality.
 */
const { documentIsClosed } = require('../lib/utils')

/**
 * Filter out ESLint issues that are not source code issues.
 * @returns {Array.<?object>} An array of {@link Issue} objects.
 * @param {Array.<?object>} issues - The issues to filter.
 * @param {object} document - The {@link TextDocument} the issues apply to.
 */
exports.filterIssues = function (issues, document) {
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
 * Ensure a correct issue collection update.
 * To reduce flickering and wandering issue listing when multiple
 * plugins update collections, we only update when there are actual
 * changes. Also, we check the document is still open before updating,
 * to make sure we don’t create zombie Issues from async linting operations.
 * @returns {number} The number of issues set in the update.
 * @param {object} collection - The {@link IssueCollection} to update.
 * @param {Array.<?object>} issues - The incoming {@link Issue}s.
 * @param {object} document - document - The {@link TextDocument} the issues apply to.
 */
exports.updateIssues = function (collection, issues, document) {
  const uri = document.uri
  if (issues == null || issues.length === 0 || documentIsClosed(document)) {
    if (collection.has(uri)) collection.remove(uri)
    return 0
  }

  const knownIssues = collection.get(uri)
  if (knownIssues.length !== issues.length) {
    collection.set(uri, issues)
    return issues.length
  }

  const hasChanges = issues.find(issue => {
    const known = knownIssues.find(knownIssue => {
      return (
        knownIssue.message === issue.message &&
        knownIssue.code === issue.code &&
        knownIssue.line === issue.line &&
        knownIssue.column === issue.column &&
        knownIssue.endLine === issue.endLine &&
        knownIssue.endColumn === issue.endColumn &&
        knownIssue.severity === issue.severity
      )
    })
    return known == null
  })

  if (hasChanges) {
    collection.set(uri, issues)
    return issues.length
  }

  return 0
}
