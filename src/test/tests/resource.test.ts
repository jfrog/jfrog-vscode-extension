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
    const tmpPath: string = path.join(tmp.dirSync().name, 'applicability.scan');
    const resource: Resource = new Resource(
        tmpPath,
        'download/path/to/resource/file1',
        'file1',
        logManager,
        ConnectionUtils.createJfrogClient(SERVER_URL, SERVER_URL + '/artifactory', '', '', '', '')
    );
    const file: string = path.join(__dirname, '..', 'resources', 'testsdata', 'file1.txt');
    after(() => {
        nock.cleanAll();
    });

    it('Update resource', async () => {
        try {
            const fileBuffer: Buffer = fs.readFileSync(file);
            const hashSum: crypto.Hash = crypto.createHash('sha256').update(fileBuffer);
            const scope: nock.Scope = nock(SERVER_URL)
                .get(`/artifactory/download/path/to/resource/file1`)
                .replyWithFile(200, file)
                .head(`/artifactory/download/path/to/resource/file1`)
                .reply(200, { license: 'mit' }, { 'x-checksum-md5': '1', 'x-checksum-sha1': '2', 'x-checksum-sha256': hashSum.digest('hex') });
            assert.isTrue(await resource.isUpdateAvailable());
            await resource.update(true);
            assert.isTrue(fs.existsSync(path.join(tmpPath, 'file1')));
            const text: string = fs.readFileSync(path.join(tmpPath, 'file1')).toString();
            assert.equal(text, 'hello-world');
            assert.isFalse(await resource.isUpdateAvailable());
            assert.equal(resource.getPath(), path.join(tmpPath, 'file1'));
            assert.isTrue(scope.isDone());
        } finally {
            fs.rmSync(path.join(tmpPath, 'file1'));
        }
    });

    it('Update of resource has already begun', async () => {
        fs.mkdirSync(path.join(tmpPath, 'download'), { recursive: true });
        await resource.update(true);
        assert.isFalse(fs.existsSync(path.join(tmpPath, 'file1')));
    });
});
