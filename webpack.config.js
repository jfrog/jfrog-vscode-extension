
'use strict';

const path = require('path');

/**@type {import('webpack').Configuration}*/
const extensionConfig = {
    target: 'node',
    entry: './src/extension.ts',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2',
        devtoolModuleFilenameTemplate: '../[resource-path]'
    },
    devtool: 'source-map',
    externals: {
        vscode: 'commonjs vscode',
        keytar: 'keytar'
    },
    resolve: {
        extensions: ['.ts', '.js']
    },

    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                loader: 'ts-loader'
            }
        ]
    },
    node: {
        __filename: false
    }
};

const reactConfig = (env, argv) => {
    return {
        devtool: env.NODE_ENV == "production" ? "" : "source-map",
        entry: path.join(__dirname, "src", "main", "webviews", "app", "index.tsx"),
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: 'index.js',
            devtoolModuleFilenameTemplate: "../[resource-path]",
        },
        externals: {
            vscode: "commonjs vscode"
        },
        resolve: {
            extensions: ['.ts', '.js', '.json', '.tsx', '.css', '.svg'],
            fallback: {
                "url": false,
                "path": false,
                "process": false,
            }
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    loader: 'ts-loader'
                },
                {
                    test: /\.css?$/,
                    use: ['style-loader', 'css-loader', 'postcss-loader']
                },
                {
                    test: /\.(png|svg|jpg|jpeg|gif)$/i,
                    type: 'asset/resource',
                }
            ]
        }

    }
};

    module.exports = [extensionConfig, reactConfig]
