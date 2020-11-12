## Version 1.2.0

Improvements to, and fixes for the commands for opening ESLint files.

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
    - Saving documents with issues under a new name would leave a duplicate issue set hanging around the Issues pane (that one was more annoying kind of zombie, as you could not interact with it at all).
    - Closing an editor after a very fast set of changes did not update the issues for the document if it was still open in other editor panes (possibly a Nova bug).
    - Unloading the extension also sometimes left zombie issue sets hanging around (possibly a Nova bug).
- Checking for missing binaries happened too frequently, potentially affecting the system’s responsiveness.

**Caveat**

Currently, Nova’s Issues pane will not display an entry for documents whose path or name has  changed outside a “Save as…” operation (be it through renaming in the Nova sidebar, or through the Finder or a CLI). The document gets linted – you will find issue entries in its margin –, but the Issues pane never tells you about it. This is a Nova bug ([Nova’s internal IssueCollection managed by the AssistantRegistry](https://docs.nova.app/api-reference/assistants-registry/#registerissueassistant-selector-object-options) is affected the same way) I have found no workaround for.

## Version 1.0.0

**Initial release:** lint any document you [configured ESLint](https://eslint.org/docs/user-guide/configuring) for, the way you configured it to. No frills, no hassle.
