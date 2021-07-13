# JFrog Visual Studio Code Extension

[![Visual Studio Marketplace](https://vsmarketplacebadge.apphb.com/version/JFrog.jfrog-vscode-extension.svg)](https://marketplace.visualstudio.com/items?itemName=JFrog.jfrog-vscode-extension)

# Table of Contents

- [About this Extension](#about-this-extension)
  - [General](#general)
  - [Component Tree Icons](#component-tree-icons)
- [General Configuration](#general-configuration)
  - [Configuring JFrog Platform](#configuring-jfrog-platform)
  - [Proxy Configuration](#proxy-configuration)
    - [Proxy Authorization](#proxy-authorization)
  - [Extension Settings](#extension-settings)
- [Using the Extension - General](#using-the-extension---general)
- [The Local View](#the-local-view)
  - [Supported Features](#supported-features)
  - [Free Go Modules Security Scanning and Metadata from GoCenter](#free-go-modules-security-scanning-and-metadata-from-gocenter-deprecated)
  - [Viewing and Updating Project Dependencies](#viewing-and-updating-project-dependencies)
  - [Scan after dependencies change](#scan-after-dependencies-change)
  - [Exclude Paths from Scan](#exclude-paths-from-scan)
  - [Go Projects](#go-projects)
  - [Maven Projects](#maven-projects)
  - [Npm Projects](#npm-projects)
  - [Pypi Projects](#pypi-projects)
  - [.NET Projects](#net-projects)
- [The CI View](#the-ci-view)
  - [How Does It Work](#how-does-it-work)
  - [Setting Up Your CI Pipeline](#setting-up-your-ci-pipeline)
  - [Setting Up the CI View](#setting-up-the-ci-view)
- [Troubleshooting](#troubleshooting)
- [License](#license)
- [Building and Testing the Sources](#building-and-testing-the-sources)
- [Code Contributions](#code-contributions)
  - [Guidelines](#guidelines)

## About this Extension
### General
The cost of remediating a vulnerability is akin to the cost of fixing a bug.
The earlier you remediate a vulnerability in the release cycle, the lower the cost.
[JFrog Xray](https://jfrog.com/xray/) is instrumental in flagging components when vulnerabilities are discovered in production systems at runtime,
or even sooner, during the development.

The JFrog VS Code Extension adds JFrog Xray scanning of project dependencies to your VS Code IDE. It allows developers to view panels displaying vulnerability information about the components and their dependencies directly in their VS Code IDE. The extension also allows developers to track the status of the code while it is being built, tested and scanned on the CI server.

The extension also applies [JFrog File Spec JSON schema](https://raw.githubusercontent.com/jfrog/jfrog-cli/master/schema/filespec-schema.json) on the following file patterns: `**/filespecs/*.json`, `*filespec*.json` and `*.filespec`. Read more about JFrog File specs [here](https://www.jfrog.com/confluence/display/JFROG/FileSpec).

Don't have JFrog Platform? [Start for free](https://jfrog.com/start-free/).

### Component Tree Icons
The icon demonstrates the top severity issue of a selected component and its transitive dependencies. The following table describes the severities from lowest to highest:
|                 Icon                | Severity |                                       Description                                      |
|:-----------------------------------:|:--------:|:---------------------------------------------------------------------------------------|
|   ![Normal](resources/normal.png)   |  Normal  | Scanned - No Issues                                                                    |
|  ![Unknown](resources/unknown.png)  |  Unknown | No CVEs attached to the vulnerability or the selected component not identified in Xray |
|      ![Low](resources/low.png)      |    Low   | Top issue with low severity                                                            |
|   ![Medium](resources/medium.png)   |  Medium  | Top issue with medium severity                                                         |
|     ![High](resources/high.png)     |   High   | Top issue with high severity                                                           |
| ![Critical](resources/critical.png) | Critical | Top issue with critical severity                                                       |

## General Configuration
### Configuring JFrog Platform
Connect to JFrog Platform by clicking on the green Connect ![Connect](resources/readme/connect.png) button:
![Connect](resources/readme/gifs/connect.gif)

You can leave the platformUrl empty to connect to custom Artifactory and Xray instances.

The extension also supports connecting to the JFrog platform using environment variables:

Note: For security reasons, it is recommended to unset the environment variables after launching VS Code.

- `JFROG_IDE_URL` - JFrog Platform URL
- `JFROG_IDE_USERNAME` - JFrog Platform username
- `JFROG_IDE_PASSWORD` - JFrog Platform password
- `JFROG_IDE_STORE_CONNECTION` - Set the value of this environment variable to **true**, if you'd like VS Code to store the connection details after reading them from the environment variables.

### Proxy Configuration
If your JFrog Platform is behind an HTTP/S proxy, follow these steps to configure the proxy server:

1. Go to Preferences --> Settings --> Application --> Proxy
1. Set the proxy URL under 'Proxy'.
1. Make sure 'Proxy Support' is 'override' or 'on'.

- Alternatively, you can use the HTTP_PROXY and HTTPS_PROXY environment variables.

#### Proxy Authorization
If your proxy server requires credentials, follow these steps:

1. Follow 1-3 steps under [Proxy configuration](#proxy-configuration).
1. Encode with base64: `[Username]:[Password]`.
1. Under 'Proxy Authorization' click on 'Edit in settings.json'.
1. Add to settings.json: `"http.proxyAuthorization": "Basic [Encoded credentials]"`.

##### Example
- `Username: foo`
- `Password: bar`

settings.json:

```json
{
   "http.proxyAuthorization": "Basic Zm9vOmJhcg=="
}
```

### Extension Settings
To open the extension settings, use the following VS Code menu command:

- On Windows/Linux - File > Preferences > Settings > Extensions > JFrog
- On macOS - Code > Preferences > Settings > Extensions > JFrog

## Using the Extension - General
The extension offers two modes, **Local** and **CI**. 
The two modes can be toggled by pressing on their respective buttons that will appear next to the components tree.

- The **Local** view displays information about the local code as it is being developed in VS Code. JFrog Xray continuously scans the project's dependencies locally, and the information is displayed in the **Local** view. 
- The **CI** view allows the tracking of the code as it is built, tested and scanned by the CI server. It displays information about the status of the build and includes a link to the build log on the CI server.

## The Local View
The local view of the extension adds JFrog Xray scanning of project dependencies to your VS Code IDE.
It allows developers to view panels displaying vulnerability information about the components and their dependencies directly in their VS Code IDE.
With this information, a developer can make an informed decision on whether to use a component or not before it gets entrenched into the organization’s product.

### Supported Features
| Features                                                | [Go](#go-projects) | [Maven](#maven-projects) | [npm](#npm-projects) | [Pypi](#pypi-projects) | [.NET](#net-projects) |
| ------------------------------------------------------- | :----------------: | :----------------------: | :------------------: | :--------------------: | :-------------------: |
| Issues and licenses scanning                            |         ✅         |            ✅            |          ✅          |           ✅           |          ✅           |
| Filter dependencies by severity, license, and scope     |         ✅         |            ✅            |          ✅          |           ✅           |          ✅           |
| Trigger scan on startup                                 |         ✅         |            ✅            |          ✅          |           ✅           |          ✅           |
| Jump from dependency tree to project descriptor         |         ✅         |            ✅            |          ✅          |           ✅           |          ❌           |
| Jump from project descriptor to dependency tree         |         ✅         |            ✅            |          ✅          |           ✅           |          ❌           |
| Show vulnerabilities inside the project descriptor      |         ✅         |            ✅            |          ✅          |           ✅           |          ❌           |
| Upgrade vulnerable dependencies to fixed versions       |         ✅         |            ✅            |          ✅          |           ❌           |          ❌           |
| Automatically trigger a scan upon code changes          |         ✅         |            ❌            |          ✅          |           ❌           |          ❌           |
| Exclude transitive dependencies from project descriptor |         ❌         |            ✅            |          ❌          |           ❌           |          ❌           |

### Free Go Modules Security Scanning and Metadata from GoCenter (deprecated)
As of February 28, 2021, GoCenter has been sunset. This integration has been removed. Learn more: https://jfrog.com/blog/into-the-sunset-bintray-jcenter-gocenter-and-chartcenter/

### Viewing and Updating Project Dependencies
View the dependencies used by the project in a tree, where the direct dependencies are at the top.
![Open_Extension](resources/readme/gifs/open.gif)

The JFrog extension automatically triggers a scan of the project's dependencies whenever a change is detected after building the code.
To invoke a scan manually, click on the Refresh ![Refresh](resources/readme/refresh.png) button or click on *Start Xray Scan* from within the editor.
![Refresh](resources/readme/gifs/refresh.gif)

View the security information for a dependency by hovering over it in the editor.
You can also navigate from the dependency declaration directly into the tree view. This allows you to see transitive (indirect) dependencies.
![Refresh](resources/readme/gifs/maven_pom_tree.gif)

Search for a dependency in the tree:
![Search_In_Tree](resources/readme/gifs/search.gif)

View the issues associated with direct and transitive (indirect) dependencies.
![Search_In_Tree](resources/readme/gifs/maven_issues.gif)

Update a vulnerable dependency to a fixed version:
![Set_Fixed_Version](resources/readme/gifs/set_fixed_version.gif)

To filter the dependencies viewed, click on the Filter ![Filter](resources/readme/filter.png) button.
![Filter](resources/readme/gifs/filter.gif)

Navigate from the tree view to a dependency's declaration in the editor.
![Filter](resources/readme/gifs/maven_tree_pom.gif)

### Scan after dependencies change
The JFrog VS-Code extension can trigger an Xray scan after a change in go.sum or package-lock.json.
This feature is disabled by default. You can enable it in the [Extension Settings](#extension-settings).

### Exclude Paths from Scan
By default, paths containing the words `test`, `venv` and `node_modules` are excluded from Xray scan.
The exclude pattern can be configured in the [Extension Settings](#extension-settings).

### Go Projects

Behind the scenes, the JFrog VS Code Extension scans all the project dependencies, both direct and indirect (transitive), even if they are not declared in the project's go.mod. It builds the Go dependencies tree by running `go mod graph`. Therefore, please make sure to have Go CLI in your system PATH.

### Maven Projects

#### Excluding transitive dependency in pom.xml
To exclude a transitive dependency from your project, click on the "Exclude dependency" button in the dependencies tree.
![Exclude_Maven](resources/readme/gifs/maven_exclude.gif)

#### Behind the Scenes
The JFrog VS Code Extension builds the Maven dependencies tree by running `mvn dependency:tree`. View licenses and top issue severities directly from the pom.xml.

Important notes:
1. To have your project dependencies scanned by JFrog Xray, make sure Maven is installed, and that the mvn command is in your system PATH.
2. For projects which include the [Maven Dependency Plugin](https://maven.apache.org/plugins/maven-dependency-plugin/examples/resolving-conflicts-using-the-dependency-tree.html) as a build plugin, with include or exclude configurations, the scanning functionality is disabled. For example:
```xml
      <plugins>
        <plugin>
          <groupId>org.apache.maven.plugins</groupId>
          <artifactId>maven-dependency-plugin</artifactId>
          <configuration>
            <includes>org.apache.*</includes>
          </configuration>
        </plugin>
      </plugins>
```

### Npm Projects
Behind the scenes, the extension builds the npm dependencies tree by running `npm list`. View licenses and top issue severities directly from the package.json.

Important:
To have your project dependencies scanned by JFrog Xray, make sure the npm CLI is installed on your local machine and that it is in your system PATH.
In addition, the project dependencies must be installed using `npm install`.

### Pypi Projects
Behind the scenes, the extension builds the Pypi dependencies tree by running `pipdeptree` on your Python virtual environment. It also uses the Python interpreter path configured by the [Python extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python). View licenses and top issue severities directly from your requirements.txt files. The scan your Pypi dependencies, make sure the following requirements are met:

1. The [Python extension for VS Code](https://code.visualstudio.com/docs/python/python-tutorial#_install-visual-studio-code-and-the-python-extension) is installed.
2. Depending on your project, Please make sure Python 2 or 3 are included in your system PATH.
3. Create and activate a virtual env as instructed in [VS-Code documentation](https://code.visualstudio.com/docs/python/environments#_global-virtual-and-conda-environments). Make sure that Virtualenv Python interpreter is selected as instructed [here](https://code.visualstudio.com/docs/python/environments#_select-and-activate-an-environment).
4. Open a new terminal and activate your Virtualenv:
    * On macOS and Linux:
      ```sh
      source <venv-dir>/bin/activate

      # For example:
      source .env/bin/activate
      ```
    * On Windows:
      ```powershell
      .\<venv-dir>\Scripts\activate

      # For example:
      .\env\Scripts\activate
      ```
5. In the same terminal, install your python project and dependencies according to your project specifications.

### .NET Projects
For .NET projects which use NuGet packages as dependencies, the extension displays the NuGet dependencies tree, together with the information for each dependency.  
Behind the scenes, the extension builds the NuGet dependencies tree using the [NuGet deps tree](https://github.com/jfrog/nuget-deps-tree) npm package.

Important:
- Does your project define its NuGet dependencies using a *packages.config* file? If so, then please make sure the `nuget` CLI is installed on your local machine and that it is in your system PATH. The extension uses the `nuget` CLI to find the location of the NuGet packages on the local file-system.
- The project must be restored using `nuget restore` or `dotnet restore` prior to scanning. After this action, you should click on the Refresh ![Refresh](resources/readme/refresh.png) button, for the tree view to be refreshed and updated.

## The CI View
The CI view of the extension allows you to view information about your builds directly from your CI system. This allows developers to keep track of the status of their code, while it is being built, tested and scanned as part of the CI pipeline, regardless of the CI provider used.

This information can be viewed inside JFrog VS Code Extension, from the JFrog Panel, after switching to CI mode.

The following details can be made available in the CI view.

- Status of the build run (passed or failed)
- Build run start time
- Git branch and latest commit message
- Link to the CI run log
- Security information about the build artifacts and dependencies

### How Does It Work?
The CI information displayed in VS Code is pulled by the JFrog Extension directly from JFrog Artifactory. This information is stored in Artifactory as part of the build-info, which is published to Artifactory by the CI server. 

Read more about build-info in the [Build Integration](https://www.jfrog.com/confluence/display/JFROG/Build+Integration) documentation page. If the CI pipeline is also configured to scan the build-info by JFrog Xray, the JFrog VS Code Extension will pull the results of the scan from JFrog Xray and display them in the CI view as well.

### Setting Up Your CI Pipeline
Before VS Code can display information from your CI in the CI View, your CI pipeline needs to be configured to expose this data. 
Read [this guide](https://www.jfrog.com/confluence/display/JFROG/Setting+Up+CI+Integration) which describes how to configure your CI pipeline.

### Setting Up the CI View
Set your CI build name in the Build name pattern field at the [Extension Settings](#extension-settings). This is the name of the build published to Artifactory by your CI pipeline. You have the option of setting * to view all the builds published to Artifactory.

After your builds were fetched from Artifactory, press on the Builds ![Builds](resources/light/build.png) button to choose what build to display.

![CI](resources/readme/gifs/ci.gif)

## Troubleshooting
View the extension log:
![Logs](resources/readme/gifs/logs.gif)

## License
The extension is licensed under [Apache License 2.0](LICENSE).

## Building and Testing the Sources
To build the extension sources, please follow these steps:

1. Clone the code from Github.
1. Build and create the VS-Code extension vsix file by running the following npm command.

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

## Code Contributions
We welcome community contribution through pull requests.

### Guidelines
- Before creating your first pull request, please join our contributors community by signing [JFrog's CLA](https://secure.echosign.com/public/hostedForm?formid=5IYKLZ2RXB543N).
- If the existing tests do not already cover your changes, please add tests.
- Pull requests should be created on the _dev_ branch.
- Please run `npm run format` for formatting the code before submitting the pull request.
