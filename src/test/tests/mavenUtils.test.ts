import { before } from 'mocha';
import * as path from 'path';
import * as Collections from 'typescript-collections';
import * as vscode from 'vscode';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';
import { ScanCacheManager } from '../../main/scanCache/scanCacheManager';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../../main/treeDataProviders/treesManager';
import { MavenUtils, PomTree } from '../../main/utils/mavenUtils';
import { assert } from 'chai';
import { ComponentDetails } from 'xray-client-js';
import { GavGeneralInfo } from '../../main/types/gavGeneralinfo';
import { GeneralInfo } from '../../main/types/generalInfo';
import { MavenTreeNode } from '../../main/treeDataProviders/dependenciesTree/mavenTreeNode';

/**
 * Test functionality of @class NpmUtils.
 */
describe('Maven Utils Tests', () => {
    let dummyScanCacheManager: ScanCacheManager = new ScanCacheManager().activate({
        workspaceState: { get(key: string) {} } as vscode.Memento
    } as vscode.ExtensionContext);
    let treesManager: TreesManager = new TreesManager(
        [],
        new ConnectionManager(),
        dummyScanCacheManager,
        new LogManager().activate({} as vscode.ExtensionContext)
    );
    let dummyProgress: vscode.Progress<{ message?: string; increment?: number }> = { report: () => {} };
    let projectDirs: string[] = ['dependency', 'empty', 'multiPomDependency'];
    let workspaceFolders: vscode.WorkspaceFolder[];
    let tmpDir: vscode.Uri = vscode.Uri.file(path.join(__dirname, '..', 'resources', 'maven'));

    before(() => {
        workspaceFolders = [
            {
                uri: tmpDir,
                name: 'pom.xml-test',
                index: 0
            } as vscode.WorkspaceFolder
        ];
    });

    /**
     * Test MavenUtils.locatePomXml.
     */
    it('Locate pom.xml', async () => {
        let pomXmls: vscode.Uri[] = await MavenUtils.locatePomXmls(workspaceFolders, dummyProgress);
        assert.strictEqual(pomXmls.length, 6);

        // Assert that results contains all projects
        for (let expectedProjectDir of projectDirs) {
            let expectedPomXml: string = path.join(tmpDir.fsPath, expectedProjectDir, 'pom.xml');
            assert.isTrue(!!pomXmls.find(el => el.fsPath === expectedPomXml), 'Should contain ' + expectedPomXml);
        }
    });

    /**
     * Test MavenUtils.getRawDependenciesList.
     * Validate the output from 'mvn dependency:tree' command
     */
    it('Get Raw Dependencies List', async () => {
        let pathToPomXml: vscode.Uri = vscode.Uri.file(path.join(tmpDir.fsPath, 'multiPomDependency'));
        let rawDependenciesList: string[] = MavenUtils.getRawDependenciesList(pathToPomXml.fsPath, treesManager);
        assert.equal(
            rawDependenciesList[0],
            ' --- maven-dependency-plugin:2.8:tree (default-cli) @ multi ---\n org.jfrog.test:multi:pom:3.7-SNAPSHOT\n \\- junit:junit:jar:3.8.1:test\n'
        );
        assert.equal(
            rawDependenciesList[1],
            ' --- maven-dependency-plugin:2.8:tree (default-cli) @ multi1 ---\n' +
                ' org.jfrog.test:multi1:jar:3.7-SNAPSHOT\n' +
                ' +- org.apache.commons:commons-email:jar:1.1:compile\n' +
                ' |  +- javax.mail:mail:jar:1.4:compile\n' +
                ' |  \\- javax.activation:activation:jar:1.1:compile\n' +
                ' +- org.codehaus.plexus:plexus-utils:jar:1.5.1:compile\n' +
                ' +- javax.servlet.jsp:jsp-api:jar:2.1:compile\n' +
                ' +- commons-io:commons-io:jar:1.4:compile\n' +
                ' +- org.springframework:spring-aop:jar:2.5.6:compile\n' +
                ' |  +- aopalliance:aopalliance:jar:1.0:compile\n' +
                ' |  +- commons-logging:commons-logging:jar:1.1.1:compile\n' +
                ' |  +- org.springframework:spring-beans:jar:2.5.6:compile\n' +
                ' |  \\- org.springframework:spring-core:jar:2.5.6:compile\n' +
                ' +- org.testng:testng:jar:jdk15:5.9:test\n' +
                ' \\- junit:junit:jar:3.8.1:test\n'
        );
        assert.equal(
            rawDependenciesList[2],
            ' --- maven-dependency-plugin:2.8:tree (default-cli) @ multi2 ---\n' +
                ' org.jfrog.test:multi2:jar:3.7-SNAPSHOT\n' +
                ' \\- junit:junit:jar:3.8.1:test\n'
        );
        assert.equal(
            rawDependenciesList[3],
            ' --- maven-dependency-plugin:2.8:tree (default-cli) @ multi3 ---\n' +
                ' org.jfrog.test:multi3:war:3.7-SNAPSHOT\n' +
                ' +- org.jfrog.test:multi1:jar:3.7-SNAPSHOT:compile\n' +
                ' |  +- org.apache.commons:commons-email:jar:1.1:compile\n' +
                ' |  |  +- javax.mail:mail:jar:1.4:compile\n' +
                ' |  |  \\- javax.activation:activation:jar:1.1:compile\n' +
                ' |  +- org.codehaus.plexus:plexus-utils:jar:1.5.1:compile\n' +
                ' |  +- javax.servlet.jsp:jsp-api:jar:2.1:compile\n' +
                ' |  +- commons-io:commons-io:jar:1.4:compile\n' +
                ' |  \\- org.springframework:spring-aop:jar:2.5.6:compile\n' +
                ' |     +- aopalliance:aopalliance:jar:1.0:compile\n' +
                ' |     +- commons-logging:commons-logging:jar:1.1.1:compile\n' +
                ' |     +- org.springframework:spring-beans:jar:2.5.6:compile\n' +
                ' |     \\- org.springframework:spring-core:jar:2.5.6:compile\n' +
                ' +- hsqldb:hsqldb:jar:1.8.0.10:runtime\n' +
                ' +- javax.servlet:servlet-api:jar:2.5:provided\n' +
                ' \\- junit:junit:jar:3.8.1:test\n '
        );
        pathToPomXml = vscode.Uri.file(path.join(tmpDir.fsPath, 'dependency'));
        rawDependenciesList = MavenUtils.getRawDependenciesList(pathToPomXml.fsPath, treesManager);
        assert.equal(
            rawDependenciesList[0],
            ' --- maven-dependency-plugin:2.8:tree (default-cli) @ multi2 ---\n org.jfrog.test:multi2:jar:3.7-SNAPSHOT\n \\- javax.servlet.jsp:jsp-api:jar:2.1:compile\n '
        );
        pathToPomXml = vscode.Uri.file(path.join(tmpDir.fsPath, 'empty'));
        rawDependenciesList = MavenUtils.getRawDependenciesList(pathToPomXml.fsPath, treesManager);
        assert.isEmpty(rawDependenciesList);
    });

    /**
     * Test MavenUtils.getParentInfo.
     * Get parent info from pom.xml.
     */
    it('Get parent info', async () => {
        let pomXml: vscode.Uri = vscode.Uri.file(path.join(tmpDir.fsPath, 'multiPomDependency', 'multi1', 'pom.xml'));
        let parentInfo: string = MavenUtils.getParentInfo(pomXml);
        assert.equal(parentInfo, 'org.jfrog.test:multi:3.7-SNAPSHOT');

        pomXml = vscode.Uri.file(path.join(tmpDir.fsPath, 'empty', 'pom.xml'));
        parentInfo = MavenUtils.getParentInfo(pomXml);
        assert.isEmpty(parentInfo);
    });

    /**
     * Test MavenUtils.buildPrototypePomTree.
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
        let pomXmlsArray: vscode.Uri[] = await MavenUtils.locatePomXmls(localWorkspaceFolders, dummyProgress);
        let got: PomTree[] = MavenUtils.buildPrototypePomTree(pomXmlsArray, treesManager);
        let want: PomTree[];
        assert.deepEqual(got, [new PomTree('org.jfrog.test:multi2:3.7-SNAPSHOT', path.join(__dirname, '..', 'resources', 'maven', 'dependency'))]);

        //Multi pom
        localWorkspaceFolders = [
            {
                uri: vscode.Uri.file(path.join(__dirname, '..', 'resources', 'maven', 'multiPomDependency')),
                name: '',
                index: 0
            } as vscode.WorkspaceFolder
        ];
        pomXmlsArray = await MavenUtils.locatePomXmls(localWorkspaceFolders, dummyProgress);
        got = MavenUtils.buildPrototypePomTree(pomXmlsArray, treesManager);
        want = [new PomTree('org.jfrog.test:multi:3.7-SNAPSHOT', path.join(__dirname, '..', 'resources', 'maven', 'multiPomDependency'))];
        want[0].addChild(
            new PomTree(
                'org.jfrog.test:multi1:3.7-SNAPSHOT',
                path.join(__dirname, '..', 'resources', 'maven', 'multiPomDependency', 'multi1'),
                [],
                undefined,
                'org.jfrog.test:multi:3.7-SNAPSHOT'
            )
        );
        want[0].addChild(
            new PomTree(
                'org.jfrog.test:multi2:3.7-SNAPSHOT',
                path.join(__dirname, '..', 'resources', 'maven', 'multiPomDependency', 'multi2'),
                [],
                undefined,
                'org.jfrog.test:multi:3.7-SNAPSHOT'
            )
        );
        want[0].addChild(
            new PomTree(
                'org.jfrog.test:multi3:3.7-SNAPSHOT',
                path.join(__dirname, '..', 'resources', 'maven', 'multiPomDependency', 'multi3'),
                [],
                undefined,
                'org.jfrog.test:multi:3.7-SNAPSHOT'
            )
        );

        assert.deepEqual(got, want);
    });

    /**
     * Test MavenUtils.getProjectInfo.
     */
    it('Get Project Info', async () => {
        const [groupId, ArtifactId, version] = MavenUtils.getProjectInfo(
            '--- maven-dependency-plugin:2.8:tree (default-cli) @ multi2 ---\n' +
                ' org.jfrog.test:multi2:jar:3.7-SNAPSHOT\n' +
                ' - javax.servlet.jsp:jsp-api:jar:2.1:compile\n' +
                'org.jfrog.test:multi2:3.7-SNAPSHOT\n'
        );
        assert.equal(groupId, 'org.jfrog.test');
        assert.equal(ArtifactId, 'multi2');
        assert.equal(version, '3.7-SNAPSHOT');
    });

    /**
     * Test MavenUtils.getDependencyInfo.
     */
    it('Get dependency Info', async () => {
        const [groupId, ArtifactId, version] = MavenUtils.getDependencyInfo('org.testng:testng:jar:jdk15:5.9:test');
        assert.equal(groupId, 'org.testng');
        assert.equal(ArtifactId, 'testng');
        assert.equal(version, '5.9');
    });

    /**
     * Test MavenUtils.getPomId.
     */
    it('Get Pom Id', async () => {
        // Single pom
        let localWorkspaceFolders: vscode.WorkspaceFolder[] = [
            {
                uri: vscode.Uri.file(path.join(__dirname, '..', 'resources', 'maven', 'dependency')),
                name: '',
                index: 0
            } as vscode.WorkspaceFolder
        ];
        let pomXmls: vscode.Uri[] = await MavenUtils.locatePomXmls(localWorkspaceFolders, dummyProgress);

        let pomId: string = MavenUtils.getPomId(pomXmls[0], treesManager);
        assert.equal(pomId, 'org.jfrog.test:multi2:3.7-SNAPSHOT');
        // Multi pom
        localWorkspaceFolders = [
            {
                uri: vscode.Uri.file(path.join(__dirname, '..', 'resources', 'maven', 'multiPomDependency')),
                name: '',
                index: 0
            } as vscode.WorkspaceFolder
        ];
        pomXmls = await MavenUtils.locatePomXmls(localWorkspaceFolders, dummyProgress);
        pomId = MavenUtils.getPomId(pomXmls[0], treesManager);
        assert.equal(pomId, 'org.jfrog.test:multi1:3.7-SNAPSHOT');
    });

    /**
     * Test MavenUtils.getDependenciesPos.
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
     * Test MavenUtils.getDependencyPos.
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
     * Test MavenUtils.createMavenDependenciesTrees.
     */
    it('Create Maven Dependencies Trees', async () => {
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
        const componentArray = componentsToScan.toArray().sort((a: ComponentDetails, b: ComponentDetails) => a.component_id.localeCompare(b.component_id));
        // Check that components to scan contains progress:2.0.3
        for (let i = 0; i < componentsToScan.size(); i++) {
            assert.deepEqual(componentArray[i], new ComponentDetails(toCompare[i]));
        }
        // Validate 4 maven project was built
        assert.lengthOf(res, 4);
        // Check multi pom tree
        // Check node
        assert.deepEqual(res[0].label, 'org.jfrog.test:multi');
        assert.deepEqual(res[0].componentId, 'org.jfrog.test:multi:3.7-SNAPSHOT');
        assert.isTrue(res[0] instanceof MavenTreeNode);

        // Check parents
        assert.deepEqual(res[0].parent, parent);

        // Check children
        assert.lengthOf(res[0].children, 4);
        assert.lengthOf(res[0].children[0].children, 0);
        assert.deepEqual(res[0].children[0].parent, res[0]);
        assert.equal(res[0].children[0].componentId, 'junit:junit:3.8.1');
        assert.isTrue(res[0].children[0] instanceof DependenciesTreeNode);
        assert.lengthOf(res[0].children[3].children, 3);
        assert.deepEqual(res[0].children[3].parent, res[0]);
        assert.equal(res[0].children[3].componentId, 'org.jfrog.test:multi3:3.7-SNAPSHOT');
        assert.isTrue(res[0] instanceof MavenTreeNode);
        assert.lengthOf(res[0].children[2].children, 0);
        assert.deepEqual(res[0].children[2].parent, res[0]);
        assert.equal(res[0].children[2].componentId, 'org.jfrog.test:multi2:3.7-SNAPSHOT');
        assert.isTrue(res[0] instanceof MavenTreeNode);
        assert.lengthOf(res[0].children[1].children, 6);
        assert.deepEqual(res[0].children[1].parent, res[0]);
        assert.equal(res[0].children[1].componentId, 'org.jfrog.test:multi1:3.7-SNAPSHOT');
        assert.isTrue(res[0] instanceof MavenTreeNode);

        // Check grandchildren
        // First
        assert.equal(res[0].children[3].children[0].componentId, 'org.jfrog.test:multi1:3.7-SNAPSHOT');
        assert.isTrue(res[0].children[3].children[0] instanceof DependenciesTreeNode);
        assert.deepEqual(res[0].children[3].children[0].parent, res[0].children[3]);
        assert.equal(res[0].children[3].children[1].componentId, 'hsqldb:hsqldb:1.8.0.10');
        assert.isTrue(res[0].children[3].children[1] instanceof DependenciesTreeNode);
        assert.deepEqual(res[0].children[3].children[1].parent, res[0].children[3]);
        assert.equal(res[0].children[3].children[2].componentId, 'javax.servlet:servlet-api:2.5');
        assert.isTrue(res[0].children[3].children[2] instanceof DependenciesTreeNode);
        assert.deepEqual(res[0].children[3].children[2].parent, res[0].children[3]);
        // Second
        assert.lengthOf(res[0].children[2].children, 0);
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

    async function runCreateMavenDependenciesTrees(componentsToScan: Collections.Set<ComponentDetails>, parent: DependenciesTreeNode) {
        let dependenciesTrees: DependenciesTreeNode[] = await MavenUtils.createDependenciesTrees(
            workspaceFolders,
            dummyProgress,
            componentsToScan,
            treesManager,
            parent,
            false
        );
        return dependenciesTrees.sort((lhs, rhs) => (<string>lhs.label).localeCompare(<string>rhs.label));
    }
});
