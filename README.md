# Nuprl VSCode extension

# Building
Building requires [node.js](https://nodejs.org/en) and
TypeScript to be installed. Once node.js is installed, TypeScript can
be installed by running `npm install -g typescript`.

Visual Studio Code's `vsce` tool is also needed; this can be installed
by running `npm install -g @vscode/vsce`.

The extension can then be built by running the following commands:

```sh
npm install
yes | vsce package
```

The extension will be output as `nuprl-0.0.1.vsix`.

To install the extension, first install
[Visual Studio Code](https://code.visualstudio.com/)
then run `code --install-extension nuprl-0.0.1.vsix`.

## Using the extension
When editing a file in Visual Studio Code with a `.nuprl` extension,
the proof interface can be opened by opening the command palette
with `ctrl+shift+p` (or `cmd+shift+p` for MacOS), typing
`Nuprl: Proof View` and pressing enter. The evaluator can be opened
by typing `Nuprl: Evaluator` instead.
