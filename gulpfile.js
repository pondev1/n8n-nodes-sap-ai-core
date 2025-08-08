const { src, dest, parallel } = require('gulp');

function buildIcons() {
	return src('nodes/**/*.{png,svg}')
		.pipe(dest('dist/nodes'));
}

function copyCredentialIcons() {
	return src('credentials/**/*.{png,svg}')
		.pipe(dest('dist/credentials'));
}

function copyAssets() {
	return src(['nodes/**/*.{json,md}', 'credentials/**/*.{json,md}'])
		.pipe(dest('dist/'));
}

const build = parallel(buildIcons, copyCredentialIcons, copyAssets);

exports.default = build;
exports['build:icons'] = build;
exports.buildIcons = buildIcons;
exports.copyCredentialIcons = copyCredentialIcons;
exports.copyAssets = copyAssets;