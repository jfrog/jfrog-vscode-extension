import { IacRunner } from '../../../main/scanLogic/scanRunners/iacScan';
import { SecretsRunner } from '../../../main/scanLogic/scanRunners/secretsScan';
import { JasRunnerFactory } from '../../../main/scanLogic/sourceCodeScan/jasRunnerFactory';

export class MockEntitledJasRunnerFactory extends JasRunnerFactory {
    public createIacRunners(): IacRunner[] {
        return super.createIacRunners();
    }
    public createSecretsRunners(): SecretsRunner[] {
        return super.createSecretsRunners();
    }
}
