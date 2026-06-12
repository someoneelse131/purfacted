import { describe, expect, it } from 'vitest';
import { getHealth } from './health';

const up = () => Promise.resolve();
const down = () => Promise.reject(new Error('connection refused'));

describe('getHealth', () => {
	it('reports ok when db and redis are reachable', async () => {
		const report = await getHealth({ checkDb: up, checkRedis: up });
		expect(report.status).toBe('ok');
		expect(report.db).toBe('up');
		expect(report.redis).toBe('up');
		expect(report.uptimeSeconds).toBeGreaterThanOrEqual(0);
	});

	it('reports degraded when the database is down', async () => {
		const report = await getHealth({ checkDb: down, checkRedis: up });
		expect(report.status).toBe('degraded');
		expect(report.db).toBe('down');
		expect(report.redis).toBe('up');
	});

	it('reports degraded when redis is down', async () => {
		const report = await getHealth({ checkDb: up, checkRedis: down });
		expect(report.status).toBe('degraded');
		expect(report.redis).toBe('down');
	});

	it('never throws even when every check rejects', async () => {
		const report = await getHealth({ checkDb: down, checkRedis: down });
		expect(report.status).toBe('degraded');
		expect(report.db).toBe('down');
		expect(report.redis).toBe('down');
	});
});
