## Version 1.3.0

Full compatibility with the [TypeScript ESLint](https://typescript-eslint.io/) plugin and parser. The improvements that went into this should also make _µESLint_ play nice with other plugins that extend ESLint beyond its original boundaries and / or have implementation quirks.

**Added**

- Support for relative paths in `parserOptions` settings ([#2](https://github.com/kopischke/microESLint.nova/issues/2)).

**Fixed**

- Some ESLint plugins could not handle macOS paths including the root mount point (`/Volumes/Macintosh HD` by default) of the kind that Nova’s path APIs return ([#3](https://github.com/kopischke/microESLint.nova/issues/3)).
- Errors while linting would not be logged by either Nova or the extension (_µESLint_ was relying on Nova logging thrown errors, but the extension subsystem seems to not do that for asynchronous functions).
- Uninstalling Node while the extension was active would not be handled correctly.
- Project-specific ESLint installs would not always be detected correctly.
- Update checks for a new project-specific ESLint install would happen too often, possibly degrading system performance.

**Changed**

- Instead of validating its required binaries at every lint, _µESLint_ now checks for errors and tries to recover from them. This should improve performance on slower, HD based systems, as the validation is a costly(-ish) file system operation.
- ESLint parsing errors due to misconfiguration or plugin issues are no longer quietly dropped but logged to the extension console instead.

**Hat tips and credits**

- [Nate Silva](https://github.com/natesilva) for reporting _µESLint_’s incompatibility with the TypeScript ESLint plugin, contributing a well-designed test case and patiently bearing with me while I worked out the kinks.

## Version 1.2.0

Improvements to, and fixes for, the commands for opening ESLint files.

**Fixed**

- The “Open ESLint Config file(s)…” command did not stop at [config files with `root: true`](https://eslint.org/docs/user-guide/configuring#using-configuration-files-1).
- The “Open ESLint Config file(s)…” and “Open ESLint Ignore file…” commands would not correctly handle being called from an editor containing a file of the matching type.


## Version 1.1.0

This release’s tentpole feature is support for project local ESLint installs (i.e. those you get with `npm install` without the `-g` flag, or `yarn add`). Local installs will be picked up automatically, in preference to a global install, not just at extension startup but anytime you add them to the mix. Besides this, this release also features a lot of under-the-hood improvements and fixes to ensure linting is as smooth and reliable as possible, and that all aspects of ESLint integration conform to the behaviour you would expect from it outside of Nova.

**Added**

- Support for project-local ESLint installs besides global ones.

**Fixed**

- The “Open ESLint Config…” command would only open the configuration file closest to the target file in the directory hierarchy instead of opening [all files in the cascade](https://eslint.org/docs/user-guide/configuring#configuration-cascading-and-hierarchy).
- The “Open ESLint Ignore file…” command would not open [package.json files with an `eslintIgnore` section](https://eslint.org/docs/user-guide/configuring#using-eslintignore-in-packagejson).
- Several scenarios where issues would remain listed in the Issues pane when they should not:
    - Closing documents with issues would leave their issue set hanging around the Issues pane like a benign zombie infestation (you could re-open the document from there, but that was not expected behaviour).
    - Saving documents with issues under a new name would leave a duplicate issue set hanging around the Issues pane (that one was a more annoying kind of zombie, as you could not interact with it at all).
    - Closing an editor after a very fast set of changes did not update the issues for the document if it was still open in other editor panes (possibly a Nova bug).
    - Unloading the extension also sometimes left zombie issue sets hanging around (possibly a Nova bug).
- Checking for missing binaries happened too frequently, potentially affecting the system’s responsiveness.

**Caveat**

Currently, Nova’s Issues pane will not display an entry for documents whose path or name has  changed while open, if that happened otherwise than through a “Save as…” operation (e.g. through renaming in the Nova sidebar, or through the Finder or a CLI). The document gets linted – you will find issue entries in its margin –, but the Issues pane never tells you about it. This is a Nova bug ([Nova’s internal IssueCollection managed by the AssistantRegistry](https://docs.nova.app/api-reference/assistants-registry/#registerissueassistant-selector-object-options) is affected the same way) I have found no workaround for.

## Version 1.0.0

**Initial release:** lint any document you [configured ESLint](https://eslint.org/docs/user-guide/configuring) for, the way you configured it to. No frills, no hassle.
