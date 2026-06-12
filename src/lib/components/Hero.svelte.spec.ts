import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import Hero from './Hero.svelte';

describe('Hero', () => {
	it('renders the platform name and mission', async () => {
		render(Hero);
		await expect.element(page.getByRole('heading', { name: 'PurFacted' })).toBeVisible();
		await expect.element(page.getByText(/community-evaluated\s+evidence/i)).toBeVisible();
	});
});
