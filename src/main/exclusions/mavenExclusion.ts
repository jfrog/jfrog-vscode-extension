import * as vscode from 'vscode';
import * as xml from 'xmlbuilder2';
import { XMLSerializedAsObject, XMLSerializedAsObjectArray } from 'xmlbuilder2/lib/interfaces';
import { MavenTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/mavenTree';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { TreesManager } from '../treeDataProviders/treesManager';
import { MavenUtils } from '../utils/mavenUtils';
import { AbstractExclusion } from './abstractExclusion';

export class MavenExclusion extends AbstractExclusion {
    // The number of indentations for the <dependency> tag in the pom.xml:
    // <project>        <-- 0
    //   <dependencies> <-- 1
    //     <dependency> <-- 2
    private static readonly DEPENDENCY_INDENTATIONS: number = 2;

    constructor(private _treesManager: TreesManager) {
        super(MavenUtils.PKG_TYPE);
    }

    /** @override */
    public async excludeDependency(dependenciesTreeNode: DependenciesTreeNode) {
        if (dependenciesTreeNode.isDependenciesTreeRoot() || dependenciesTreeNode.parent instanceof MavenTreeNode) {
            return;
        }
        let directDependency: DependenciesTreeNode = this.getRootDependency(dependenciesTreeNode);
        if (!directDependency) {
            return;
        }
        let textDocument: vscode.TextDocument | undefined = await MavenUtils.openPomXml(directDependency);
        // Return if pom.xml not found
        if (!textDocument) {
            return;
        }
        let pomXmlContent: string = textDocument.getText();
        let [groupId, artifactId] = MavenUtils.getGavArray(directDependency);
        let dependencyStr: string = MavenUtils.getDependencyTag(pomXmlContent, groupId, artifactId);
        if (dependencyStr === '') {
            return;
        }
        let dependencyObj: XMLSerializedAsObject = xml.fragment(dependencyStr).end({ format: 'object' }) as XMLSerializedAsObject;

        this.addExclusion(dependenciesTreeNode, dependencyObj);
        let dependencyOffset: number = pomXmlContent.indexOf(dependencyStr);
        let startPos: vscode.Position = textDocument.positionAt(dependencyOffset);
        let endPos: vscode.Position = textDocument.positionAt(dependencyOffset + dependencyStr.length);
        await this.saveExclusion(textDocument, startPos, endPos, dependencyObj);
        this._treesManager.dependenciesTreeDataProvider.removeNode(dependenciesTreeNode);
        this.highlightExclusionsTag(textDocument, startPos);
    }

    /**
     * Get the root dependency of the input dependency, i.e the dependency that appear in the pom.xml.
     * @param dependenciesTreeNode - the dependencies tree node
     */
    private getRootDependency(dependenciesTreeNode: DependenciesTreeNode): DependenciesTreeNode {
        while (
            dependenciesTreeNode.parent &&
            !(dependenciesTreeNode instanceof MavenTreeNode || dependenciesTreeNode.parent instanceof MavenTreeNode)
        ) {
            dependenciesTreeNode = dependenciesTreeNode.parent as DependenciesTreeNode;
        }
        return dependenciesTreeNode;
    }

    /**
     * Create exclusion node for the input group and artifact ID.
     * @param groupId - The group ID
     * @param artifactId - The artifact ID
     */
    private createExclusion(groupId: string, artifactId: string): XMLSerializedAsObject {
        let exclusionStr: string = '<exclusion><groupId>' + groupId + '</groupId><artifactId>' + artifactId + '</artifactId></exclusion>';
        return xml.convert(exclusionStr, { format: 'object' }) as XMLSerializedAsObject;
    }

    /**
     * Add exclusion to the dependency object.
     * @exclusionNode - The dependencies tree node to exclude in the pom
     * @dependencyObj - The direct dependency tag '<dependency>...</dependency>' object
     */
    private addExclusion(exclusionNode: DependenciesTreeNode, dependencyObj: XMLSerializedAsObject) {
        let dependencyXmlTag: XMLSerializedAsObject = dependencyObj['dependency'] as XMLSerializedAsObject;
        let [groupId, artifactId] = MavenUtils.getGavArray(exclusionNode);
        let exclusion: XMLSerializedAsObject = this.createExclusion(groupId, artifactId);
        let exclusionsXmlTag: XMLSerializedAsObject = dependencyXmlTag['exclusions'] as XMLSerializedAsObject;
        if (!exclusionsXmlTag) {
            // '<exclusions> ... </exclusions>' does not exist.
            dependencyXmlTag['exclusions'] = exclusion;
            return;
        }

        let exclusionsArr: XMLSerializedAsObjectArray | XMLSerializedAsObject = exclusionsXmlTag['#'] as XMLSerializedAsObjectArray;
        if (!exclusionsArr) {
            exclusionsArr = [exclusionsXmlTag];
        }
        exclusionsArr
            .map(exclusionTagParent => exclusionTagParent as XMLSerializedAsObject)
            .filter(exclusionTagParent => exclusionTagParent.exclusion)
            .forEach((exclusionTagParent: XMLSerializedAsObject) => {
                if (exclusionTagParent.exclusion instanceof Array) {
                    // More than one exclusion exists in dependency
                    if (this.isExclusionExistsInArray(exclusionTagParent.exclusion, groupId, artifactId)) {
                        return;
                    }
                    exclusionTagParent.exclusion.push(exclusion.exclusion as XMLSerializedAsObject);
                } else {
                    // One exclusion exists in dependency
                    if (this.isExclusionExists(exclusionTagParent.exclusion as XMLSerializedAsObject, groupId, artifactId)) {
                        return;
                    }
                    exclusionTagParent.exclusion = [exclusionTagParent.exclusion, exclusion.exclusion as XMLSerializedAsObject];
                }
            });
        dependencyXmlTag['exclusions'] = exclusionsXmlTag;
    }

    /**
     * Save exclusion to pom.xml.
     * @param textDocument - The pom.xml
     * @param startPos - The start position of the dependency
     * @param endPos - The end position of the dependency
     * @param dependencyObj - The direct dependency tag '<dependency>...</dependency>' object
     */
    private async saveExclusion(
        textDocument: vscode.TextDocument,
        startPos: vscode.Position,
        endPos: vscode.Position,
        dependencyObj: XMLSerializedAsObject
    ) {
        let dependencyWithExclusionStr: string = xml
            .fragment(dependencyObj)
            .end({
                prettyPrint: true,
                indent: ' '.repeat(startPos.character / MavenExclusion.DEPENDENCY_INDENTATIONS),
                offset: MavenExclusion.DEPENDENCY_INDENTATIONS
            })
            .replace(/^(\s*)/, '');

        let textEdit: vscode.TextEditor = await vscode.window.showTextDocument(textDocument);
        await textEdit.edit(textEdit => {
            textEdit.replace(new vscode.Range(startPos, endPos), dependencyWithExclusionStr);
        });
        await textDocument.save();
    }

    /**
     * Return true if the exclusion already exists in the pom. This covers the case of many exclusions under <exclusions>...</exclusions> tag.
     * @param exclusions - The candidate exclusion
     * @param groupId - The group ID
     * @param artifactId - The artifact ID
     */
    private isExclusionExistsInArray(exclusions: XMLSerializedAsObjectArray, groupId: string, artifactId: string): boolean {
        return !!exclusions.find(exclusion => this.isExclusionExists(exclusion as XMLSerializedAsObject, groupId, artifactId));
    }

    /**
     * Return true if the exclusion already exists in the pom. This covers the case of a single exclusion under <exclusions>...</exclusions> tag.
     * @param exclusions - The candidate exclusion
     * @param groupId - The group ID
     * @param artifactId - The artifact ID
     */
    private isExclusionExists(exclusion: XMLSerializedAsObject, groupId: string, artifactId: string): boolean {
        return exclusion.artifactId === artifactId && exclusion.groupId === groupId;
    }

    /**
     * Select <exclusions>...</exclusions> text in the pom.
     * @param textDocument - The document
     * @param dependencyPos - The start position of the dependency in the pom.
     */
    private highlightExclusionsTag(textDocument: vscode.TextDocument, dependencyPos: vscode.Position) {
        let offset: number = textDocument.offsetAt(dependencyPos);
        let text: string = textDocument.getText();
        vscode.window.showTextDocument(textDocument, {
            selection: new vscode.Selection(
                textDocument.positionAt(text.indexOf('<exclusions>', offset)),
                textDocument.positionAt(text.indexOf('</exclusions>', offset) + 13)
            )
        } as vscode.TextDocumentShowOptions);
    }
}
