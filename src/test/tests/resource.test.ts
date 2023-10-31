import * as path from 'path';
import * as fs from 'fs';
import nock from 'nock';
import { assert } from 'chai';
import { LogManager } from '../../main/log/logManager';
import { Resource } from '../../main/utils/resource';
import { ScanUtils } from '../../main/utils/scanUtils';
import { ConnectionUtils } from '../../main/connect/connectionUtils';

describe('Resource Tests', () => {
    let logManager: LogManager = new LogManager().activate();

    const SERVER_URL: string = 'http://localhost:8000';
    const SERVICE_ID: string = 'jfrog@some.me';

    const DATA_DIR: string = path.join(__dirname, '..', 'resources', 'testsdata');
    const OUTDATED: string = 'outdated.txt';
    const LATEST: string = 'latest.txt';

    afterEach(() => {
        nock.cleanAll();
    });

    const LATEST_TEST_CASE: any = {
        test: 'Latest resource',
        target: LATEST,
        file: path.join(DATA_DIR, LATEST),
        checksum: ScanUtils.Hash('sha256', 'LATEST'),
        expected: false
    };

    const testCases: any[] = [
        {
            test: 'Outdated resource',
            target: OUTDATED,
            file: path.join(DATA_DIR, OUTDATED),
            checksum: ScanUtils.Hash('sha256', 'OUTDATED'),
            expected: true
        },
        LATEST_TEST_CASE
    ];

    testCases.forEach(testCase => {
        it('Outdate test - ' + testCase.test, async () => {
            let testDir: string = ScanUtils.createTmpDir();
            let resource: Resource = createTestResource(testCase, testDir);
            createNockServer(resource);
            try {
                // No file
                let isOutdated: boolean = await resource.isOutdated();
                assert.equal(isOutdated, true);
                // With file
                fs.copyFileSync(testCase.file, resource.fullPath);
                isOutdated = await resource.isOutdated();
                assert.equal(isOutdated, testCase.expected);
            } finally {
                ScanUtils.removeFolder(testDir);
            }
        });
    });

    testCases.forEach(testCase => {
        it('Update test - ' + testCase.test, async () => {
            let testDir: string = ScanUtils.createTmpDir();
            let resource: Resource = createTestResource(testCase, testDir);
            createNockServer(resource);
            try {
                fs.copyFileSync(testCase.file, resource.fullPath);
                assert.isTrue(await resource.update());
                assert.isTrue(fs.existsSync(resource.fullPath));
                assert.equal(fs.readFileSync(resource.fullPath).toString(), 'LATEST');
            } finally {
                ScanUtils.removeFolder(testDir);
            }
        });
    });

    it('Bad request while update resource', async () => {
        let err: any;
        let testDir: string = ScanUtils.createTmpDir();
        let resource: Resource = createTestResource(LATEST_TEST_CASE, testDir);
        try {
            nock(SERVER_URL)
                .get('/artifactory/api/system/ping')
                .reply(200, SERVICE_ID)
                .get(`/artifactory/` + resource.sourceUrl)
                .reply(400)
                .head(`/artifactory/` + resource.sourceUrl)
                .reply(400);
            await resource.update();
        } catch (error) {
            err = error;
        } finally {
            ScanUtils.removeFolder(testDir);
        }
        assert.isDefined(err, 'Expect to have a bad request error');
        assert.strictEqual(err.code, 'ERR_BAD_REQUEST');
        assert.isDefined(err.message, 'Request failed with status code 400');
    });

    function createTestResource(testCase: any, testDir: string): Resource {
        return new Resource(
            'baseURL/' + testCase.target,
            path.join(testDir, testCase.target),
            logManager,
            ConnectionUtils.createJfrogClient(SERVER_URL, SERVER_URL + '/artifactory', '', '', '', '')
        );
    }

    function createNockServer(resource: Resource, testCase: any = LATEST_TEST_CASE): nock.Scope {
        return nock(SERVER_URL)
            .get('/artifactory/api/system/ping')
            .reply(200, SERVICE_ID)
            .get(`/artifactory/` + resource.sourceUrl)
            .replyWithFile(200, testCase.file)
            .head(`/artifactory/` + resource.sourceUrl)
            .reply(200, { license: 'mit' }, { 'x-checksum-md5': '1', 'x-checksum-sha1': '2', 'x-checksum-sha256': testCase.checksum });
    }
});
