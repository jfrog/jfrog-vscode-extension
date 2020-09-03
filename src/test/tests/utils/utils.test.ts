import { IArtifact, IClientConfig } from 'xray-client-js';
import { IComponentMetadata } from '../../../main/goCenterClient/model/ComponentMetadata';
import { ConnectionManager } from '../../../main/connect/connectionManager';
import { LogManager } from '../../../main/log/logManager';
import * as os from 'os';

export const TestArtifact: IArtifact[] = [
    {
        general: {
            name: 'github.com/jfrog/gofrog',
            pkg_type: 'go',
            component_id: 'github.com/jfrog/gofrog:1.0.5',
            sha256: '',
            path: ''
        },
        issues: [],
        licenses: [
            {
                name: 'Apache-2.0',
                full_name: 'The Apache Software License, Version 2.0',
                more_info_url: [
                    'http://www.apache.org/licenses/LICENSE-2.0',
                    'https://spdx.org/licenses/Apache-2.0.html',
                    'https://spdx.org/licenses/Apache-2.0',
                    'http://www.opensource.org/licenses/apache2.0.php',
                    'http://www.opensource.org/licenses/Apache-2.0'
                ],
                components: ['go://github.com/jfrog/gofrog:1.0.5']
            }
        ]
    } as IArtifact,
    {
        general: {
            name: 'github.com/opencontainers/runc',
            pkg_type: 'go',
            component_id: 'github.com/opencontainers/runc:1.0.0-rc2',
            sha256: '',
            path: ''
        },
        issues: [
            {
                summary:
                    'runc through 1.0-rc6, as used in Docker before 18.09.2 and other products, allows attackers to overwrite the host runc binary (and consequently obtain host root access) by leveraging the ability to execute a command as root within one of these types of containers: (1) a new container with an attacker-controlled image, or (2) an existing container, to which the attacker previously had write access, that can be attached with docker exec. This occurs because of file-descriptor mishandling, related to /proc/self/exe.',
                description:
                    'runc through 1.0-rc6, as used in Docker before 18.09.2 and other products, allows attackers to overwrite the host runc binary (and consequently obtain host root access) by leveraging the ability to execute a command as root within one of these types of containers: (1) a new container with an attacker-controlled image, or (2) an existing container, to which the attacker previously had write access, that can be attached with docker exec. This occurs because of file-descriptor mishandling, related to /proc/self/exe.',
                issue_type: 'security',
                severity: 'High',
                provider: 'JFrog',
                created: '2019-02-27T00:00:00.394Z',
                impact_path: '',
                components: [
                    {
                        fixed_versions: ['[18.09.2]']
                    },
                    {
                        fixed_versions: ['[1.0.0-rc7]']
                    }
                ]
            },
            {
                summary: 'runc libcontainer/rootfs_linux.go msMoveRoot() Function Mount Namespace Handling Unauthorized Local Memory Access',
                description:
                    'runc contains a flaw in the msMoveRoot() function in libcontainer/rootfs_linux.go that is triggered as mount namespaces for syfs and proc filesystems are not properly handled. This may allow local attacker to bypass container restrictions and read or modify kernel memory via the /proc or /sys directories.',
                issue_type: 'security',
                severity: 'Low',
                provider: 'JFrog',
                created: '2019-05-05T00:00:00.910Z',
                components: [
                    {
                        fixed_versions: ['[1.0.0-rc7]']
                    }
                ]
            },
            {
                summary:
                    "RunC allowed additional container processes via 'runc exec' to be ptraced by the pid 1 of the container.  This allows the main processes of the container, if running as root, to gain access to file-descriptors of these new processes during the initialization and can lead to container escapes or modification of runC state before the process is fully placed inside the container.",
                description:
                    "RunC allowed additional container processes via 'runc exec' to be ptraced by the pid 1 of the container.  This allows the main processes of the container, if running as root, to gain access to file-descriptors of these new processes during the initialization and can lead to container escapes or modification of runC state before the process is fully placed inside the container.",
                issue_type: 'security',
                severity: 'Medium',
                provider: 'JFrog',
                created: '2019-05-06T00:00:00.500Z',
                components: [
                    {
                        fixed_versions: ['[1.0.0-rc3]']
                    }
                ]
            }
        ],
        licenses: [
            {
                name: 'Apache-2.0',
                full_name: 'The Apache Software License, Version 2.0',
                more_info_url: [
                    'http://www.apache.org/licenses/LICENSE-2.0',
                    'https://spdx.org/licenses/Apache-2.0.html',
                    'https://spdx.org/licenses/Apache-2.0',
                    'http://www.opensource.org/licenses/apache2.0.php',
                    'http://www.opensource.org/licenses/Apache-2.0'
                ],
                components: ['go://github.com/opencontainers/runc:1.0.0-rc2']
            }
        ]
    } as IArtifact
];

export const TestMetadata: IComponentMetadata[] = [
    {
        component_id: 'github.com/jfrog/gofrog:v1.0.5',
        description: 'A collection of go utilities',
        latest_version: 'v1.0.6',
        licenses: ['Apache-2.0'],
        contributors: 11,
        stars: 11,
        gocenter_readme_url: 'https://search.gocenter.io/github.com/jfrog/gofrog?v1.0.5&tab=readme',
        gocenter_metrics_url: 'https://search.gocenter.io/github.com/jfrog/gofrog?v1.0.5&tab=metrics',
        vulnerabilities: {
            severity: {},
            gocenter_security_url: ''
        },
        error: ''
    } as IComponentMetadata,
    {
        component_id: 'github.com/opencontainers/runc:v1.0.0-rc2',
        description: 'CLI tool for spawning and running containers according to the OCI specification',
        latest_version: 'v1.0.1-0.20190307181833-2b18fe1d885e',
        licenses: ['Apache-2.0'],
        contributors: 262,
        stars: 6798,
        gocenter_readme_url: 'https://search.gocenter.io/github.com/opencontainers/runc?v1.0.0-rc2&tab=readme',
        gocenter_metrics_url: 'https://search.gocenter.io/github.com/opencontainers/runc?v1.0.0-rc2&tab=metrics',
        vulnerabilities: {
            severity: {
                High: 1,
                Medium: 1
            },
            gocenter_security_url: 'https://search.gocenter.io/github.com/opencontainers/runc?v1.0.0-rc2&tab=security'
        },
        error: ''
    } as IComponentMetadata
];

export function createGoCenterConfig(): IClientConfig {
    let connectionManager: ConnectionManager = new ConnectionManager(new LogManager());
    let clientConfig: IClientConfig = {
        headers: {}
    } as IClientConfig;
    connectionManager.addUserAgentHeader(clientConfig);
    return clientConfig;
}

export function isWindows(): boolean {
    return os.platform() === 'win32';
}
