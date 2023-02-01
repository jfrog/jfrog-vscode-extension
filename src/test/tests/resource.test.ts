import * as path from 'path';
import * as fs from 'fs';
import * as tmp from 'tmp';
import nock from 'nock';
// import * as crypto from 'crypto';
import { assert } from 'chai';
import { LogManager } from '../../main/log/logManager';
import { Resource } from '../../main/utils/resource';
import { ConnectionUtils } from '../../main/connect/connectionUtils';
import { Utils } from '../../main/treeDataProviders/utils/utils';

describe('Resource Tests', () => {
    let logManager: LogManager = new LogManager().activate();

    const SERVER_URL: string = 'http://localhost:8000';
    const DATA_DIR: string = path.join(__dirname, '..', 'resources', 'testsdata');
    let targetDir: tmp.DirResult = tmp.dirSync();

    const FILE: string = 'file1.txt';
    const OUTDATED: string = 'file1.txt';
    const LATEST: string = 'file1.txt';

    afterEach(() => {
        // Reset temp folder
        let filePath: string = path.join(targetDir.name, FILE);
        if (fs.existsSync(filePath)) {
            fs.rmSync(filePath);
        }
        let outdatedPath: string = path.join(targetDir.name, OUTDATED);
        if (fs.existsSync(outdatedPath)) {
            fs.rmSync(outdatedPath);
        }
        let latestPath: string = path.join(targetDir.name, LATEST);
        if (fs.existsSync(latestPath)) {
            fs.rmSync(latestPath);
        }
    });
    after(() => {
        // Clean up after tests
        targetDir.removeCallback();
        nock.cleanAll();
    });

    let testCases: any[] = [
        {
            test: 'New resource',
            target: FILE,
            file: path.join(DATA_DIR, FILE),
            expectedUpdate: true
        },
        {
            test: 'Outdated resource',
            target: OUTDATED,
            file: path.join(DATA_DIR, OUTDATED),
            expectedUpdate: true
        },
        {
            test: 'Latest resource',
            target: LATEST,
            file: path.join(DATA_DIR, LATEST),
            expectedUpdate: false
        }
    ];

    testCases.forEach(testCase => {
        it('Update test - ' + testCase.test, async () => {
            const TARGET_PATH: string = path.join(targetDir.name, testCase.target);
            let resource: Resource = new Resource(
                SERVER_URL,
                TARGET_PATH,
                logManager,
                ConnectionUtils.createJfrogClient(SERVER_URL, SERVER_URL + '/artifactory', '', '', '', '')
            );
            let scope: nock.Scope = createNockServer(resource, testCase.file);
            let updated: boolean = await resource.update();
            assert.equal(updated, testCase.expectedUpdate);
            assert.isTrue(fs.existsSync(TARGET_PATH));
            assert.isTrue(scope.isDone());
        });
    });

    testCases.forEach(testCase => {
        it('Outdate test - ' + testCase.test, async () => {
            let resource: Resource = new Resource(
                SERVER_URL,
                path.join(targetDir.name, testCase.target),
                logManager,
                ConnectionUtils.createJfrogClient(SERVER_URL, SERVER_URL + '/artifactory', '', '', '', '')
            );
            let scope: nock.Scope = createNockServer(resource, testCase.file);
            let isOutdated: boolean = await resource.isOutdated();
            assert.equal(isOutdated, testCase.expectedUpdate);
            assert.isTrue(scope.isDone());
        });
    });

    function createNockServer(resource: Resource, fileToReturn: string): nock.Scope {
        let name: string = Utils.getLastSegment(resource.fullPath);
        return nock(resource.sourceUrl)
            .get(`/artifactory/download/path/to/resource/` + name)
            .replyWithFile(200, fileToReturn);
    }
});
