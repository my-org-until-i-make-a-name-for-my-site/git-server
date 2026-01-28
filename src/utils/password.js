const bcrypt = require('bcryptjs');
let argon2;

const HASH_TYPE = process.env.PASSWORD_HASH_TYPE || 'bcrypt';

// Try to load argon2, but don't fail if not available
try {
  argon2 = require('argon2');
} catch (e) {
  if (HASH_TYPE === 'argon2') {
    console.warn('argon2 not available, falling back to bcrypt');
  }
}

async function hashPassword(password) {
  if (HASH_TYPE === 'argon2' && argon2) {
    return await argon2.hash(password);
  }
  // Default to bcrypt
  return await bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
  // Detect hash type by prefix
  if (hash.startsWith('$argon2') && argon2) {
    return await argon2.verify(hash, password);
  }
  // Default to bcrypt
  return await bcrypt.compare(password, hash);
}

module.exports = {
  hashPassword,
  verifyPassword
};
