/**
 * @file Core extension issues functionality.
 */
let lastLogged = null

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

    // Suppress most parsing errors as ESLint returns misconfiguration or
    // the results or linting file types not supposed or able to be linted
    // as a single “fatal” linting error, but we would like to keep bona fide
    // parsing errors on malformed JS input.
    if (issue.severity === IssueSeverity.Error && issue.code == null) {
      if (issue.line == null || issue.line === 0) {
        // These are execution errors: discard but log (without flooding).
        if (lastLogged !== issue.message) console.warn(issue.message)
        lastLogged = issue.message
      } else if (document.syntax.match(/\bjavascript\b/i)) {
        // Keep only locatable parsing errors that stem from JS files.
        // If we don’t do this, unlintable file formats (like, say, XML)
        // end up having parsing errors at random locations. Although
        // that would be technically correct, it makes for horrible UX.
        return issues
      }
      return []
    }
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
