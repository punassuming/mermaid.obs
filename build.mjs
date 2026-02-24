#!/usr/bin/env node
import { existsSync } from 'fs';
import { spawn } from 'child_process';

const prod = process.argv.includes('production');

// Check if source files exist
if (!existsSync("src/main.ts")) {
	console.log("No src/main.ts found. Checking for existing main.js...");
	if (existsSync("main.js")) {
		console.log("✓ Using existing pre-built main.js");
		console.log("  (To build from source, create src/main.ts)");
		process.exit(0);
	} else {
		console.error("✗ Error: Neither src/main.ts nor main.js found");
		console.error("  Please create src/main.ts or ensure main.js exists");
		process.exit(1);
	}
}

// If we have source files, run TypeScript check and esbuild
console.log("Building from source...");

// Run TypeScript check
const tsc = spawn('tsc', ['-noEmit', '-skipLibCheck'], { stdio: 'inherit' });

tsc.on('error', (err) => {
	console.error(`✗ Failed to spawn tsc: ${err.message}`);
	console.error('  Make sure dependencies are installed: npm install');
	process.exit(1);
});

tsc.on('close', (code) => {
	if (code !== 0) {
		process.exit(code);
	}

	// Run esbuild
	const esbuildArgs = ['esbuild.config.mjs'];
	if (prod) {
		esbuildArgs.push('production');
	}
	const esbuild = spawn('node', esbuildArgs, { stdio: 'inherit' });

	esbuild.on('error', (err) => {
		console.error(`✗ Failed to spawn node/esbuild: ${err.message}`);
		console.error('  Make sure dependencies are installed: npm install');
		process.exit(1);
	});

	esbuild.on('close', (code) => {
		process.exit(code);
	});
});
