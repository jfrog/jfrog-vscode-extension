import * as path from 'path';
import * as vscode from 'vscode';
import * as xml from 'xmlbuilder2';
import { XMLSerializedAsObject, XMLSerializedAsObjectArray } from 'xmlbuilder2/lib/interfaces';
import { MavenTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesRoot/mavenTree';
import { DependenciesTreeNode } from '../treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { MavenUtils } from '../utils/mavenUtils';
import { AbstractExclusion } from './abstractExclusion';

export class MavenExclusion extends AbstractExclusion {
    constructor() {
        super(MavenUtils.PKG_TYPE);
    }

    /** @override */
    public async excludeDependency(dependenciesTreeNode: DependenciesTreeNode) {
        // Return if it is a node
        if (dependenciesTreeNode.isDependenciesTreeRoot() || dependenciesTreeNode.parent instanceof MavenTreeNode) {
            return;
        }
        let directDependency: DependenciesTreeNode = this.getDirectDependency(dependenciesTreeNode);
        if (!directDependency) {
            return;
        }
        let textEditor: vscode.TextEditor | undefined = await this.openPomXml(directDependency);
        // Return if pom.xml not found
        if (!textEditor) {
            return;
        }

        let dependencyStr: string = MavenUtils.getDependency(textEditor.document, directDependency);
        if (dependencyStr === '') {
            return;
        }
        let dependencyObj: XMLSerializedAsObject = xml.fragment(dependencyStr).end({ format: 'object' }) as XMLSerializedAsObject;

        this.addExclusion(dependenciesTreeNode, dependencyObj);
        let startPos: vscode.Position = textEditor.document.positionAt(textEditor.document.getText().indexOf(dependencyStr));
        let endPos: vscode.Position = textEditor.document.positionAt(textEditor.document.getText().indexOf(dependencyStr) + dependencyStr.length);

        dependencyStr = xml.fragment(dependencyObj).end({ prettyPrint: true, indent: ' '.repeat(startPos.character / 2), offset: 2 });
        dependencyStr = dependencyStr.replace(/^(\s*)/, '');

        await textEditor.edit(textEdit => {
            textEdit.replace(new vscode.Range(startPos, endPos), dependencyStr);
        });
        await textEditor.document.save();
        this.selectExclusionsText(textEditor, startPos);
    }

    private getDirectDependency(dependenciesTreeNode: DependenciesTreeNode): DependenciesTreeNode {
        // Search for the nearest pom.xml (MavenTreeNode) which matches the fs path of the input node
        while (
            dependenciesTreeNode.parent &&
            !(dependenciesTreeNode instanceof MavenTreeNode) &&
            !(dependenciesTreeNode.parent instanceof MavenTreeNode)
        ) {
            dependenciesTreeNode = dependenciesTreeNode.parent;
        }
        return dependenciesTreeNode;
    }

    private async openPomXml(directDependency: DependenciesTreeNode): Promise<vscode.TextEditor | undefined> {
        let fsPath: string | undefined = (directDependency.parent as MavenTreeNode).workspaceFolder;
        if (!fsPath) {
            return;
        }
        let openPath: vscode.Uri = vscode.Uri.file(path.join(fsPath, 'pom.xml'));
        if (!openPath) {
            return;
        }
        let textDocument: vscode.TextDocument = await vscode.workspace.openTextDocument(openPath);
        return await vscode.window.showTextDocument(textDocument);
    }

    private createExclusion(groupId: string, artifactId: string): XMLSerializedAsObject {
        let exclusionStr: string = '<exclusion><groupId>' + groupId + '</groupId><artifactId>' + artifactId + '</artifactId></exclusion>';
        return xml.convert(exclusionStr, { format: 'object' }) as XMLSerializedAsObject;
    }

    /**
     * Add exclusion to the dependency object
     */
    private addExclusion(exclusionNode: DependenciesTreeNode, dependencyObj: XMLSerializedAsObject) {
        let dependencyXmlTag: XMLSerializedAsObject = dependencyObj['dependency'] as XMLSerializedAsObject;
        let [groupId, artifactId] = exclusionNode.generalInfo.getComponentId().split(':');
        let exclusion: XMLSerializedAsObject = this.createExclusion(groupId, artifactId);
        let exclusionsXmlTag: XMLSerializedAsObject = dependencyXmlTag['exclusions'] as XMLSerializedAsObject;

        // <exclusions> does not exist in dependency
        if (!exclusionsXmlTag) {
            dependencyXmlTag['exclusions'] = exclusion;
            return;
        }
        if (exclusionsXmlTag.exclusion instanceof Array) {
            // More than one exclusion exist in dependency
            if (this.isExclusionExistInArray(exclusionsXmlTag.exclusion, groupId, artifactId)) {
                return;
            }
            exclusionsXmlTag.exclusion.push(exclusion.exclusion as XMLSerializedAsObject);
        } else {
            // One exclusion exist in dependency
            if (this.isExclusionExist(exclusionsXmlTag.exclusion as XMLSerializedAsObject, groupId, artifactId)) {
                return;
            }
            exclusionsXmlTag.exclusion = [exclusionsXmlTag.exclusion as XMLSerializedAsObject, exclusion.exclusion as XMLSerializedAsObject];
        }
        dependencyXmlTag['exclusions'] = exclusionsXmlTag;
    }

    private isExclusionExistInArray(exclusions: XMLSerializedAsObjectArray, groupId: string, artifactId: string): boolean {
        return !!exclusions.find(exclusion => this.isExclusionExist(exclusion as XMLSerializedAsObject, groupId, artifactId));
    }

    private isExclusionExist(exclusion: XMLSerializedAsObject, groupId: string, artifactId: string): boolean {
        return exclusion.artifactId === artifactId && exclusion.groupId === groupId;
    }

    private selectExclusionsText(textEditor: vscode.TextEditor, startPos: vscode.Position) {
        let offset: number = textEditor.document.offsetAt(startPos);
        let text: string = textEditor.document.getText();
        textEditor.selection = new vscode.Selection(
            textEditor.document.positionAt(text.indexOf('<exclusions>', offset)),
            textEditor.document.positionAt(text.indexOf('</exclusions>', offset) + 13)
        );
    }
}
