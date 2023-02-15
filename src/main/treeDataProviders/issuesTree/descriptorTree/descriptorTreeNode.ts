import { IssuesRootTreeNode } from '../issuesRootTreeNode';
import { PackageType } from '../../../types/projectType';
import { CveApplicableDetails } from '../../../scanLogic/scanRunners/applicabilityScan';
import { ProjectDependencyTreeNode } from './projectDependencyTreeNode';
/**
 * Describes a descriptor of a project with Xray issues.
 * Holds a list of dependencies that has issues for the current environment.
 */
export class DescriptorTreeNode extends ProjectDependencyTreeNode {
    // Not applicable if key in here and not in the map below
    private _scannedCve?: Set<string> | undefined;
    // Is applicable if key in here
    private _applicableCve?: Map<string, CveApplicableDetails> | undefined;

    constructor(filePath: string, packageType?: PackageType, parent?: IssuesRootTreeNode) {
        super(filePath, packageType, parent);
    }

    public get applicableScanTimeStamp(): number | undefined {
        return this._applicableScanTimeStamp;
    }

    public set applicableScanTimeStamp(value: number | undefined) {
        this._applicableScanTimeStamp = value;
    }

    public get scannedCve(): Set<string> | undefined {
        return this._scannedCve;
    }

    public set scannedCve(value: Set<string> | undefined) {
        this._scannedCve = value;
    }

    public get applicableCve(): Map<string, CveApplicableDetails> | undefined {
        return this._applicableCve;
    }

    public set applicableCve(value: Map<string, CveApplicableDetails> | undefined) {
        this._applicableCve = value;
    }
}
