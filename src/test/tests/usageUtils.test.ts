import { IUsageFeature } from 'jfrog-client-js';
import { ConnectionManager } from '../../main/connect/connectionManager';
import { assert } from 'chai';
import { LogManager } from '../../main/log/logManager';
import { PackageType } from '../../main/types/projectType';
import { UsageJasScanType, UsageUtils } from '../../main/utils/usageUtils';
import { Uri } from 'vscode';

describe('Usage Utils Tests', async () => {
    const logManager: LogManager = new LogManager().activate();
    const withAdvancedSecurityScan: Set<UsageJasScanType> = new Set<UsageJasScanType>();
    withAdvancedSecurityScan.add(UsageJasScanType.APPLICABILITY);
    withAdvancedSecurityScan.add(UsageJasScanType.IAC);
    withAdvancedSecurityScan.add(UsageJasScanType.SECRETS);

    [
        {
            test: 'Not supported',
            supportedScans: new Set<UsageJasScanType>(),
            descriptors: getDummyDescriptors(),
            expectedFeatures: [],
            expectedReportSent: false
        },
        {
            test: 'With dependencies scan',
            supportedScans: new Set<UsageJasScanType>(),
            descriptors: getDummyDescriptors(PackageType.Go, PackageType.Npm),
            expectedFeatures: [{ featureId: 'go-deps' }, { featureId: 'npm-deps' }],
            expectedReportSent: true
        },
        {
            test: 'With advance scan',
            supportedScans: withAdvancedSecurityScan,
            descriptors: getDummyDescriptors(PackageType.Go, PackageType.Npm),
            expectedFeatures: [
                { featureId: 'go-deps' },
                { featureId: 'npm-deps' },
                { featureId: 'contextual' },
                { featureId: 'iac' },
                { featureId: 'secrets' }
            ],
            expectedReportSent: true
        }
    ].forEach(testCase => {
        it('Send usage report features - ' + testCase.test, async () => {
            const dummyConnectionManager: ConnectionMangerDummy = new ConnectionMangerDummy(logManager);
            dummyConnectionManager.expectedFeatures = testCase.expectedFeatures;
            await UsageUtils.sendUsageReport(testCase.supportedScans, testCase.descriptors, dummyConnectionManager).then(() =>
                assert.equal(dummyConnectionManager.reportSent, testCase.expectedReportSent)
            );
        });
    });

    function getDummyDescriptors(...types: PackageType[]): Map<PackageType, Uri[]> {
        let descriptors: Map<PackageType, Uri[]> = new Map<PackageType, Uri[]>();
        for (let type of types) {
            descriptors.set(type, [Uri.parse('/somewhere/file'), Uri.parse('/somewhere/other')]);
        }
        return descriptors;
    }
});

class ConnectionMangerDummy extends ConnectionManager {
    private _expectedFeatures: IUsageFeature[] = [];
    private _reportSent: boolean = false;

    /** @override */
    public async sendUsageReport(featureArray: IUsageFeature[]): Promise<void> {
        this._reportSent = true;
        assert.sameDeepMembers(featureArray, this._expectedFeatures);
    }

    public set expectedFeatures(value: IUsageFeature[]) {
        this._expectedFeatures = value;
        this._reportSent = false;
    }

    public get reportSent(): boolean {
        return this._reportSent;
    }
}
