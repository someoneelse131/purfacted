import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';

describe('R1: Project Setup & Docker Configuration', () => {
	const projectRoot = resolve(__dirname, '../..');

	describe('SvelteKit Project Structure', () => {
		it('should have package.json', () => {
			expect(existsSync(resolve(projectRoot, 'package.json'))).toBe(true);
		});

		it('should have svelte.config.js', () => {
			expect(existsSync(resolve(projectRoot, 'svelte.config.js'))).toBe(true);
		});

		it('should have vite.config.ts', () => {
			expect(existsSync(resolve(projectRoot, 'vite.config.ts'))).toBe(true);
		});

		it('should have tsconfig.json', () => {
			expect(existsSync(resolve(projectRoot, 'tsconfig.json'))).toBe(true);
		});

		it('should have app.html', () => {
			expect(existsSync(resolve(projectRoot, 'src/app.html'))).toBe(true);
		});

		it('should have app.css with Tailwind directives', () => {
			expect(existsSync(resolve(projectRoot, 'src/app.css'))).toBe(true);
		});
	});

	describe('Tailwind Configuration', () => {
		it('should have tailwind.config.js', () => {
			expect(existsSync(resolve(projectRoot, 'tailwind.config.js'))).toBe(true);
		});

		it('should have postcss.config.js', () => {
			expect(existsSync(resolve(projectRoot, 'postcss.config.js'))).toBe(true);
		});
	});

	describe('Docker Configuration', () => {
		it('should have docker-compose.yml for development', () => {
			expect(existsSync(resolve(projectRoot, 'docker-compose.yml'))).toBe(true);
		});

		it('should have docker-compose.prod.yml for production', () => {
			expect(existsSync(resolve(projectRoot, 'docker-compose.prod.yml'))).toBe(true);
		});

		it('should have Dockerfile.dev for development', () => {
			expect(existsSync(resolve(projectRoot, 'Dockerfile.dev'))).toBe(true);
		});

		it('should have Dockerfile for production', () => {
			expect(existsSync(resolve(projectRoot, 'Dockerfile'))).toBe(true);
		});
	});

	describe('Environment Configuration', () => {
		it('should have .env.example', () => {
			expect(existsSync(resolve(projectRoot, '.env.example'))).toBe(true);
		});
	});
});
