const crypto = require('crypto');

// Adapted from AI-Agents-Combined node-backend: AES-256-CBC for OAuth tokens at rest.
class AESCrypto {
  constructor() {
    this.algorithm = 'aes-256-cbc';
    const key = process.env.AES_SECRET_KEY;
    if (!key) {
      throw new Error('AES_SECRET_KEY environment variable is not set');
    }
    this.key = key.length === 64 && /^[0-9a-fA-F]+$/.test(key)
      ? Buffer.from(key, 'hex')
      : crypto.createHash('sha256').update(key).digest();
  }

  encrypt(text) {
    if (!text) return null;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  decrypt(encrypted) {
    if (!encrypted) return null;
    const [ivHex, data] = encrypted.split(':');
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, Buffer.from(ivHex, 'hex'));
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

module.exports = new AESCrypto();
