import * as path from 'path';
import * as tmp from 'tmp';
import * as fs from 'fs';
import nock from 'nock';
import * as crypto from 'crypto';

import { Resource } from '../../main/utils/resource';
import { LogManager } from '../../main/log/logManager';
import { ConnectionUtils } from '../../main/connect/connectionUtils';
import { assert } from 'chai';

const SERVER_URL: string = 'http://localhost:8000';
describe('Resource Tests', () => {
    let logManager: LogManager = new LogManager().activate();
    const serviceId: string = 'jfrog@some.me';

    const tmpPath: string = path.join(tmp.dirSync().name, 'applicability-scan');
    const resource: Resource = new Resource(
        tmpPath,
        'download/path/to/resource/file1',
        'file1',
        logManager,
        ConnectionUtils.createJfrogClient(SERVER_URL, SERVER_URL + '/artifactory', '', '', '', '')
    );
    const file: string = path.join(__dirname, '..', 'resources', 'testsdata', 'file1.txt');
    const fileBuffer: Buffer = fs.readFileSync(file);
    const fileSha256: string = crypto
        .createHash('sha256')
        .update(fileBuffer)
        .digest('hex');
    after(() => {
        nock.cleanAll();
    });

    it('Update resource', async () => {
        try {
            const scope: nock.Scope = createNockServer();
            assert.isTrue(await resource.shouldUpdate());
            await resource.update();
            assert.isTrue(fs.existsSync(path.join(tmpPath, 'file1')));
            const text: string = fs.readFileSync(path.join(tmpPath, 'file1')).toString();
            assert.equal(text, 'hello-world');
            assert.isFalse(await resource.shouldUpdate());
            assert.equal(resource.getPath(), path.join(tmpPath, 'file1'));
            assert.isTrue(scope.isDone());
        } finally {
            fs.rmSync(path.join(tmpPath, 'file1'));
        }
    });

    it('Bad request while update resource', async () => {
        let err: any;
        try {
            nock(SERVER_URL)
                .get('/artifactory/api/system/ping')
                .reply(200, serviceId)
                .get(`/artifactory/download/path/to/resource/file1`)
                .reply(400)
                .head(`/artifactory/download/path/to/resource/file1`)
                .reply(400);
            // Download updates.
            await resource.update();
        } catch (error) {
            err = error;
        }
        assert.isDefined(err, 'Expect to have a timeout error');
        assert.strictEqual(err.code, 'ERR_BAD_REQUEST');
        assert.isDefined(err.message, 'Request failed with status code 400');
    });

    it('Timeout while update resource', async () => {
        let err: Error | unknown;
        try {
            nock(SERVER_URL)
                .get('/artifactory/api/system/ping')
                .reply(200, serviceId)
                .get(`/artifactory/download/path/to/resource/file1`)
                .replyWithFile(200, file)
                .head(`/artifactory/download/path/to/resource/file1`)
                .delay(6000)
                .reply(200, { license: 'mit' }, { 'x-checksum-md5': '1', 'x-checksum-sha1': '2', 'x-checksum-sha256': '123' });
            // Download updates.
            await resource.update();
            // Try to check if we have the latest and expect to fail for timeout.
            await resource.update();
        } catch (error) {
            err = error;
        } finally {
            fs.rmSync(path.join(tmpPath, 'file1'));
        }
        assert.isDefined(err, 'Expect to have a timeout error');
    });

    it('Update of resource has already begun', async () => {
        fs.mkdirSync(path.join(tmpPath, 'download'), { recursive: true });
        await resource.update();
        assert.isFalse(fs.existsSync(path.join(tmpPath, 'file1')));
    });

    it('Update of resource has already begun long time ago', async () => {
        createNockServer('123');
        const tmp: number = Resource.MILLISECONDS_IN_HOUR;
        try {
            // Fake that the download has already begun.
            fs.mkdirSync(path.join(tmpPath, 'download'), { recursive: true });
            // Reduce the time limit for indicating the previous update was stuck.
            Resource.MILLISECONDS_IN_HOUR = 0;
            await resource.update();
            // See that the upload was successfully finished and the resource was updated.
            assert.isTrue(fs.existsSync(path.join(tmpPath, 'file1')), 'expected to find' + path.join(tmpPath, 'file1'));
        } finally {
            Resource.MILLISECONDS_IN_HOUR = tmp;
            fs.rmSync(path.join(tmpPath, 'file1'));
        }
    });

    function createNockServer(sha256?: string): nock.Scope {
        return nock(SERVER_URL)
            .get(`/artifactory/download/path/to/resource/file1`)
            .replyWithFile(200, file)
            .head(`/artifactory/download/path/to/resource/file1`)
            .reply(200, { license: 'mit' }, { 'x-checksum-md5': '1', 'x-checksum-sha1': '2', 'x-checksum-sha256': sha256 ?? fileSha256 });
    }
});
