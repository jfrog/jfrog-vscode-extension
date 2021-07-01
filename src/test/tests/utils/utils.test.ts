import * as os from 'os';
import { IArtifact } from 'jfrog-client-js';
import { DependenciesTreeNode } from '../../../main/treeDataProviders/dependenciesTree/dependenciesTreeNode';

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

export function isWindows(): boolean {
    return os.platform() === 'win32';
}

export function getNodeByArtifactId(root: DependenciesTreeNode, artifactId: string): DependenciesTreeNode | null {
    if (root === null) {
        return null;
    }
    for (let i: number = 0; i < root.children.length; i++) {
        if (root.children[i].generalInfo.artifactId === artifactId) {
            return root.children[i];
        }
        const res: DependenciesTreeNode | null = getNodeByArtifactId(root.children[i], artifactId);
        if (res !== null) {
            return res;
        }
    }
    return null;
}
