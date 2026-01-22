type Entry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, Entry>();

interface Options {
  windowMs: number;
  max: number;
}

export function rateLimit(key: string, options: Options) {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return { allowed: true };
  }

  if (entry.count >= options.max) {
    return {
      allowed: false,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count += 1;
  return { allowed: true };
}
