[![](resources/readme/introduction.png)](#readme)

<div align="center">

# JFrog Extension for VS Code & Eclipse Theia

![JFrog Extension Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/JFrog.jfrog-vscode-extension?label=VS%20Code%20installs&color=blue&style=for-the-badge)

 [![Visual Studio Code Version](https://img.shields.io/visual-studio-marketplace/v/JFrog.jfrog-vscode-extension?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=JFrog.jfrog-vscode-extension)

[![Visual Studio Marketplace](https://img.shields.io/badge/Visual%20Studio%20Code-Marketplace-blue.png)](https://marketplace.visualstudio.com/items?itemName=JFrog.jfrog-vscode-extension)  [![Open VSX Registry](https://img.shields.io/badge/Open%20VSX%20Registry-Marketplace-blue.png)](https://open-vsx.org/extension/JFrog/jfrog-vscode-extension)
[![Scanned by Frogbot](https://raw.github.com/jfrog/frogbot/master/images/frogbot-badge.png)](https://github.com/jfrog/frogbot#readme) [![Test](https://github.com/jfrog/jfrog-vscode-extension/actions/workflows/test.yml/badge.svg)](https://github.com/jfrog/jfrog-vscode-extension/actions/workflows/test.yml?branch=master)

</div>

## 🤖 About this Extension
The cost of remediating a vulnerability is akin to the cost of fixing a bug.
The earlier you remediate a vulnerability in the release cycle, the lower the cost.
The extension allows developers to find and fix security vulnerabilities in their projects and to see valuable information
about the status of their code by continuously scanning it locally with the [JFrog Platform](https://jfrog.com/xray/).

### What security capabilities do we provide?
#### 🌟 Basic
<details>
  <summary>Software Composition Analysis (SCA)</summary>
Scans your project dependencies for security issues and shows you which dependencies are vulnerable. If the vulnerabilities have a fix, you can upgrade to the version with the fix in a click of a button.
</details>

<details>
  <summary>CVE Research and Enrichment</summary>
For selected security issues, get leverage-enhanced CVE data that is provided by our JFrog Security Research team.
Prioritize the CVEs based on:

- **JFrog Severity**: The severity given by the JFrog Security Research team after the manual analysis of the CVE by the team.
CVEs with the highest JFrog security severity are the most likely to be used by real-world attackers.
This means that you should put effort into fixing them as soon as possible.
- **Research Summary**: The summary that is based on JFrog's security analysis of the security issue provides detailed technical information on the specific conditions for the CVE to be applicable.
- **Remediation**: Detailed fix and mitigation options for the CVEs

You can learn more about enriched CVEs [here](https://jfrog.com/help/r/jfrog-security-documentation/jfrog-security-cve-research-and-enrichment).

Check out what our research team is up to and stay updated on newly discovered issues by clicking on this link: <https://research.jfrog.com>
</details>

#### 🌟 Advanced
*Requires Xray version 3.66.5 or above and Enterprise X / Enterprise+ subscription with [Advanced DevSecOps](https://jfrog.com/xray/#xray-advanced).*

<details>
  <summary>Vulnerability Contextual Analysis</summary>
Uses the code context to eliminate false positive reports on vulnerable dependencies that are not applicable to the code.
Vulnerability Contextual Analysis is currently supported for Python, Java and JavaScript code.
</details>

<details>
  <summary>Static Application Security Testing (SAST)</summary>
Provides fast and accurate security-focused engines that detect zero-day security vulnerabilities on your source code sensitive operations, while minimizing false positives.
</details>

<details>
  <summary>Secrets Detection</summary>
Prevents the exposure of keys or credentials that are stored in your source code.
</details>

<details>
  <summary>Infrastructure as Code (IaC) Scan</summary>
Secures your IaC files. Critical to keeping your cloud deployment safe and secure.
</details>

#### 🌟 Additional Perks

- Security issues are easily visible inline.
- The results show issues with context, impact, and remediation.
- View all security issues in one place, in the JFrog tab.
- For Security issues with an available fixed version, you can upgrade to the fixed version within the plugin.
- Track the status of the code while it is being built, tested, and scanned on the CI server.

The extension also applies [JFrog File Spec JSON schema](https://raw.githubusercontent.com/jfrog/jfrog-cli/master/schema/filespec-schema.json) on the following file patterns: `**/filespecs/*.json`, `*filespec*.json` and `*.filespec`. Read more about JFrog File specs [here](https://www.jfrog.com/confluence/display/JFROG/FileSpec).

## 🔥 Getting Started
Read the [documentation](https://docs.jfrog-applications.jfrog.io/jfrog-applications/ide/visual-studio-code) to get started.

## 🔥 Reporting Issues
Please help us improve by [reporting issues](https://github.com/jfrog/jfrog-vscode-extension/issues) you encounter.

## 💻 Code Contributions
We welcome community contribution through pull requests.

### Guidelines
-   Before creating your first pull request, please join our contributors community by signing [JFrog's CLA](https://secure.echosign.com/public/hostedForm?formid=5IYKLZ2RXB543N).
-   If the existing tests do not already cover your changes, please add tests.
-   Pull requests should be created on the _dev_ branch.
-   Please run `npm run format` for formatting the code before submitting the pull request.
