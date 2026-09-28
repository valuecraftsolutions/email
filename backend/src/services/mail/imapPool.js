/**
 * Keeps one authenticated IMAP connection per mailbox for a short idle period,
 * so consecutive API calls do not each pay for TLS + LOGIN (and do not trip
 * provider login throttling). Keys must change when credentials change.
 */
export function createImapPool({ createClient, idleMs = 120_000, logger }) {
  const entries = new Map();

  const discard = (key, entry) => {
    if (entries.get(key) === entry) entries.delete(key);
    clearTimeout(entry.timer);
    entry.ready
      .then((client) => client.logout())
      .catch(() => entry.client.close?.());
  };

  function acquire(key, options) {
    let entry = entries.get(key);
    if (entry && entry.client.usable === false && !entry.connecting) {
      discard(key, entry);
      entry = null;
    }
    if (!entry) {
      const client = createClient(options);
      entry = { client, active: 0, timer: null, connecting: true };
      const current = entry;
      client.on?.('error', (error) =>
        logger?.warn({ code: error?.code }, 'IMAP connection error'),
      );
      client.on?.('close', () => {
        if (entries.get(key) === current) entries.delete(key);
      });
      entry.ready = client.connect().then(
        () => {
          current.connecting = false;
          return client;
        },
        (error) => {
          if (entries.get(key) === current) entries.delete(key);
          throw error;
        },
      );
      entries.set(key, entry);
    }
    entry.active += 1;
    clearTimeout(entry.timer);
    return entry;
  }

  function release(key, entry) {
    entry.active -= 1;
    if (entry.active > 0) return;
    entry.timer = setTimeout(() => discard(key, entry), idleMs);
    entry.timer.unref?.();
  }

  return {
    /** Runs work(client) on a pooled, connected client. */
    async use(key, options, work) {
      const entry = acquire(key, options);
      try {
        const client = await entry.ready;
        return await work(client);
      } finally {
        release(key, entry);
      }
    },

    /** Closes every pooled connection whose key starts with prefix (e.g. a mailbox id). */
    evict(prefix) {
      for (const [key, entry] of entries)
        if (key.startsWith(prefix)) discard(key, entry);
    },

    closeAll() {
      for (const [key, entry] of entries) discard(key, entry);
    },

    get size() {
      return entries.size;
    },
  };
}
