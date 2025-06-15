const github = require('@actions/github');
const core = require('@actions/core');
const fs = require('fs');

const tag = process.env.GITHUB_REF.split('/')[2];
const octokit = github.getOctokit(process.env.GITHUB_TOKEN);

octokit.repos.listReleases({
    owner: 'jfrog',
    repo: 'jfrog-vscode-extension'
})
    .then(releases => {
        const release = releases.data.find(release => release.tag_name === tag);
        const vsixFileName = 'jfrog-vscode-extension-' + tag + '.vsix';
        const vsixFilePath = '../' + vsixFileName;
        const vsixFileData = fs.readFileSync(vsixFilePath);
        const vsixContentLength = fs.statSync(vsixFilePath).size;

        core.info('Uploading ' + vsixFileName);

        return octokit.repos.uploadReleaseAsset({
            owner: 'jfrog',
            repo: 'jfrog-vscode-extension',
            id: release.id,
            name: vsixFileName,
            url: release.upload_url,
            data: vsixFileData,
            headers: {
                'content-length': vsixContentLength,
                'content-type': 'application/zip'
            }
        });
    })
    .then(() => {
        core.info('Upload complete!');
    })
    .catch(error => {
        core.error(error);
    });


