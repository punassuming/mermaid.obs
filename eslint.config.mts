import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						'eslint.config.js',
						'manifest.json'
					]
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
		plugins: {
			"@typescript-eslint": tseslint.plugin,
		},
		rules: {
			"@typescript-eslint/no-floating-promises": "off",
			"@typescript-eslint/no-explicit-any": "error",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "error",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-deprecated": "off",
			"@typescript-eslint/no-unused-vars": "off",
			"@microsoft/sdl/no-inner-html": "off",
			"obsidianmd/no-static-styles-assignment": "off",
			"no-empty": "off",
			"no-alert": "off",
			"obsidianmd/settings-tab/no-manual-html-headings": "off",
			"obsidianmd/ui/sentence-case": "off",
			"obsidianmd/hardcoded-config-path": "off",
		},
	},
	{
		ignores: [
			"node_modules",
			"dist",
			"build.mjs",
			"esbuild.config.mjs",
			"eslint.config.js",
			"eslint.config.mts",
			"version-bump.mjs",
			"versions.json",
			"main.js",
		],
	},
);
