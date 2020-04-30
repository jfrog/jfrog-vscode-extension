import { IVulnerabilities } from './Vulnerabilities';

export interface IComponentMetadata {
    component_id: string;
    description: string;
    latest_version: string;
    licenses: string[];
    contributors: number;
    stars: number;
    gocenter_readme_url: string;
    gocenter_metrics_url: string;
    vulnerabilities: IVulnerabilities;
    error: string;
}
