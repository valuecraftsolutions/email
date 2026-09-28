/**
 * Phase 2 provider verification against the real mail server, using the
 * encrypted credentials saved when a user connected their mailbox.
 *
 *   npm run mail:check -- --email roshan@valuecraftminds.com
 *   npm run mail:check -- --email roshan@valuecraftminds.com --send-to roshan@valuecraftminds.com
 *
 * Reads only counts and metadata (no subjects or bodies are printed). Mail is
 * sent only when --send-to is given explicitly.
 */
import { parseArgs } from 'node:util';
import '../src/config/loadEnv.js';
import { loadConfigOrExit } from '../src/config/env.js';
import { createLogger } from '../src/config/logger.js';
import { createPostgresDatabase } from '../src/db/database.js';
import { mailboxRepository } from '../src/repositories/mailboxRepository.js';
import { createMailProviderFactory } from '../src/services/mail/mailProviderRegistry.js';
import { credentialsAad } from '../src/services/mail/mailService.js';
import { createEncryptionService } from '../src/services/security/encryptionService.js';
import { emailSchema } from '../src/validators/authValidators.js';

const { values } = parseArgs({
  options: { email: { type: 'string' }, 'send-to': { type: 'string' } },
});
const email = emailSchema.safeParse(values.email ?? '');
const sendTo = values['send-to']
  ? emailSchema.safeParse(values['send-to'])
  : null;
if (!email.success || (sendTo && !sendTo.success)) {
  console.error(
    'Usage: npm run mail:check -- --email <mailbox> [--send-to <address>]',
  );
  process.exit(1);
}

const config = loadConfigOrExit();
const logger = createLogger({ logLevel: 'warn' });
const db = createPostgresDatabase(config.database, logger);
const factory = createMailProviderFactory({ config, logger });
const results = [];

async function step(name, work) {
  const started = Date.now();
  try {
    const detail = await work();
    results.push({ step: name, ok: true });
    console.log(
      `  PASS  ${name} (${Date.now() - started} ms)${detail ? ` - ${detail}` : ''}`,
    );
  } catch (error) {
    results.push({ step: name, ok: false });
    console.log(`  FAIL  ${name} - ${error.code ?? 'ERROR'}: ${error.message}`);
  }
}

try {
  const row = await mailboxRepository.findByEmail(db, email.data);
  const full = row
    ? await db.query(
        'SELECT credentials_encrypted, provider FROM mailboxes WHERE id = $1',
        [row.id],
      )
    : null;
  const ciphertext = full?.rows[0]?.credentials_encrypted;
  if (!ciphertext) {
    console.error(
      `No connected mailbox for ${email.data}. Connect it in Settings → Mailbox first.`,
    );
    process.exitCode = 1;
  } else {
    const credentials = JSON.parse(
      createEncryptionService(config.encryption).decrypt(
        ciphertext,
        credentialsAad(row.id),
      ),
    );
    const provider = factory.create(full.rows[0].provider, {
      mailbox: { id: row.id, emailAddress: row.email_address },
      credentials,
      pooled: false,
    });
    console.log(
      `Checking ${row.email_address} via ${config.mail.imap.host}:${config.mail.imap.port} / ${config.mail.smtp.host}:${config.mail.smtp.port}`,
    );

    let folders = [];
    let inbox = null;
    await step('IMAP + SMTP authentication', async () => {
      await provider.verifyConnection();
    });
    await step('Folder access', async () => {
      folders = await provider.listFolders();
      const roles = folders
        .filter((f) => f.role)
        .map((f) => `${f.role}=${f.path}`);
      return `${folders.length} folders; ${roles.join(', ')}`;
    });
    await step('Message list (INBOX)', async () => {
      inbox = await provider.listMessages('INBOX', { page: 1, pageSize: 5 });
      return `${inbox.total} messages, fetched ${inbox.messages.length} newest`;
    });
    await step('Message retrieval', async () => {
      const latest = inbox?.messages[0];
      if (!latest) return 'inbox is empty; skipped';
      const message = await provider.getMessage('INBOX', latest.uid);
      return `uid ${latest.uid}: html ${message.html?.length ?? 0} chars, text ${message.text?.length ?? 0} chars, ${message.attachments.length} attachment(s)`;
    });
    if (sendTo)
      await step('Outgoing mail (SMTP) + Sent copy', async () => {
        const result = await provider.sendMessage({
          from: { name: 'ValueCraft Mail', address: row.email_address },
          to: [sendTo.data],
          subject: 'ValueCraft Mail connectivity test',
          text: 'This is an automated connectivity test from ValueCraft Mail (Phase 2). No action is needed.',
        });
        return `accepted ${result.accepted}, rejected ${result.rejected}, saved to Sent: ${result.savedToSent}`;
      });
    else
      console.log(
        '  SKIP  Outgoing mail (pass --send-to <address> to send a test message)',
      );

    const failed = results.filter((r) => !r.ok).length;
    console.log(
      failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.',
    );
    if (failed) process.exitCode = 1;
  }
} catch (error) {
  console.error(`Check aborted: ${error.message}`);
  process.exitCode = 1;
} finally {
  factory.close();
  await db.close();
}
