import { assert } from 'chai';
import sinon from 'sinon';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { LogManager } from '../../main/log/logManager';
import { AnalyzerManager } from '../../main/scanLogic/scanRunners/analyzerManager';
import { Resource } from '../../main/utils/resource';

function createConnectionManager(url: string, logManager: LogManager): ConnectionManager {
    return {
        get url() {
            return url;
        },
        get logManager() {
            return logManager;
        },
        areXrayCredentialsSet(): boolean {
            return false;
        },
        areCompleteCredentialsSet(): boolean {
            return false;
        }
    } as ConnectionManager;
}

describe('AnalyzerManager.version', () => {
    it('parses version when stderr contains non-fatal warnings', async () => {
        const isOutdatedStub: sinon.SinonStub = sinon.stub(Resource.prototype, 'isOutdated').resolves(false);
        const runStub: sinon.SinonStub = sinon.stub(Resource.prototype, 'run').resolves('analyzer manager version: 1.30.2\n');
        try {
            const logManager: LogManager = new LogManager().activate();
            const manager: AnalyzerManager = new AnalyzerManager(
                createConnectionManager('https://example.jfrog.io', logManager),
                logManager
            );
            const version: string | undefined = await manager.version();
            assert.equal(version, '1.30.2');
            assert.isTrue(runStub.calledWith(sinon.match.array, sinon.match.func, sinon.match.object, false));
        } finally {
            runStub.restore();
            isOutdatedStub.restore();
        }
    });
});
