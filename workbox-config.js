module.exports = {
	globDirectory: 'docs/',
	globPatterns: [
		'**/*.{png,ico,js,html,webmanifest}'
	],
	swDest: 'docs/service-worker.js',
	ignoreURLParametersMatching: [
		/^utm_/,
		/^fbclid$/
	]
};