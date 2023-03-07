import { assert } from 'chai';
import { IGraphRequestModel } from 'jfrog-client-js';

import { ConnectionManager } from '../../main/connect/connectionManager';
import { GraphScanLogic } from '../../main/scanLogic/scanGraphLogic';
import { RootNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesRoot/rootTree';
import { DependenciesTreeNode } from '../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';
import { createDependency } from './utils/treeNodeUtils.test';
import { PackageType } from '../../main/types/projectType';

describe('GraphScanLogic Tests', async () => {
    describe('flatten root components', async () => {
        let scanLogic: GraphScanLogic = new GraphScanLogic({} as ConnectionManager);
        it('no dependencies', async () => {
            let root: RootNode = new RootNode('', PackageType.Unknown);
            let flatten: IGraphRequestModel[] | undefined = scanLogic.getFlattenRequestModelNodes(root, new Set<string>());
            assert.isUndefined(flatten);
        });
        it('one dependency', async () => {
            let root: RootNode = new RootNode('', PackageType.Unknown);
            createDependency('A', '1.0.0', root);
            let flatten: IGraphRequestModel[] | undefined = scanLogic.getFlattenRequestModelNodes(root, new Set<string>());
            assert.isDefined(flatten);
            if (flatten) {
                // Make sure all components exists
                assert.sameMembers(
                    flatten.map(component => component.component_id),
                    ['A:1.0.0']
                );
                // Make sure nodes is not defined for children to conserve load on network
                assert.isEmpty(flatten.filter(component => component.nodes));
            }
        });
        it('multiple dependencies', async () => {
            let root: RootNode = new RootNode('', PackageType.Unknown);
            createDependency('A', '1.0.0', root);
            let b: DependenciesTreeNode = createDependency('B', '1.0.0', root);
            createDependency('A', '1.0.1', b);
            let c: DependenciesTreeNode = createDependency('C', '2.0.0', root);
            createDependency('D', '3.0.0', c);
            createDependency('E', '1.0.0', c);

            let flatten: IGraphRequestModel[] | undefined = scanLogic.getFlattenRequestModelNodes(root, new Set<string>());
            assert.isDefined(flatten);
            if (flatten) {
                // Make sure all components exists
                assert.sameMembers(
                    flatten.map(component => component.component_id),
                    ['A:1.0.0', 'B:1.0.0', 'A:1.0.1', 'C:2.0.0', 'D:3.0.0', 'E:1.0.0']
                );
                // Make sure nodes is not defined for children to conserve load on network
                assert.isEmpty(flatten.filter(component => component.nodes));
            }
        });
        it('with duplications', async () => {
            let root: RootNode = new RootNode('', PackageType.Unknown);
            createDependency('A', '1.0.0', root);
            let b: DependenciesTreeNode = createDependency('B', '1.0.0', root);
            createDependency('A', '1.0.1', b);
            let c: DependenciesTreeNode = createDependency('C', '2.0.0', root);
            createDependency('D', '3.0.0', c);
            createDependency('A', '1.0.0', c);

            let flatten: IGraphRequestModel[] | undefined = scanLogic.getFlattenRequestModelNodes(root, new Set<string>());
            assert.isDefined(flatten);
            if (flatten) {
                // Make sure all components exists
                assert.sameMembers(
                    flatten.map(component => component.component_id),
                    ['A:1.0.0', 'B:1.0.0', 'A:1.0.1', 'C:2.0.0', 'D:3.0.0']
                );
                // Make sure nodes is not defined for children to conserve load on network
                assert.isEmpty(flatten.filter(component => component.nodes));
            }
        });
    });
});
