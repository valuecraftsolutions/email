import { preferenceRepository } from '../../repositories/preferenceRepository.js';
import { settingsRepository } from '../../repositories/settingsRepository.js';
import { signatureRepository } from '../../repositories/signatureRepository.js';
import { userRepository } from '../../repositories/userRepository.js';
import { AppError } from '../../utils/errors.js';
import { AUDIT_ACTIONS } from '../security/auditActions.js';
import { sanitizeOutgoingHtml } from '../security/htmlSanitizer.js';

export const PLACEHOLDERS = [
  'full_name',
  'job_title',
  'department',
  'email',
  'phone',
  'company_name',
];

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Fills {{placeholders}} with HTML-escaped user values, removes unknown
 * placeholders and sanitizes the result. User data can never inject markup.
 */
export function renderSignature(template, values) {
  if (!template) return '';
  const filled = template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, name) =>
    PLACEHOLDERS.includes(name.toLowerCase())
      ? escapeHtml(values[name.toLowerCase()])
      : '',
  );
  return sanitizeOutgoingHtml(filled).trim();
}

const cleanTemplate = (html) => sanitizeOutgoingHtml(html ?? '').trim();

export function createSignatureService({ db, auditService }) {
  async function valuesFor(userId) {
    const [user, companyName] = await Promise.all([
      userRepository.findById(db, userId),
      settingsRepository.getValue(db, 'company.name', 'ValueCraft Minds'),
    ]);
    return {
      full_name: user.display_name || user.full_name,
      job_title: user.job_title,
      department: user.department,
      email: user.email,
      phone: user.phone,
      company_name: companyName,
    };
  }

  async function mine(userId) {
    const [company, own, prefs, values] = await Promise.all([
      signatureRepository.findCompanyDefault(db),
      signatureRepository.findUserDefault(db, userId),
      preferenceRepository.find(db, userId),
      valuesFor(userId),
    ]);
    const mode = prefs?.signature_mode ?? 'company';
    const rendered = {
      company: renderSignature(company?.body_html, values),
      own: renderSignature(own?.body_html, values),
    };
    return {
      mode,
      placeholders: PLACEHOLDERS,
      company: company
        ? { html: company.body_html, updatedAt: company.updated_at }
        : null,
      own: own ? { html: own.body_html, updatedAt: own.updated_at } : null,
      rendered,
      // What compose inserts automatically.
      active: mode === 'none' ? '' : (rendered[mode] ?? ''),
    };
  }

  return {
    mine,

    async updateMine(userId, { mode, html }) {
      if (html !== undefined)
        await signatureRepository.saveUserDefault(
          db,
          userId,
          cleanTemplate(html),
        );
      if (mode === 'own') {
        const own = await signatureRepository.findUserDefault(db, userId);
        if (!own?.body_html)
          throw new AppError(
            422,
            'SIGNATURE_EMPTY',
            'Write your signature before selecting it.',
            [{ field: 'html', message: 'Your signature is empty.' }],
          );
      }
      if (mode)
        await preferenceRepository.upsert(db, userId, { signatureMode: mode });
      return mine(userId);
    },

    async company() {
      const row = await signatureRepository.findCompanyDefault(db);
      return {
        html: row?.body_html ?? '',
        updatedAt: row?.updated_at ?? null,
        placeholders: PLACEHOLDERS,
      };
    },

    async updateCompany(auth, html, context) {
      const clean = cleanTemplate(html);
      const row = await db.transaction(async (tx) => {
        const saved = await signatureRepository.saveCompanyDefault(
          tx,
          clean,
          auth.userId,
        );
        await auditService.record(
          {
            actorUserId: auth.userId,
            action: AUDIT_ACTIONS.COMPANY_SIGNATURE_CHANGED,
            resourceType: 'signature',
            resourceId: saved.id,
            metadata: { length: clean.length },
            context,
          },
          tx,
        );
        return saved;
      });
      return {
        html: row.body_html,
        updatedAt: row.updated_at,
        placeholders: PLACEHOLDERS,
      };
    },

    async preview(userId, html) {
      return {
        html: renderSignature(cleanTemplate(html), await valuesFor(userId)),
      };
    },
  };
}
