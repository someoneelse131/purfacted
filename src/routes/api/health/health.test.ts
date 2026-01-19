import { describe, it, expect } from 'vitest';
import { GET } from './+server';

describe('Health API Endpoint', () => {
	it('should return ok status', async () => {
		const response = await GET({} as any);
		const data = await response.json();

		expect(data.status).toBe('ok');
		expect(data.service).toBe('purfacted');
		expect(data.version).toBe('0.1.0');
		expect(data.timestamp).toBeDefined();
	});

	it('should return valid ISO timestamp', async () => {
		const response = await GET({} as any);
		const data = await response.json();

		const timestamp = new Date(data.timestamp);
		expect(timestamp.toISOString()).toBe(data.timestamp);
	});
});
