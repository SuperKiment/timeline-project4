/** Options for {@link LoginRateLimiter}, all overridable for tests. */
export interface LoginRateLimiterOptions {
	/** Failures allowed within the window before blocking (default 5). */
	maxFailures?: number;
	/** Sliding window length in ms (default 15 minutes). */
	windowMs?: number;
	/** Injectable clock, for deterministic tests. */
	now?: () => number;
	/** Hard cap on tracked keys, oldest evicted first past this (default 10_000). */
	maxKeys?: number;
}

/**
 * In-memory login rate limiter (Conventions: key `lower(username)|ip`, 5
 * failures within 15 min blocks all attempts until the window clears;
 * success clears the key). Callers build the key; this class only tracks
 * failure timestamps per key.
 *
 * To keep memory bounded against a flood of fresh keys, `recordFailure`
 * sweeps globally-expired keys at most once per `windowMs` and evicts the
 * oldest-inserted keys once the map exceeds `maxKeys`.
 */
export class LoginRateLimiter {
	private readonly maxFailures: number;
	private readonly windowMs: number;
	private readonly now: () => number;
	private readonly maxKeys: number;
	private readonly failures = new Map<string, number[]>();
	private lastSweep = -Infinity;

	constructor(options: LoginRateLimiterOptions = {}) {
		this.maxFailures = options.maxFailures ?? 5;
		this.windowMs = options.windowMs ?? 15 * 60 * 1000;
		this.now = options.now ?? Date.now;
		this.maxKeys = options.maxKeys ?? 10_000;
	}

	/** Drops failures older than the window and returns what remains. */
	private prune(key: string): number[] {
		const cutoff = this.now() - this.windowMs;
		const kept = (this.failures.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
		if (kept.length > 0) {
			this.failures.set(key, kept);
		} else {
			this.failures.delete(key);
		}
		return kept;
	}

	/** Drops expired entries across all keys, at most once per `windowMs`. */
	private sweep(): void {
		const now = this.now();
		if (now - this.lastSweep < this.windowMs) return;
		this.lastSweep = now;

		const cutoff = now - this.windowMs;
		for (const [key, timestamps] of this.failures) {
			const kept = timestamps.filter((timestamp) => timestamp > cutoff);
			if (kept.length === 0) {
				this.failures.delete(key);
			} else if (kept.length !== timestamps.length) {
				this.failures.set(key, kept);
			}
		}
	}

	/**
	 * Evicts oldest-inserted keys until the map is back at `maxKeys`, skipping
	 * currently-blocked keys so a flood of fresh keys can't clear an existing
	 * lockout. Falls back to evicting the oldest key(s) regardless of blocked
	 * status only when every remaining key is blocked.
	 */
	private enforceCap(): void {
		const excess = this.failures.size - this.maxKeys;
		if (excess <= 0) return;

		const evictable: string[] = [];
		for (const key of this.failures.keys()) {
			if (this.prune(key).length < this.maxFailures) {
				evictable.push(key);
			}
		}

		const toEvict = evictable.length > 0 ? evictable : [...this.failures.keys()];
		for (let i = 0; i < excess && i < toEvict.length; i++) {
			this.failures.delete(toEvict[i]);
		}
	}

	/** Whether `key` currently has too many recent failures. */
	isBlocked(key: string): boolean {
		return this.prune(key).length >= this.maxFailures;
	}

	/** Number of keys currently tracked (may include expired-but-unswept entries). */
	get size(): number {
		return this.failures.size;
	}

	/** Records a failed login attempt for `key`. */
	recordFailure(key: string): void {
		this.sweep();
		const kept = this.prune(key);
		kept.push(this.now());
		this.failures.set(key, kept);
		this.enforceCap();
	}

	/** Clears all recorded failures for `key` (call on successful login). */
	reset(key: string): void {
		this.failures.delete(key);
	}
}

/** Process-wide rate limiter shared by the login route. */
export const loginRateLimiter = new LoginRateLimiter();
