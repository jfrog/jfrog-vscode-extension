# JFrog Visual Studio Code Extension

[![Visual Studio Marketplace](https://vsmarketplacebadge.apphb.com/version/JFrog.jfrog-vscode-extension.svg)](https://marketplace.visualstudio.com/items?itemName=JFrog.jfrog-vscode-extension)

# Table of Contents

- [About this Extension](#about-this-extension)
  - [General](#general)
  - [Supported Features](#supported-features)
  - [Component Tree Icons](#component-tree-icons)
  - [Free Go Modules Security Scanning and Metadata from GoCenter](#free-go-modules-security-scanning-and-metadata-from-gocenter-deprecated)
- [Viewing and Updating Project Dependencies](#viewing-and-updating-project-dependencies)
- [General Configuration](#general-configuration)
  - [Configuring JFrog Xray](#configuring-jfrog-xray)
  - [Proxy Configuration](#proxy-configuration)
    - [Proxy Authorization](#proxy-authorization)
  - [Exclude Paths from Scan](#exclude-paths-from-scan)
  - [Scan after dependencies change](#scan-after-dependencies-change)
  - [Extension Settings](#extension-settings)
- [Go Projects](#go-projects)
- [Maven Projects](#maven-projects)
- [Npm Projects](#npm-projects)
- [Pypi Projects](#pypi-projects)
- [.NET Projects](#net-projects)
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

The JFrog VS Code Extension adds JFrog Xray scanning of project dependencies to your VS Code IDE.
It allows developers to view panels displaying vulnerability information about the components and their dependencies directly in their VS Code IDE.
With this information, a developer can make an informed decision on whether to use a component or not before it gets entrenched into the organization’s product.

Don't have JFrog Xray? [Start for free](https://jfrog.com/xray/start-free).

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

### Free Go Modules Security Scanning and Metadata from GoCenter (deprecated)
As of February 28, 2021, GoCenter has been sunset. This integration has been removed. Learn more: https://jfrog.com/blog/into-the-sunset-bintray-jcenter-gocenter-and-chartcenter/

## Viewing and Updating Project Dependencies
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

## General Configuration
### Configuring JFrog Xray
Connect to JFrog Xray by clicking on the green Connect ![Connect](resources/readme/connect.png) button:
![Connect](resources/readme/gifs/connect.gif)

The extension also support connecting to JFrog Xray using environment variables.

Note: For security reasons, it is recommended to unset the environment variables after launching VS Code.

- `JFROG_IDE_URL` - JFrog Xray URL
- `JFROG_IDE_USERNAME` - JFrog Xray username
- `JFROG_IDE_PASSWORD` - JFrog Xray password
- `JFROG_IDE_STORE_CONNECTION` - Set the value of this environment variable to **true**, if you'd like VS Code to store the connection details after reading them from the environment variables.

### Proxy Configuration
If your JFrog Xray instance is behind an HTTP/S proxy, follow these steps to configure the proxy server:

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

### Scan after dependencies change
The JFrog VS-Code extension can trigger an Xray scan after a change in go.sum or package-lock.json.
This feature is disabled by default. You can enable it in the [Extension Settings](#extension-settings).

### Exclude Paths from Scan
By default, paths containing the words `test`, `venv` and `node_modules` are excluded from Xray scan.
The exclude pattern can be configured in the [Extension Settings](#extension-settings).

### Extension Settings
To open the extension settings, use the following VS Code menu command:

- On Windows/Linux - File > Preferences > Settings > Extensions > JFrog
- On macOS - Code > Preferences > Settings > Extensions > JFrog

## Go Projects

Behind the scenes, the JFrog VS Code Extension scans all the project dependencies, both direct and indirect (transitive), even if they are not declared in the project's go.mod. It builds the Go dependencies tree by running `go mod graph`. Therefore, please make sure to have Go CLI in your system PATH.

## Maven Projects

### Excluding transitive dependency in pom.xml
To exclude a transitive dependency from your project, click on the "Exclude dependency" button in the dependencies tree.
![Exclude_Maven](resources/readme/gifs/maven_exclude.gif)

### Behind the Scenes
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

## Npm Projects
Behind the scenes, the extension builds the npm dependencies tree by running `npm list`. View licenses and top issue severities directly from the package.json.

Important:
To have your project dependencies scanned by JFrog Xray, make sure the npm CLI is installed on your local machine and that it is in your system PATH.
In addition, the project dependencies must be installed using `npm install`.

## Pypi Projects
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

## .NET Projects
For .NET projects which use NuGet packages as dependencies, the extension displays the NuGet dependencies tree, together with the information for each dependency.  
Behind the scenes, the extension builds the NuGet dependencies tree using the [NuGet deps tree](https://github.com/jfrog/nuget-deps-tree) npm package.

Important:
- Does your project define its NuGet dependencies using a *packages.config* file? If so, then please make sure the `nuget` CLI is installed on your local machine and that it is in your system PATH. The extension uses the `nuget` CLI to find the location of the NuGet packages on the local file-system.
- The project must be restored using `nuget restore` or `dotnet restore` prior to scanning. After this action, you should click on the Refresh ![Refresh](resources/readme/refresh.png) button, for the tree view to be refreshed and updated.

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
