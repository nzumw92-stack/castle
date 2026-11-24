import { createHmac } from 'node:crypto';
// Pseudonymous but stable IDs: HMAC-SHA256 with a secret salt, shortened to 64 bits.
export function makeHasher(salt) {
  if (!salt) throw new Error('HASH_SALT missing');
  return (platform, id) => 'h:' + createHmac('sha256', salt).update(platform + ':' + id).digest('hex').slice(0, 16);
}
