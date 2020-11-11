/**
 * @file Core extension issues functionality.
 */

/**
 * Filter out ESLint issues that are not source code issues.
 * @returns {Array.<?object>} An array of {@link Issue} objects.
 * @param {Array.<?object>} issues - The {@link Issue}s to filter.
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
 * Checks if an issue set differs from the known one.
 * @returns {boolean} Whether the issue sets differ.
 * @param {Array.<?object>} known - The known {@link Issue} set to check against.
 * @param {Array.<?object>} incoming - The incoming {@link Issue} set to check.
 */
exports.changedIssues = function (known, incoming) {
  if (known.length !== incoming.length) return true

  return incoming.some(issue => {
    return !known.some(knownIssue => {
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
  })
}
