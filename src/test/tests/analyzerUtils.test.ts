import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { assert } from 'chai';
import * as sinon from 'sinon';
import { CodeFileTreeNode } from '../../main/treeDataProviders/issuesTree/codeFileTree/codeFileTreeNode';
import { IssuesRootTreeNode } from '../../main/treeDataProviders/issuesTree/issuesRootTreeNode';
import { AnalyzerUtils } from '../../main/treeDataProviders/utils/analyzerUtils';
import { createRootTestNode } from './utils/treeNodeUtils.test';

/**
 * Test functionality of @class AnalyzerUtils.
 */
describe('Analyzer Utils Tests', async () => {
    [
        {
            pattern: undefined,
            results: []
        },
        {
            pattern: '',
            results: []
        },
        {
            pattern: '**/*node_modules*',
            results: ['**/*node_modules*/**']
        },
        {
            pattern: '**/*{test}*',
            results: ['**/*test*/**']
        },
        {
            pattern: '**/*{test,venv,node_modules,target}*',
            results: ['**/*test*/**', '**/*venv*/**', '**/*node_modules*/**', '**/*target*/**']
        }
    ].forEach(testCase => {
        it('Get analyzer manager exclude pattern test - ' + testCase.pattern, () => {
            let results: string[] = AnalyzerUtils.getAnalyzerManagerExcludePatterns(testCase.pattern);
            assert.sameMembers(testCase.results, results);
        });
    });

    [path.join('somewhere', 'file'), path.join('somewhere', 'folder', 'file'), path.join(__dirname, 'file')].forEach(testCase => {
        it('Parse location file path test - ' + testCase, () => {
            let sarifUri: string = vscode.Uri.file(testCase).toString();
            let result: string = AnalyzerUtils.parseLocationFilePath(sarifUri);
            assert.deepEqual(result, testCase);
        });
    });

    describe('parseLocationFilePath — Windows UNC SARIF URIs', () => {
        let platformStub: sinon.SinonStub;

        beforeEach(() => {
            if (process.platform !== 'win32') {
                platformStub = sinon.stub(os, 'platform').returns('win32');
            }
        });

        afterEach(() => {
            platformStub?.restore();
        });

        it('restores double-backslash UNC authority from file:///host/share/path', () => {
            const sarifUri: string = 'file:///netapp.ozar.main/users/isharelg/system/AWS/workspaces/Lambda/FullVer.py';
            const expected: string = '\\\\netapp.ozar.main\\users\\isharelg\\system\\AWS\\workspaces\\Lambda\\FullVer.py';

            const result: string = AnalyzerUtils.parseLocationFilePath(sarifUri);

            assert.equal(result, expected);
        });

        it('handles percent-encoded segments in UNC URIs', () => {
            const sarifUri: string = 'file:///netapp.ozar.main/users/my%20dir/file.py';
            const expected: string = '\\\\netapp.ozar.main\\users\\my dir\\file.py';

            const result: string = AnalyzerUtils.parseLocationFilePath(sarifUri);

            assert.equal(result, expected);
        });
    });

    describe('remapToWorkspace — mapped drive to UNC canonicalization', () => {
        let platformStub: sinon.SinonStub;
        let realpathNativeStub: sinon.SinonStub;

        const workspaceRoot: string = 'P:\\system\\AWS\\workspaces\\Lambda';
        const canonicalRoot: string = '\\\\netapp.ozar.main\\users\\isharelg\\system\\AWS\\workspaces\\Lambda';
        const canonicalFile: string = canonicalRoot + '\\FullVer.py';
        const mappedFile: string = workspaceRoot + '\\FullVer.py';

        beforeEach(() => {
            if (process.platform !== 'win32') {
                platformStub = sinon.stub(os, 'platform').returns('win32');
            }
            realpathNativeStub = sinon.stub(fs.realpathSync, 'native').callsFake((p: fs.PathLike) => {
                if (p === workspaceRoot) {
                    return canonicalRoot;
                }
                return p.toString();
            });
        });

        afterEach(() => {
            platformStub?.restore();
            realpathNativeStub.restore();
            AnalyzerUtils.clearWorkspaceRealPathCache();
        });

        it('remapToWorkspace rewrites UNC path under canonical root to mapped drive', () => {
            const result: string = AnalyzerUtils.remapToWorkspace(canonicalFile, workspaceRoot);
            assert.equal(result, mappedFile);
        });

        it('remapToWorkspace is case-insensitive on Windows prefix match', () => {
            const mixedCaseFile: string = '\\\\NETAPP.OZAR.MAIN\\users\\isharelg\\system\\AWS\\workspaces\\Lambda\\FullVer.py';
            const result: string = AnalyzerUtils.remapToWorkspace(mixedCaseFile, workspaceRoot);
            assert.equal(result, mappedFile);
        });

        it('getOrCreateCodeFileNode stores mapped drive path when SARIF returns UNC', () => {
            const root: IssuesRootTreeNode = createRootTestNode(workspaceRoot);
            const node: CodeFileTreeNode = AnalyzerUtils.getOrCreateCodeFileNode(root, canonicalFile);

            assert.equal(node.projectFilePath, mappedFile);
        });

        it('getOrCreateCodeFileNode leaves path unchanged when realpath fails', () => {
            realpathNativeStub.throws(new Error('disconnected share'));
            AnalyzerUtils.clearWorkspaceRealPathCache();
            const root: IssuesRootTreeNode = createRootTestNode(workspaceRoot);
            const node: CodeFileTreeNode = AnalyzerUtils.getOrCreateCodeFileNode(root, canonicalFile);

            assert.equal(node.projectFilePath, canonicalFile);
        });
    });

    describe('Empty/Invalid location.physicalLocation validation tests for generateIssueData', () => {
        it('Should handle invalid physicalLocation scenarios without errors', () => {
            const response: { filesWithIssues: any[] } = { filesWithIssues: [] };
            const analyzeIssue: any = {
                locations: [
                    { physicalLocation: null },
                    { physicalLocation: undefined },
                    {
                        physicalLocation: {
                            artifactLocation: null,
                            region: { startLine: 1, endLine: 1, startColumn: 1, endColumn: 1 }
                        }
                    },
                    {
                        physicalLocation: {
                            artifactLocation: { uri: null },
                            region: { startLine: 2, endLine: 2, startColumn: 1, endColumn: 1 }
                        }
                    },
                    {
                        physicalLocation: {
                            artifactLocation: { uri: '' },
                            region: { startLine: 3, endLine: 3, startColumn: 1, endColumn: 1 }
                        }
                    }
                ]
            } as any;

            assert.doesNotThrow(() => {
                AnalyzerUtils.generateIssueData(response, analyzeIssue, 'test description');
            });

            assert.equal(response.filesWithIssues.length, 0);
        });

        it('Should handle undefined analyzeIssue without errors', () => {
            const response: { filesWithIssues: any[] } = { filesWithIssues: [] };
            assert.doesNotThrow(() => {
                AnalyzerUtils.generateIssueData(response, undefined as any);
            });
            assert.equal(response.filesWithIssues.length, 0);
        });

        it('Should handle null analyzeIssue without errors', () => {
            const response: { filesWithIssues: any[] } = { filesWithIssues: [] };
            assert.doesNotThrow(() => {
                AnalyzerUtils.generateIssueData(response, null as any);
            });
            assert.equal(response.filesWithIssues.length, 0);
        });

        it('Should handle analyzeIssue with undefined locations without errors', () => {
            const response: { filesWithIssues: any[] } = { filesWithIssues: [] };
            const analyzeIssue: any = { ruleId: 'test-rule', message: { text: 'test' } };
            assert.doesNotThrow(() => {
                AnalyzerUtils.generateIssueData(response, analyzeIssue);
            });
            assert.equal(response.filesWithIssues.length, 0);
        });

        it('Should handle analyzeIssue with empty locations array without errors', () => {
            const response: { filesWithIssues: any[] } = { filesWithIssues: [] };
            const analyzeIssue: any = { ruleId: 'test-rule', message: { text: 'test' }, locations: [] };
            assert.doesNotThrow(() => {
                AnalyzerUtils.generateIssueData(response, analyzeIssue);
            });
            assert.equal(response.filesWithIssues.length, 0);
        });

        it('Should process valid locations correctly', () => {
            const response: { filesWithIssues: any[] } = { filesWithIssues: [] };
            const analyzeIssue: any = {
                ruleId: 'CVE-TEST-001',
                level: 'error',
                message: { text: 'test rule name' },
                locations: [
                    {
                        physicalLocation: {
                            artifactLocation: { uri: '/valid/path/file1.js' },
                            region: { startLine: 1, endLine: 1, startColumn: 1, endColumn: 1 }
                        }
                    },
                    {
                        physicalLocation: {
                            artifactLocation: { uri: '/valid/path/file2.js' },
                            region: { startLine: 2, endLine: 2, startColumn: 1, endColumn: 1 }
                        }
                    }
                ]
            } as any;

            assert.doesNotThrow(() => {
                AnalyzerUtils.generateIssueData(response, analyzeIssue, 'test description');
            });

            assert.equal(response.filesWithIssues.length, 2);
            assert.equal(response.filesWithIssues[0].full_path, '/valid/path/file1.js');
            assert.equal(response.filesWithIssues[1].full_path, '/valid/path/file2.js');
        });
    });
});
