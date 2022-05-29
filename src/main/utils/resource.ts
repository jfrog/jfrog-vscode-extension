/*************************************************************
 * The following logic is part of the CVE applicability scan.*
 * It will be hidden until it is officially released.        *
 * ***********************************************************
 */
// import * as fs from 'fs';
// import * as path from 'path';
// import * as crypto from 'crypto';

// import { JfrogClient } from 'jfrog-client-js';
// import { IChecksumResult } from 'jfrog-client-js';
// import { ConnectionUtils } from '../connect/connectionUtils';
// import { LogManager } from '../log/logManager';
// import { ConnectionManager } from '../connect/connectionManager';

// export class Resource {
//     private static readonly MILLISECONDS_IN_HOUR: number = 3600000;
//     private TMP_DOWNLOAD_PATH: string = '';
//     private resourcePath: string = '';
//     private readonly _defaultJfrogClient: JfrogClient = ConnectionUtils.createJfrogClient(
//         'https://releases.jfrog.io',
//         'https://releases.jfrog.io/artifactory',
//         '',
//         '',
//         '',
//         ''
//     );

//     constructor(
//         private resourceLocalPath: string,
//         private resourceRemotePath: string,
//         private resourceName: string,
//         private _logManager: LogManager,
//         private _connectionManager?: ConnectionManager
//     ) {
//         this.TMP_DOWNLOAD_PATH = path.join(resourceLocalPath, 'download');
//         this.resourcePath = path.join(resourceLocalPath, resourceName);
//     }

//     public async download() {
//         if (!fs.existsSync(this.TMP_DOWNLOAD_PATH)) {
//             fs.mkdirSync(this.TMP_DOWNLOAD_PATH, { recursive: true });
//         } else if (Date.now() - fs.statSync(this.TMP_DOWNLOAD_PATH).birthtimeMs <= Resource.MILLISECONDS_IN_HOUR) {
//             // By here, someone else is already downloading the scanner.
//             return;
//         } else {
//             // Seems like it is a left over from other download.
//             fs.rmSync(this.TMP_DOWNLOAD_PATH);
//         }
//         try {
//             if (this._connectionManager !== undefined) {
//                 await this._connectionManager.downloadArtifactToFile(this.resourceRemotePath, path.join(this.TMP_DOWNLOAD_PATH, this.resourceName));
//             } else {
//                 await this._defaultJfrogClient
//                     .artifactory()
//                     .download()
//                     .downloadArtifactToFile(this.resourceRemotePath, path.join(this.TMP_DOWNLOAD_PATH, this.resourceName));
//             }

//             await this.copy(path.join(this.TMP_DOWNLOAD_PATH, this.resourceName), path.join(this.resourceLocalPath, this.resourceName));
//         } catch (error) {
//             this._logManager.logMessage('failed to update the applicable scanner: ' + error, 'WARN');
//         } finally {
//             fs.rmSync(this.TMP_DOWNLOAD_PATH, { recursive: true, force: true });
//         }
//     }
//     public copy(oldPath: string, newPath: string) {
//         return new Promise((resolve, reject) => {
//             const readStream: fs.ReadStream = fs.createReadStream(oldPath);
//             const writeStream: fs.WriteStream = fs.createWriteStream(newPath);

//             readStream.on('error', err => reject(err));
//             writeStream.on('error', err => reject(err));

//             writeStream.on('close', function() {
//                 resolve(true);
//             });

//             readStream.pipe(writeStream);
//         });
//     }
//     public async isUpdateAvailable(): Promise<boolean> {
//         if (!fs.existsSync(path.join(this.resourceLocalPath, this.resourceName))) {
//             return true;
//         }
//         let checksumResult: IChecksumResult = { sha256: '', sha1: '', md5: '' };
//         try {
//             if (this._connectionManager !== undefined) {
//                 checksumResult = await this._connectionManager.getArtifactChecksum(this.resourceRemotePath);
//             } else {
//                 checksumResult = await this._defaultJfrogClient
//                     .artifactory()
//                     .download()
//                     .getArtifactChecksum(this.resourceRemotePath);
//             }
//         } catch (error) {
//             this._logManager.logMessage('Could not upgrade Applicable Scanner. Error: ' + error, 'WARN');
//             return false;
//         }

//         const fileBuffer: Buffer = fs.readFileSync(path.join(this.resourceLocalPath, this.resourceName));
//         const hashSum: crypto.Hash = crypto.createHash('sha256').update(fileBuffer);
//         if (checksumResult.sha256 !== hashSum.digest('hex')) {
//             return true;
//         }
//         return false;
//     }

//     public getResourcePath(): string {
//         return this.resourcePath;
//     }
// }
