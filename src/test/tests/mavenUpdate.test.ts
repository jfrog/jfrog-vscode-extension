import { assert } from 'chai';
import * as path from 'path';
import * as vscode from 'vscode';
// import * as exec from 'child_process';

import * as fs from 'fs-extra';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { GeneralInfo } from '../../main/types/generalInfo';
import { MavenUtils } from '../../main/utils/mavenUtils';
import { PackageType } from '../../main/types/projectType';
import { MavenDependencyUpdate } from '../../main/dependencyUpdate/mavenDependencyUpdate';
import { DependencyIssuesTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/dependencyIssuesTreeNode';
import { ProjectDependencyTreeNode } from '../../main/treeDataProviders/issuesTree/descriptorTree/projectDependencyTreeNode';
import { IComponent } from 'jfrog-client-js';
import { IssuesRootTreeNode } from '../../main/treeDataProviders/issuesTree/issuesRootTreeNode';
import { ScanUtils } from '../../main/utils/scanUtils';
import { CacheManager } from '../../main/cache/cacheManager';
import { ScanCacheManager } from '../../main/cache/scanCacheManager';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';
import { ScanManager } from '../../main/scanLogic/scanManager';
import { TreesManager } from '../../main/treeDataProviders/treesManager';
import { createScanCacheManager } from './utils/utils.test';


    describe('Maven - Update to fixed version', async () => {

        let logManager: LogManager = new LogManager().activate();
        let dummyScanCacheManager: ScanCacheManager = createScanCacheManager();
        let treesManager: TreesManager = new TreesManager(
            [],
            new ConnectionManager(logManager),
            dummyScanCacheManager,
            {} as ScanManager,
            {} as CacheManager,
            logManager
        );
        const expectedVersion: string = '3.0.16';

        before(function() {
            // Install maven dependencies
            // exec.execSync('mvn clean install', { cwd: path.join(__dirname, '..', 'resources', 'maven','updateToFixVersionProjects', 'updateParentPomProperty') });
            // MavenUtils.installMavenGavReader();
        });
        it('Without version property', async () => {
            const [mavenDependencyUpdate, issueToUpdate, pomXmlPath] = await setupTestEnvironment('updatePom');

            // Operate the test
            mavenDependencyUpdate.update(issueToUpdate, expectedVersion);

            // Check results
            const fileContent: string = fs.readFileSync(pomXmlPath, 'utf-8');
            assert.include(fileContent, `<version>${expectedVersion}</version>`);
            assert.isFalse(fs.existsSync(path.join(__dirname, '..', 'resources', 'maven','updateToFixVersionProjects', 'updatePom', 'pom.xml.versionsBackup')));
        });

        it('With property', async () => {
            const [mavenDependencyUpdate, issueToUpdate, pomXmlPath] = await setupTestEnvironment('updatePomProperty');

            // Operate the test
            mavenDependencyUpdate.update(issueToUpdate, expectedVersion);

            // Check results
            const fileContent: string = fs.readFileSync(pomXmlPath, 'utf-8');
            assert.include(fileContent, `<lets.go.and.fix.this>${expectedVersion}</lets.go.and.fix.this>`);
            assert.isFalse(
                fs.existsSync(path.join(__dirname, '..', 'resources', 'maven','updateToFixVersionProjects', 'updatePomProperty', 'pom.xml.versionsBackup'))
            );
        });

        it('Multi module with property', async () => {
            const [mavenDependencyUpdate, issueToUpdate, pomXmlPath] = await setupMultiModuleTestEnvironment(
                path.join('updateParentPomProperty', 'multi1'),
                'updateParentPomProperty'
            );

            // Operate the test
            mavenDependencyUpdate.update(issueToUpdate, expectedVersion);

            // Check results
            const fileContent: string = fs.readFileSync(pomXmlPath, 'utf-8');
            assert.include(fileContent, `<lets.go.and.fix.this>${expectedVersion}</lets.go.and.fix.this>`);
            assert.isFalse(
                fs.existsSync(path.join(__dirname, '..', 'resources', 'maven','updateToFixVersionProjects', 'updateParentPomProperty', 'pom.xml.versionsBackup'))
            );
        });

    async function setupTestEnvironment(projectDir: string): Promise<[MavenDependencyUpdate, DependencyIssuesTreeNode, string]> {
        const mavenDependencyUpdate: MavenDependencyUpdate = new MavenDependencyUpdate();
        const pomXmlPath: string = path.join(__dirname, '..', 'resources', 'maven','updateToFixVersionProjects', projectDir, 'pom.xml');

        const localWorkspaceFolders: vscode.WorkspaceFolder[] = [
            {
                uri: vscode.Uri.file(path.join(__dirname, '..', 'resources', 'maven','updateToFixVersionProjects', projectDir)),
                name: '',
                index: 0
            } as vscode.WorkspaceFolder
        ];

        const pomXmlsArray: vscode.Uri[] | undefined = await locatePomXmls(localWorkspaceFolders);

        const parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', [], '', PackageType.Unknown));

        await MavenUtils.createDependenciesTrees(pomXmlsArray, treesManager.logManager, () => undefined, parent);

        const issueToUpdate: DependencyIssuesTreeNode = new DependencyIssuesTreeNode(
            'artifactId',
            { package_type: 'MAVEN', package_name: 'org.codehaus.plexus:plexus-utils', package_version: '1.5' } as IComponent,
            false,
            new ProjectDependencyTreeNode(pomXmlPath)
        );
        return [mavenDependencyUpdate, issueToUpdate, pomXmlPath];
    }

    async function setupMultiModuleTestEnvironment(
        pomDir: string,
        parentPomDir: string
    ): Promise<[MavenDependencyUpdate, DependencyIssuesTreeNode, string]> {
        const mavenDependencyUpdate: MavenDependencyUpdate = new MavenDependencyUpdate();
        const pomXmlPath: string = path.join(__dirname, '..', 'resources', 'maven','updateToFixVersionProjects', pomDir, 'pom.xml');
        const parentPomXmlPath: string = path.join(__dirname, '..', 'resources', 'maven','updateToFixVersionProjects', parentPomDir, 'pom.xml');

        const localWorkspaceFolders: vscode.WorkspaceFolder[] = [
            {
                uri: vscode.Uri.file(path.join(__dirname, '..', 'resources', 'maven','updateToFixVersionProjects', parentPomDir)),
                name: '',
                index: 0
            } as vscode.WorkspaceFolder
        ];

        const pomXmlsArray: vscode.Uri[] | undefined = await locatePomXmls(localWorkspaceFolders);

        const parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', [], '', PackageType.Unknown));

        await MavenUtils.createDependenciesTrees(pomXmlsArray, treesManager.logManager, () => undefined, parent);

        const projectRoot: IssuesRootTreeNode = new IssuesRootTreeNode({
            uri: localWorkspaceFolders[0].uri
        } as vscode.WorkspaceFolder);

        const VulnerablePom: ProjectDependencyTreeNode = new ProjectDependencyTreeNode(pomXmlPath, PackageType.Maven);
        const ParentPomOfVulnerablePom: ProjectDependencyTreeNode = new ProjectDependencyTreeNode(parentPomXmlPath, PackageType.Maven);
        projectRoot.addChild(VulnerablePom);
        projectRoot.addChild(ParentPomOfVulnerablePom);
        const issueToUpdate: DependencyIssuesTreeNode = new DependencyIssuesTreeNode(
            'artifactId',
            { package_type: 'MAVEN', package_name: 'org.codehaus.plexus:plexus-utils', package_version: '1.5' } as IComponent,
            false,
            VulnerablePom
        );
        return [mavenDependencyUpdate, issueToUpdate, parentPomXmlPath];

    }
    async function locatePomXmls(workspaceFolders: vscode.WorkspaceFolder[]): Promise<vscode.Uri[] | undefined> {
        let packageDescriptors: Map<PackageType, vscode.Uri[]> = await ScanUtils.locatePackageDescriptors(workspaceFolders, treesManager.logManager);
        let pomXmlsArray: vscode.Uri[] | undefined = packageDescriptors.get(PackageType.Maven);
        assert.isDefined(pomXmlsArray);
        pomXmlsArray = pomXmlsArray?.sort((a: vscode.Uri, b: vscode.Uri) => a.fsPath.localeCompare(b.fsPath));
        return pomXmlsArray;
    }
});
