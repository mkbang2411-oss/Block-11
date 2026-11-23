import crypto from 'node:crypto';
export const newId = (prefix = '') => prefix + crypto.randomBytes(8).toString('hex');
