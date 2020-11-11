# µESLint – ESLint for Nova, the micro edition

Use [ESLint](https://eslint.org)’s awesome linting powers when working in Nova.

## Why use this, and why “micro edition”

There is an excellent, full featured [ESLint extension](https://extensions.panic.com/extensions/apexskier/apexskier.eslint/) by Cameron Little in the [extension library](nova://extension/?id=apexskier.eslint); it has suggested fixes, a “fix on save” option and brings its own copy of ESLint. You may want to check Cameron’s extension out first if you have not installed any ESLint based linting extension for Nova yet. Really, it’s good.

However, if you find out it does not always work as reliably as it could for you, for instance because you work with JavaScript file types it does not know about (like [JavaScript for Automation](https://developer.apple.com/library/archive/releasenotes/InterapplicationCommunication/RN-JavaScriptForAutomation/Articles/OSX10-11.html) files that use the `.jxa` extension), or if you have got ESLint configured to lint crazy things like Markdown files ([yes, that is possible](https://www.npmjs.com/package/eslint-plugin-md)), which it will ignore, or because Cameron’s extension is sometimes hit and miss when you switch workspaces and files a lot, or because you don’t keep your `.eslintrc` file in your workspace, or because you realise that “fix on save” only sounds nice until you lose your cursors and selections when it happens, or … well, anything else that makes you wish for ESLint linting in Nova to work **exactly** as it does with the CLI, _µESLint_ may be for you.

Hence “_µESLint_” and “micro edition” – this extension does the absolute minimum it needs to be useful. No frills, no hassle.

## Features

_µESLint_ has exactly one feature: if the ESLint CLI would lint a file you have open in Nova, _µESLint_ will do that too, in the exact same way, with the same results – but on every change and using Nova’s Issues pane.

![_µESLint.nova linting feature](https://raw.githubusercontent.com/kopischke/microESLint.nova/main/img/µeslint-linting-feature.png "Linting with µESLint.")

Uh, well, actually there is a sort of a second feature: it has commands to open the ESLint configuration and ignore files that are pertinent to a source file in the Editor menu.

So: one and a half features. And all of it should work reliably, everywhere, with no config outside the one you have to set up for ESLint itself. Should you find it does not, please refer to the “Known issues“ section below.

## Requirements

µESLint requires you to have ESLint, version 4 or better, installed either globally or as a project dependency. You can install ESLint globally using [Homebrew](https://brew.sh):

```sh
brew install eslint
```

or install it, either globally or locally, using a JavaScript package manager. The [ESLint “Getting Started“ chapter of the User Guide](https://eslint.org/docs/user-guide/getting-started) explains all you need to know about this.

Once this is done, you need to configure ESLint. Please refer to the ESLint User Guide for a [quick overview](https://eslint.org/docs/user-guide/getting-started#configuration) and an [in-depth explanation](https://eslint.org/docs/user-guide/configuring).

(Technically, this extension also requires [Node](https://nodejs.org/) to be installed on your system. As there is no way I am aware of to install, never mind run, ESLint without Node, you need not worry about that.)

## Configuration

You can disable _µESLint_ on a per-project basis in project settings, and there is a shortcut to get there in the Extensions menu. That’s it. Configure ESLint, not the extension.

## Known issues

… as in issues of this extension (this is, ahem, the issue with a linting extension: the terminology can get a wee bit confusing):

1. Currently, Nova’s Issues pane will not display an entry for documents whose path or name has changed outside a “Save as…” operation (be it through renaming in the Nova sidebar, or through the Finder or a CLI). The document gets linted – you will find issue entries in its margin –, but the Issues pane never tells you about it. This is a Nova bug ([Nova’s internal IssueCollection managed by the AssistantRegistry](https://docs.nova.app/api-reference/assistants-registry/#registerissueassistant-selector-object-options) is affected the same way) I have found no workaround for.
2. The “Open ESLint Config…” does not respect the `root: true` setting, always opening [all files in the hierarchy](https://eslint.org/docs/user-guide/configuring#configuration-cascading-and-hierarchy) instead. Solving this would mean parsing configuration files in multiple languages, among them YAML, and is unlikely to ever happen.

Should you encounter other problems, kindly describe them in [a Github issue](https://github.com/kopischke/microESLint.nova/issues).
