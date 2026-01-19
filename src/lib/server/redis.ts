import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || 'redis';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

let redis: Redis | null = null;

// In-memory fallback store for development without Redis
const memoryStore = new Map<string, { value: string; expiry: number }>();

function getRedisClient(): Redis | null {
	if (redis) return redis;

	try {
		redis = new Redis({
			host: REDIS_HOST,
			port: REDIS_PORT,
			password: REDIS_PASSWORD,
			lazyConnect: true,
			maxRetriesPerRequest: 3,
			retryStrategy(times) {
				if (times > 3) return null;
				return Math.min(times * 100, 3000);
			}
		});

		redis.on('error', (err) => {
			console.warn('Redis connection error, using memory fallback:', err.message);
			redis = null;
		});

		return redis;
	} catch (err) {
		console.warn('Failed to create Redis client, using memory fallback');
		return null;
	}
}

/**
 * Get a value from Redis/memory store
 */
export async function get(key: string): Promise<string | null> {
	const client = getRedisClient();

	if (client) {
		try {
			return await client.get(key);
		} catch (err) {
			// Fall through to memory store
		}
	}

	// Memory fallback
	const entry = memoryStore.get(key);
	if (!entry) return null;
	if (entry.expiry && entry.expiry < Date.now()) {
		memoryStore.delete(key);
		return null;
	}
	return entry.value;
}

/**
 * Set a value in Redis/memory store with optional TTL
 */
export async function set(key: string, value: string, ttlSeconds?: number): Promise<void> {
	const client = getRedisClient();

	if (client) {
		try {
			if (ttlSeconds) {
				await client.setex(key, ttlSeconds, value);
			} else {
				await client.set(key, value);
			}
			return;
		} catch (err) {
			// Fall through to memory store
		}
	}

	// Memory fallback
	memoryStore.set(key, {
		value,
		expiry: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0
	});
}

/**
 * Increment a counter and return the new value
 */
export async function incr(key: string): Promise<number> {
	const client = getRedisClient();

	if (client) {
		try {
			return await client.incr(key);
		} catch (err) {
			// Fall through to memory store
		}
	}

	// Memory fallback
	const entry = memoryStore.get(key);
	const currentValue = entry ? parseInt(entry.value, 10) : 0;
	const newValue = currentValue + 1;
	memoryStore.set(key, {
		value: String(newValue),
		expiry: entry?.expiry || 0
	});
	return newValue;
}

/**
 * Set expiry on a key
 */
export async function expire(key: string, ttlSeconds: number): Promise<void> {
	const client = getRedisClient();

	if (client) {
		try {
			await client.expire(key, ttlSeconds);
			return;
		} catch (err) {
			// Fall through to memory store
		}
	}

	// Memory fallback
	const entry = memoryStore.get(key);
	if (entry) {
		entry.expiry = Date.now() + ttlSeconds * 1000;
	}
}

/**
 * Delete a key
 */
export async function del(key: string): Promise<void> {
	const client = getRedisClient();

	if (client) {
		try {
			await client.del(key);
			return;
		} catch (err) {
			// Fall through to memory store
		}
	}

	// Memory fallback
	memoryStore.delete(key);
}

/**
 * Get time to live for a key
 */
export async function ttl(key: string): Promise<number> {
	const client = getRedisClient();

	if (client) {
		try {
			return await client.ttl(key);
		} catch (err) {
			// Fall through to memory store
		}
	}

	// Memory fallback
	const entry = memoryStore.get(key);
	if (!entry || !entry.expiry) return -2;
	const remaining = Math.ceil((entry.expiry - Date.now()) / 1000);
	return remaining > 0 ? remaining : -2;
}
