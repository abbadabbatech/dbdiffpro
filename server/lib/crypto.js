const crypto = require('crypto');

// The ENCRYPTION_KEY must be a 32-byte (64 char hex) string
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); 
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function encrypt(text) {
    if (!text) return text;
    if (!process.env.ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY is missing from environment");

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    // Store as: IV : AuthTag : Ciphertext
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(text) {
    if (!text) return text;
    if (!process.env.ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY is missing from environment");

    const parts = text.split(':');
    if (parts.length !== 3) throw new Error("Invalid encrypted payload format");

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedText = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
}

module.exports = { encrypt, decrypt };
