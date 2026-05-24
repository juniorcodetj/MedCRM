import * as crypto from 'node:crypto';

function decodeBase32(b32: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = b32.toUpperCase().replace(/=+$/, '');
  let bits = '';
  for (const char of clean) {
    const val = alphabet.indexOf(char);
    if (val === -1) throw new Error('Invalid base32 character');
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateSecret(length = 16): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const randomBytes = crypto.randomBytes(length);
  let secret = '';
  for (const byte of randomBytes) {
    secret += alphabet[byte % alphabet.length];
  }
  return secret;
}

export function generateTOTP(secret: string, timeStepSeconds = 30): string {
  const key = decodeBase32(secret);
  const counter = Math.floor(Date.now() / 1000 / timeStepSeconds);

  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64BE(BigInt(counter), 0);

  const hmac = crypto.createHmac('sha1', key);
  hmac.update(buffer);
  const hash = hmac.digest();

  const offset = hash[hash.length - 1] & 0xf;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

export function verifyTOTP(token: string, secret: string, window = 1): boolean {
  const key = decodeBase32(secret);
  const currentCounter = Math.floor(Date.now() / 1000 / 30);

  for (let i = -window; i <= window; i++) {
    const counter = currentCounter + i;
    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64BE(BigInt(counter), 0);

    const hmac = crypto.createHmac('sha1', key);
    hmac.update(buffer);
    const hash = hmac.digest();

    const offset = hash[hash.length - 1] & 0xf;
    const binary =
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff);

    const otp = (binary % 1000000).toString().padStart(6, '0');
    if (otp === token) {
      return true;
    }
  }
  return false;
}
