import { contactRepository } from '../../repositories/contactRepository.js';
import { AppError, notFound } from '../../utils/errors.js';

const SUGGESTION_LIMIT = 8;

export const toContactDto = (row) => ({
  id: row.id,
  firstName: row.first_name,
  lastName: row.last_name,
  displayName: row.display_name,
  name:
    row.display_name ||
    [row.first_name, row.last_name].filter(Boolean).join(' ') ||
    row.email,
  email: row.email,
  phone: row.phone,
  company: row.company,
  jobTitle: row.job_title,
  notes: row.notes,
  isFavorite: row.is_favorite,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const duplicateEmail = (error) =>
  error?.code === '23505' &&
  /contacts_owner_email_key/.test(error.constraint ?? error.message)
    ? new AppError(
        409,
        'CONTACT_EXISTS',
        'A contact with this email already exists.',
        [{ field: 'email', message: 'Already in your contacts.' }],
      )
    : error;

/** Personal address book. Every query is scoped to the signed-in user. */
export function createContactService({ db }) {
  return {
    async list(userId, { q, favorite, page, pageSize }) {
      const { rows, total } = await contactRepository.list(db, userId, {
        search: q,
        favorite,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      return { contacts: rows.map(toContactDto), total, page, pageSize };
    },

    async get(userId, id) {
      const row = await contactRepository.findById(db, userId, id);
      if (!row) throw notFound('Contact not found.');
      return toContactDto(row);
    },

    async create(userId, contact) {
      try {
        return toContactDto(
          await contactRepository.create(db, userId, contact),
        );
      } catch (error) {
        throw duplicateEmail(error);
      }
    },

    async update(userId, id, fields) {
      let row;
      try {
        row = await contactRepository.update(db, userId, id, fields);
      } catch (error) {
        throw duplicateEmail(error);
      }
      if (!row) throw notFound('Contact not found.');
      return toContactDto(row);
    },

    async remove(userId, id) {
      if (!(await contactRepository.remove(db, userId, id)))
        throw notFound('Contact not found.');
    },

    /** Recipient suggestions: own contacts first, then colleagues, unique by email. */
    async suggest(userId, q) {
      const search = q.toLowerCase();
      const [contacts, colleagues] = await Promise.all([
        contactRepository.suggest(db, userId, search, SUGGESTION_LIMIT),
        contactRepository.suggestDirectory(
          db,
          userId,
          search,
          SUGGESTION_LIMIT,
        ),
      ]);
      const seen = new Set();
      const suggestions = [];
      for (const c of contacts.map(toContactDto))
        if (!seen.has(c.email)) {
          seen.add(c.email);
          suggestions.push({ name: c.name, email: c.email, source: 'contact' });
        }
      for (const u of colleagues)
        if (!seen.has(u.email)) {
          seen.add(u.email);
          suggestions.push({
            name: u.display_name || u.full_name,
            email: u.email,
            detail: u.job_title,
            source: 'directory',
          });
        }
      return suggestions.slice(0, SUGGESTION_LIMIT);
    },
  };
}
