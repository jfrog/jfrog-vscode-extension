import { assert } from 'chai';
import * as exec from 'child_process';
import { before } from 'mocha';
import * as path from 'path';
import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ComponentDetails } from 'xray-client-js';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';
import { ScanCacheManager } from '../../main/scanCache/scanCacheManager';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../../main/treeDataProviders/treesManager';
import { GavGeneralInfo } from '../../main/types/gavGeneralinfo';
import { GeneralInfo } from '../../main/types/generalInfo';
import { MavenUtils } from '../../main/utils/mavenUtils';
import { PomTree } from '../../main/utils/pomTree';
import { MavenTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesRoot/mavenTree';
import { MavenExclusion } from '../../main/exclusions/mavenExclusion';

/**
 * Test functionality of Maven.
 */
describe('Maven Tests', () => {
    let logManager: LogManager = new LogManager().activate({} as vscode.ExtensionContext);
    let dummyScanCacheManager: ScanCacheManager = new ScanCacheManager().activate({
        workspaceState: { get(key: string) {} } as vscode.Memento
    } as vscode.ExtensionContext);
    let treesManager: TreesManager = new TreesManager([], new ConnectionManager(logManager), dummyScanCacheManager, logManager);
    let mavenExclusion: MavenExclusion = new MavenExclusion(treesManager);
    let projectDirs: string[] = ['dependency', 'empty', 'multiPomDependency'];
    let workspaceFolders: vscode.WorkspaceFolder[];
    let tmpDir: vscode.Uri = vscode.Uri.file(path.join(__dirname, '..', 'resources', 'maven'));

    before(function() {
        workspaceFolders = [
            {
                uri: tmpDir,
                name: 'pom.xml-test',
                index: 0
            } as vscode.WorkspaceFolder
        ];
        // Install maven dependencies
        exec.execSync('mvn clean install', { cwd: path.join(__dirname, '..', 'resources', 'maven', 'multiPomDependency') });
        MavenUtils.installMavenGavReader();
    });

    /**
     * Test locatePomXml.
     */
    it('Locate pom.xml', async () => {
        let pomXmls: vscode.Uri[] = await MavenUtils.locatePomXmls(workspaceFolders, treesManager.logManager);
        assert.strictEqual(pomXmls.length, 6);

        // Assert that results contains all projects
        for (let expectedProjectDir of projectDirs) {
            let expectedPomXml: string = path.join(tmpDir.fsPath, expectedProjectDir, 'pom.xml');
            assert.isTrue(!!pomXmls.find(el => el.fsPath === expectedPomXml), 'Should contain ' + expectedPomXml);
        }
    });

    /**
     * Test getParentInfo.
     * Get parent info from pom.xml.
     */
    it('Get pom.xml details', async () => {
        let pomIdCache: Map<string, [string, string]> = new Map<string, [string, string]>();
        let pomXml: vscode.Uri = vscode.Uri.file(path.join(tmpDir.fsPath, 'multiPomDependency', 'multi1', 'pom.xml'));
        let [pomGav, parentGav]: string[] = MavenUtils.getPomDetails(pomXml.fsPath, treesManager.logManager, pomIdCache);
        assert.equal(pomGav, 'org.jfrog.test:multi1:3.7-SNAPSHOT');
        assert.equal(parentGav, 'org.jfrog.test:multi:3.7-SNAPSHOT');

        pomXml = vscode.Uri.file(path.join(tmpDir.fsPath, 'multiPomDependency', 'pom.xml'));
        [pomGav, parentGav] = MavenUtils.getPomDetails(pomXml.fsPath, treesManager.logManager, pomIdCache);
        assert.equal(pomGav, 'org.jfrog.test:multi:3.7-SNAPSHOT');
        assert.isEmpty(parentGav);
    });

    /**
     * Test buildPrototypePomTree.
     * create Prototype Pom Tree from pom.xml list .
     */
    it('Build Prototype Pom Tree', async () => {
        // Single pom
        let localWorkspaceFolders: vscode.WorkspaceFolder[] = [
            {
                uri: vscode.Uri.file(path.join(__dirname, '..', 'resources', 'maven', 'dependency')),
                name: '',
                index: 0
            } as vscode.WorkspaceFolder
        ];
        let pomXmlsArray: vscode.Uri[] = await MavenUtils.locatePomXmls(localWorkspaceFolders, treesManager.logManager);
        let got: PomTree[] = MavenUtils.buildPrototypePomTree(pomXmlsArray, treesManager.logManager);
        let want: PomTree[][] = expectedBuildPrototypePomTree();
        assert.deepEqual(got, want[0]);

        //Multi pom
        localWorkspaceFolders = [
            {
                uri: vscode.Uri.file(path.join(__dirname, '..', 'resources', 'maven', 'multiPomDependency')),
                name: '',
                index: 0
            } as vscode.WorkspaceFolder
        ];
        pomXmlsArray = await MavenUtils.locatePomXmls(localWorkspaceFolders, treesManager.logManager);
        got = MavenUtils.buildPrototypePomTree(pomXmlsArray, treesManager.logManager);
        assert.deepEqual(got, want[1]);
    });

    /**
     * Test getProjectInfo.
     */
    it('Get Project Info', async () => {
        const [groupId, ArtifactId, version] = MavenUtils.getProjectInfo(' org.jfrog.test:multi2:jar:3.7-SNAPSHOT');
        assert.equal(groupId, 'org.jfrog.test');
        assert.equal(ArtifactId, 'multi2');
        assert.equal(version, '3.7-SNAPSHOT');
    });

    /**
     * Test getDependencyInfo.
     */
    it('Get dependency Info', async () => {
        const [groupId, ArtifactId, version] = MavenUtils.getDependencyInfo('org.testng:testng:jar:jdk15:5.9:test');
        assert.equal(groupId, 'org.testng');
        assert.equal(ArtifactId, 'testng');
        assert.equal(version, '5.9');
    });

    /**
     * Test getDependenciesPos.
     * Locate 'dependencies' element in pom.xml editor, in order to locate 'xray scan' codelens.
     */
    it('Get dependencies position', async () => {
        // Test 'resources/maven/multiPomDependency/pom.xml'
        let pomXml: vscode.Uri = vscode.Uri.file(path.join(tmpDir.fsPath, 'dependency', 'pom.xml'));
        let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(pomXml);
        let dependenciesPos: vscode.Position[] = MavenUtils.getDependenciesPos(textDocument);
        assert.deepEqual(dependenciesPos[0], new vscode.Position(7, 4));

        // Test 'resources/maven/empty/pom.xml'
        pomXml = vscode.Uri.file(path.join(tmpDir.fsPath, 'empty', 'pom.xml'));
        textDocument = await vscode.workspace.openTextDocument(pomXml);
        dependenciesPos = MavenUtils.getDependenciesPos(textDocument);
        assert.isEmpty(dependenciesPos);
    });

    /**
     * Test getDependencyPos.
     * Locate 'groupId', 'artifactId' & 'version' in pom.xml regardless the order.
     */
    it('Get dependency position', async () => {
        // Test 'resources/maven/dependency/pom.xml'
        let pomXml: vscode.Uri = vscode.Uri.file(path.join(tmpDir.fsPath, 'dependency', 'pom.xml'));
        let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(pomXml);
        let dependenciesTreeNode: DependenciesTreeNode = new DependenciesTreeNode(new GavGeneralInfo('javax.servlet.jsp', 'jsp-api', '2.1', '', ''));
        let dependencyPos: vscode.Position[] = MavenUtils.getDependencyPos(textDocument, dependenciesTreeNode);
        assert.deepEqual(dependencyPos[0], new vscode.Position(9, 12));
        assert.deepEqual(dependencyPos[1], new vscode.Position(9, 48));
        assert.deepEqual(dependencyPos[2], new vscode.Position(10, 12));
        assert.deepEqual(dependencyPos[3], new vscode.Position(10, 44));
        assert.deepEqual(dependencyPos[4], new vscode.Position(11, 12));
        assert.deepEqual(dependencyPos[5], new vscode.Position(11, 34));

        pomXml = vscode.Uri.file(path.join(tmpDir.fsPath, 'multiPomDependency', 'multi1', 'pom.xml'));
        textDocument = await vscode.workspace.openTextDocument(pomXml);
        dependenciesTreeNode = new DependenciesTreeNode(new GavGeneralInfo('org.apache.commons', 'commons-email', '1.1', '', ''));
        dependencyPos = MavenUtils.getDependencyPos(textDocument, dependenciesTreeNode);
        assert.deepEqual(dependencyPos[0], new vscode.Position(51, 12));
        assert.deepEqual(dependencyPos[1], new vscode.Position(51, 49));
        assert.deepEqual(dependencyPos[2], new vscode.Position(52, 12));
        assert.deepEqual(dependencyPos[3], new vscode.Position(52, 50));
        assert.deepEqual(dependencyPos[4], new vscode.Position(53, 12));
        assert.deepEqual(dependencyPos[5], new vscode.Position(53, 34));

        dependenciesTreeNode = new DependenciesTreeNode(new GavGeneralInfo('org.codehaus.plexus', 'plexus-utils', '1.5.1', '', ''));
        dependencyPos = MavenUtils.getDependencyPos(textDocument, dependenciesTreeNode);
        assert.deepEqual(dependencyPos[0], new vscode.Position(57, 12));
        assert.deepEqual(dependencyPos[1], new vscode.Position(57, 50));
        assert.deepEqual(dependencyPos[2], new vscode.Position(58, 12));
        assert.deepEqual(dependencyPos[3], new vscode.Position(58, 49));
        assert.deepEqual(dependencyPos[4], new vscode.Position(59, 12));
        assert.deepEqual(dependencyPos[5], new vscode.Position(59, 36));

        dependenciesTreeNode = new DependenciesTreeNode(new GavGeneralInfo('javax.servlet.jsp', 'jsp-api', '2.1', '', ''));
        dependencyPos = MavenUtils.getDependencyPos(textDocument, dependenciesTreeNode);
        assert.deepEqual(dependencyPos[0], new vscode.Position(62, 12));
        assert.deepEqual(dependencyPos[1], new vscode.Position(62, 48));
        assert.deepEqual(dependencyPos[2], new vscode.Position(63, 12));
        assert.deepEqual(dependencyPos[3], new vscode.Position(63, 44));
        assert.deepEqual(dependencyPos[4], new vscode.Position(65, 12));
        assert.deepEqual(dependencyPos[5], new vscode.Position(65, 34));

        dependenciesTreeNode = new DependenciesTreeNode(new GavGeneralInfo('commons-io', 'commons-io', '1.4', '', ''));
        dependencyPos = MavenUtils.getDependencyPos(textDocument, dependenciesTreeNode);
        assert.deepEqual(dependencyPos[0], new vscode.Position(68, 12));
        assert.deepEqual(dependencyPos[1], new vscode.Position(68, 41));
        assert.deepEqual(dependencyPos[2], new vscode.Position(69, 12));
        assert.deepEqual(dependencyPos[3], new vscode.Position(69, 47));
        assert.deepEqual(dependencyPos[4], new vscode.Position(70, 12));
        assert.deepEqual(dependencyPos[5], new vscode.Position(70, 34));

        dependenciesTreeNode = new DependenciesTreeNode(new GavGeneralInfo('org.springframework', 'spring-aop', '2.5.6', '', ''));
        dependencyPos = MavenUtils.getDependencyPos(textDocument, dependenciesTreeNode);
        assert.deepEqual(dependencyPos[0], new vscode.Position(73, 12));
        assert.deepEqual(dependencyPos[1], new vscode.Position(73, 50));
        assert.deepEqual(dependencyPos[2], new vscode.Position(74, 12));
        assert.deepEqual(dependencyPos[3], new vscode.Position(74, 36));
        assert.deepEqual(dependencyPos[4], new vscode.Position(75, 12));
        assert.deepEqual(dependencyPos[5], new vscode.Position(75, 47));

        // Test 'resources/maven/empty/pom.xml'
        pomXml = vscode.Uri.file(path.join(tmpDir.fsPath, 'empty', 'pom.xml'));
        textDocument = await vscode.workspace.openTextDocument(pomXml);
        dependencyPos = MavenUtils.getDependencyPos(textDocument, dependenciesTreeNode);
        assert.isEmpty(dependencyPos);
    });

    /**
     * Test createMavenDependenciesTrees.
     */
    it('Create Maven dependencies trees', async () => {
        let parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', '', ''));
        let componentsToScan: Collections.Set<ComponentDetails> = new Collections.Set();
        let res: DependenciesTreeNode[] = await runCreateMavenDependenciesTrees(componentsToScan, parent);
        let toCompare: string[] = [
            'gav://aopalliance:aopalliance:1.0',
            'gav://commons-io:commons-io:1.4',
            'gav://commons-logging:commons-logging:1.1.1',
            'gav://hsqldb:hsqldb:1.8.0.10',
            'gav://javax.activation:activation:1.1',
            'gav://javax.mail:mail:1.4',
            'gav://javax.servlet:servlet-api:2.5',
            'gav://javax.servlet.jsp:jsp-api:2.1',
            'gav://junit:junit:3.8.1',
            'gav://org.apache.commons:commons-email:1.1',
            'gav://org.codehaus.plexus:plexus-utils:1.5.1',
            'gav://org.jfrog.test:multi1:3.7-SNAPSHOT',
            'gav://org.springframework:spring-aop:2.5.6',
            'gav://org.springframework:spring-beans:2.5.6',
            'gav://org.springframework:spring-core:2.5.6',
            'gav://org.testng:testng:5.9'
        ];
        const componentArray: ComponentDetails[] = componentsToScan
            .toArray()
            .sort((a: ComponentDetails, b: ComponentDetails) => a.component_id.localeCompare(b.component_id));
        // Check that components to scan contains progress:2.0.3
        for (let i: number = 0; i < componentsToScan.size(); i++) {
            assert.deepEqual(componentArray[i], new ComponentDetails(toCompare[i]));
        }
        // Check multi pom tree
        // Check node
        assert.deepEqual(res[0].label, 'org.jfrog.test:multi');
        assert.deepEqual(res[0].componentId, 'org.jfrog.test:multi:3.7-SNAPSHOT');
        assert.isTrue(res[0] instanceof MavenTreeNode);

        // Check parents
        assert.deepEqual(res[0].parent, parent);

        // Check children
        assert.lengthOf(res[0].children, 3);
        assert.lengthOf(res[0].children[0].children, 0);
        assert.deepEqual(res[0].children[0].parent, res[0]);
        assert.equal(res[0].children[0].componentId, 'junit:junit:3.8.1');
        assert.isTrue(res[0].children[0] instanceof DependenciesTreeNode);
        assert.lengthOf(res[0].children[2].children, 3);
        assert.deepEqual(res[0].children[2].parent, res[0]);
        assert.equal(res[0].children[2].componentId, 'org.jfrog.test:multi3:3.7-SNAPSHOT');
        assert.isTrue(res[0].children[2] instanceof MavenTreeNode);

        assert.lengthOf(res[0].children[1].children, 6);
        assert.deepEqual(res[0].children[1].parent, res[0]);
        assert.equal(res[0].children[1].componentId, 'org.jfrog.test:multi1:3.7-SNAPSHOT');
        assert.isTrue(res[0].children[1] instanceof MavenTreeNode);

        // Check grandchildren
        // First
        assert.equal(res[0].children[2].children[0].componentId, 'org.jfrog.test:multi1:3.7-SNAPSHOT');
        assert.isTrue(res[0].children[2].children[0] instanceof DependenciesTreeNode);
        assert.deepEqual(res[0].children[2].children[0].parent, res[0].children[2]);
        assert.equal(res[0].children[2].children[1].componentId, 'hsqldb:hsqldb:1.8.0.10');
        assert.isTrue(res[0].children[2].children[1] instanceof DependenciesTreeNode);
        assert.deepEqual(res[0].children[2].children[1].parent, res[0].children[2]);
        assert.equal(res[0].children[2].children[2].componentId, 'javax.servlet:servlet-api:2.5');
        assert.isTrue(res[0].children[2].children[2] instanceof DependenciesTreeNode);
        assert.deepEqual(res[0].children[2].children[2].parent, res[0].children[2]);

        // Third
        assert.equal(res[0].children[1].children[0].componentId, 'org.apache.commons:commons-email:1.1');
        assert.isTrue(res[0].children[1].children[0] instanceof DependenciesTreeNode);
        assert.deepEqual(res[0].children[1].children[0].parent, res[0].children[1]);
        assert.equal(res[0].children[1].children[1].componentId, 'org.codehaus.plexus:plexus-utils:1.5.1');
        assert.isTrue(res[0].children[1].children[1] instanceof DependenciesTreeNode);
        assert.deepEqual(res[0].children[1].children[1].parent, res[0].children[1]);
        assert.equal(res[0].children[1].children[2].componentId, 'javax.servlet.jsp:jsp-api:2.1');
        assert.isTrue(res[0].children[1].children[2] instanceof DependenciesTreeNode);
        assert.deepEqual(res[0].children[1].children[2].parent, res[0].children[1]);
        assert.equal(res[0].children[1].children[3].componentId, 'commons-io:commons-io:1.4');
        assert.isTrue(res[0].children[1].children[3] instanceof DependenciesTreeNode);
        assert.deepEqual(res[0].children[1].children[3].parent, res[0].children[1]);
        assert.equal(res[0].children[1].children[4].componentId, 'org.springframework:spring-aop:2.5.6');
        assert.isTrue(res[0].children[1].children[4] instanceof DependenciesTreeNode);
        assert.deepEqual(res[0].children[1].children[4].parent, res[0].children[1]);
        assert.equal(res[0].children[1].children[5].componentId, 'org.testng:testng:5.9');
        assert.isTrue(res[0].children[1].children[5] instanceof DependenciesTreeNode);
        assert.deepEqual(res[0].children[1].children[5].parent, res[0].children[1]);
    });

    /**
     * Test excludeDependency.
     */
    it('Exclude dependency', async () => {
        let parent: DependenciesTreeNode = new DependenciesTreeNode(new GeneralInfo('parent', '1.0.0', '', ''));
        let componentsToScan: Collections.Set<ComponentDetails> = new Collections.Set();
        let res: DependenciesTreeNode[] = await runCreateMavenDependenciesTrees(componentsToScan, parent);

        // Read two nodes from tree
        let node1: DependenciesTreeNode = res[0]?.children[1]?.children[0]?.children[0];
        let node2: DependenciesTreeNode = res[0]?.children[1]?.children[0]?.children[1];
        assert.isDefined(node1);
        assert.isDefined(node2);

        // Exclude node 1 from tree
        await mavenExclusion.excludeDependency(node1);

        // Assert that node 1 is removed from tree
        let directParent: DependenciesTreeNode = res[0]?.children[1]?.children[0];
        assert.equal(1, directParent.children.length);
        assert.equal(directParent.children[0].generalInfo.artifactId, node2.generalInfo.artifactId);

        // Run scan again to verify correctness of the tree
        res = await runCreateMavenDependenciesTrees(componentsToScan, parent);
        directParent = res[0]?.children[1]?.children[0];
        assert.equal(1, directParent.children.length);
        assert.equal(directParent.children[0].generalInfo.artifactId, node2.generalInfo.artifactId);
    });

    async function runCreateMavenDependenciesTrees(componentsToScan: Collections.Set<ComponentDetails>, parent: DependenciesTreeNode) {
        let dependenciesTrees: DependenciesTreeNode[] = await MavenUtils.createMavenDependenciesTrees(
            workspaceFolders,
            componentsToScan,
            treesManager,
            parent,
            false
        );
        return dependenciesTrees.sort((lhs, rhs) => (<string>lhs.label).localeCompare(<string>rhs.label));
    }

    function expectedBuildPrototypePomTree(): PomTree[][] {
        return [
            [new PomTree('org.jfrog.test:multi2:3.7-SNAPSHOT', path.join(__dirname, '..', 'resources', 'maven', 'dependency'))],
            [
                new PomTree('org.jfrog.test:multi:3.7-SNAPSHOT', path.join(__dirname, '..', 'resources', 'maven', 'multiPomDependency'), [
                    new PomTree(
                        'org.jfrog.test:multi1:3.7-SNAPSHOT',
                        path.join(__dirname, '..', 'resources', 'maven', 'multiPomDependency', 'multi1'),
                        [],
                        undefined,
                        'org.jfrog.test:multi:3.7-SNAPSHOT'
                    ),
                    new PomTree(
                        'org.jfrog.test:multi2:3.7-SNAPSHOT',
                        path.join(__dirname, '..', 'resources', 'maven', 'multiPomDependency', 'multi2'),
                        [],
                        undefined,
                        'org.jfrog.test:multi:3.7-SNAPSHOT'
                    ),
                    new PomTree(
                        'org.jfrog.test:multi3:3.7-SNAPSHOT',
                        path.join(__dirname, '..', 'resources', 'maven', 'multiPomDependency', 'multi3'),
                        [],
                        undefined,
                        'org.jfrog.test:multi:3.7-SNAPSHOT'
                    )
                ])
            ]
        ];
    }
});
