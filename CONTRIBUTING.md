# Contribution Guide

## Guidelines
-   If the existing tests do not already cover your changes, please add tests.
-   Please run `npm run format` for formatting the code before submitting the pull request.

## Building and Testing the Sources

### Preconditions

-   npm 16 and above
-   JFrog CLI's `jf` executable - required for tests

To build the extension from sources, please follow these steps:

1. Clone the code from Github.
2. Update submodules:

```bash
git submodule init
git submodule update
```

3. Build and create the VS-Code extension vsix file by running the following npm command:

```bash
npm i
npm run package
```

After the build finishes, you'll find the vsix file in the _jfrog-vscode-extension_ directory.
The vsix file can be loaded into VS-Code

To run the tests:

```bash
npm t
```