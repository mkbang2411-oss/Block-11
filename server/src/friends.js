import { db } from './db.js';

export function friendIdsOf(user) {
  const rows = db.prepare(`
    SELECT CASE WHEN fr.from_id = @id THEN u2.id ELSE fr.from_id END AS fid
    FROM friend_requests fr
    LEFT JOIN users u2 ON lower(u2.email) = fr.to_email
    WHERE fr.status = 'accepted' AND (fr.from_id = @id OR fr.to_email = @email)`)
    .all({ id: user.id, email: user.email });
  return [...new Set(rows.map((r) => r.fid).filter(Boolean))];
}

export function areFriends(user, otherId) {
  if (user.id === otherId) return true;
  return friendIdsOf(user).includes(otherId);
}
