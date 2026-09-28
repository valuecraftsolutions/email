import { HostingerMailProvider } from './HostingerMailProvider.js';
import { createImapPool } from './imapPool.js';
import { ImapFlow } from 'imapflow';

const PROVIDERS = { [HostingerMailProvider.id]: HostingerMailProvider };

export const supportedProviders = () => Object.keys(PROVIDERS);

/**
 * Creates provider instances for a mailbox. A new provider is added by
 * implementing MailProvider and registering its class in PROVIDERS.
 */
export function createMailProviderFactory({
  config,
  logger,
  providers = PROVIDERS,
}) {
  const imapPool = createImapPool({
    createClient: (options) => new ImapFlow(options),
    logger,
  });

  return {
    /**
     * @param {string} providerId
     * @param {{ mailbox: {id, emailAddress}, credentials: {username, password}, pooled?: boolean }} options
     */
    create(providerId, { mailbox, credentials, pooled = true }) {
      const Provider = providers[providerId];
      if (!Provider) throw new Error(`Unknown mail provider "${providerId}"`);
      return new Provider({
        mailbox,
        credentials,
        config: config.mail,
        logger,
        imapPool: pooled ? imapPool : null,
      });
    },
    /** Drops pooled connections for a mailbox (after credential changes). */
    evict: (mailboxId) => imapPool.evict(`${mailboxId}:`),
    close: () => imapPool.closeAll(),
  };
}
