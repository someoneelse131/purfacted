export type ComponentStatus = 'up' | 'down';

export interface HealthReport {
	status: 'ok' | 'degraded';
	db: ComponentStatus;
	redis: ComponentStatus;
	uptimeSeconds: number;
}

export interface HealthDeps {
	checkDb: () => Promise<unknown>;
	checkRedis: () => Promise<unknown>;
}

async function probe(check: () => Promise<unknown>): Promise<ComponentStatus> {
	try {
		await check();
		return 'up';
	} catch {
		return 'down';
	}
}

export async function getHealth(deps: HealthDeps): Promise<HealthReport> {
	const [db, redis] = await Promise.all([probe(deps.checkDb), probe(deps.checkRedis)]);
	return {
		status: db === 'up' && redis === 'up' ? 'ok' : 'degraded',
		db,
		redis,
		uptimeSeconds: Math.round(process.uptime())
	};
}
