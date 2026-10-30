// Google caps review replies at 4096 bytes (not characters), which matters for Hindi/Marathi text.
const GOOGLE_REPLY_MAX_BYTES = 4096;
const DRAFT_TARGET_BYTES = 1500;

const byteLength = (text) => Buffer.byteLength(text || '', 'utf8');

module.exports = { GOOGLE_REPLY_MAX_BYTES, DRAFT_TARGET_BYTES, byteLength };
