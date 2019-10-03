const github = require('@actions/github');
const core = require('@actions/core');
const fs = require('fs');

const tag = process.env.GITHUB_REF.split('/')[2];
const octokit = new github.GitHub(process.env.GITHUB_TOKEN);
octokit.repos
    .listReleases({
        owner: 'jfrog',
        repo: 'jfrog-vscode-extension'
    })
    .then(releases => {
        const release = releases.data.find(release => release.tag_name === tag);
        const vsixFileName = 'jfrog-vscode-extension-' + tag + '.vsix';
        const vsixFilePath = '../' + vsixFileName;
        core.info('Uploading ' + vsixFileName);
        octokit.repos.uploadReleaseAsset({
            file: fs.createReadStream(vsixFilePath),
            headers: {
                'content-length': fs.statSync(vsixFilePath).size,
                'content-type': 'application/zip'
            },
            name: vsixFileName,
            url: release.upload_url
        });
    })
    .catch(error => {
        core.error(error);
    });