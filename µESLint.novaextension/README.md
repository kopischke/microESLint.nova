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

So: one and a half features. And all of it should work reliably, everywhere, with no config outside the one you have to set up for ESLint itself. Should you find it does not, [holler](https://github.com/kopischke/microESLint.nova/issues).

## Requirements

µESLint requires you to have a **globally** installed copy of ESLint, version 4 or better. Project-specific ESLint installs will **not** work. If you don’t have ESLint installed globally  already, you can install it using [Homebrew](https://brew.sh):

```sh
brew install eslint
```

or using a JavaScript package manager, i.e.:

```sh
npm install -g eslint

# or

yarn install eslint
```

Then, you need to configure ESLint itself. The [ESLint documentation’s “Getting Started“ chapter](https://eslint.org/docs/user-guide/getting-started#configuration) has a good explanation of what to do (but ignore the part on installing – see above).

## Configuration

You can disable _µESLint_ on a per-project basis in project settings, and there is a shortcut to get there in the Extensions menu. That’s it. Configure ESLint, not the extension.
