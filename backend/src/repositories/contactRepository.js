const COLUMNS = `id, first_name, last_name, display_name, email, phone, company,
  job_title, notes, is_favorite, created_at, updated_at`;

// Contacts are always scoped by owner_user_id; there is no cross-user access path.
const SORT_NAME = `lower(coalesce(nullif(display_name, ''),
  nullif(trim(concat_ws(' ', first_name, last_name)), ''), email))`;

const escapeLike = (value) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

export const contactRepository = {
  async list(q, ownerId, { search, favorite, limit, offset }) {
    const params = [ownerId];
    const where = ['owner_user_id = $1'];
    if (search) {
      params.push(`%${escapeLike(search.toLowerCase())}%`);
      const p = `$${params.length}`;
      where.push(`(lower(coalesce(display_name, '')) LIKE ${p}
        OR lower(concat_ws(' ', first_name, last_name)) LIKE ${p}
        OR lower(coalesce(email, '')) LIKE ${p}
        OR lower(coalesce(company, '')) LIKE ${p})`);
    }
    if (favorite) where.push('is_favorite');
    params.push(limit, offset);
    const { rows } = await q.query(
      `SELECT ${COLUMNS}, count(*) OVER ()::int AS total_count
       FROM contacts WHERE ${where.join(' AND ')}
       ORDER BY is_favorite DESC, ${SORT_NAME}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows, total: rows[0]?.total_count ?? 0 };
  },

  async findById(q, ownerId, id) {
    const { rows } = await q.query(
      `SELECT ${COLUMNS} FROM contacts WHERE id = $1 AND owner_user_id = $2`,
      [id, ownerId],
    );
    return rows[0] ?? null;
  },

  async create(q, ownerId, c) {
    const { rows } = await q.query(
      `INSERT INTO contacts (owner_user_id, first_name, last_name, display_name, email,
         phone, company, job_title, notes, is_favorite)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${COLUMNS}`,
      [
        ownerId,
        c.firstName,
        c.lastName,
        c.displayName,
        c.email,
        c.phone,
        c.company,
        c.jobTitle,
        c.notes,
        c.isFavorite ?? false,
      ],
    );
    return rows[0];
  },

  /** Partial update: only provided fields change. */
  async update(q, ownerId, id, fields) {
    const map = {
      firstName: 'first_name',
      lastName: 'last_name',
      displayName: 'display_name',
      email: 'email',
      phone: 'phone',
      company: 'company',
      jobTitle: 'job_title',
      notes: 'notes',
      isFavorite: 'is_favorite',
    };
    const sets = [];
    const params = [id, ownerId];
    for (const [key, column] of Object.entries(map))
      if (fields[key] !== undefined) {
        params.push(fields[key]);
        sets.push(`${column} = $${params.length}`);
      }
    if (!sets.length) return this.findById(q, ownerId, id);
    const { rows } = await q.query(
      `UPDATE contacts SET ${sets.join(', ')}
       WHERE id = $1 AND owner_user_id = $2 RETURNING ${COLUMNS}`,
      params,
    );
    return rows[0] ?? null;
  },

  async remove(q, ownerId, id) {
    const { rowCount } = await q.query(
      'DELETE FROM contacts WHERE id = $1 AND owner_user_id = $2',
      [id, ownerId],
    );
    return rowCount > 0;
  },

  /** Compose suggestions from the user's contacts. */
  async suggest(q, ownerId, search, limit) {
    const { rows } = await q.query(
      `SELECT ${COLUMNS} FROM contacts
       WHERE owner_user_id = $1 AND email IS NOT NULL
         AND (lower(coalesce(display_name, '')) LIKE $2
           OR lower(concat_ws(' ', first_name, last_name)) LIKE $2
           OR email LIKE $2)
       ORDER BY is_favorite DESC, (email LIKE $3) DESC, ${SORT_NAME}
       LIMIT $4`,
      [ownerId, `%${escapeLike(search)}%`, `${escapeLike(search)}%`, limit],
    );
    return rows;
  },

  /** Colleagues from the application directory (active users only). */
  async suggestDirectory(q, excludeUserId, search, limit) {
    const { rows } = await q.query(
      `SELECT full_name, display_name, email, job_title FROM users
       WHERE status = 'ACTIVE' AND id <> $1
         AND (lower(full_name) LIKE $2 OR lower(coalesce(display_name, '')) LIKE $2 OR email LIKE $2)
       ORDER BY (email LIKE $3) DESC, lower(full_name)
       LIMIT $4`,
      [
        excludeUserId,
        `%${escapeLike(search)}%`,
        `${escapeLike(search)}%`,
        limit,
      ],
    );
    return rows;
  },
};
