export const DEFAULT_KDF_ITERATIONS = 600_000;

export interface EncryptionEnvelope {
  v: 1;
  alg: 'A256GCM';
  nonce: string;
  ciphertext: string;
}

export interface WorkspaceKeys {
  encryptionKey: CryptoKey;
  authToken: string;
  authVerifier: string;
}

export interface EncryptedBinary {
  nonce: string;
  ciphertext: ArrayBuffer;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function createSalt(): string {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return bytesToBase64(salt);
}

export async function deriveWorkspaceKeys(
  passphrase: string,
  saltBase64: string,
  iterations = DEFAULT_KDF_ITERATIONS,
): Promise<WorkspaceKeys> {
  if (passphrase.length < 10) throw new Error('Passphrase must contain at least 10 characters');
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveBits']);
  const rootBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: base64ToBytes(saltBase64), iterations },
    material,
    256,
  );
  const rootKey = await crypto.subtle.importKey('raw', rootBits, 'HKDF', false, ['deriveKey', 'deriveBits']);
  const encryptionKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: encoder.encode('whu-couple-map/encryption/v1') },
    rootKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const authBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: encoder.encode('whu-couple-map/authentication/v1') },
    rootKey,
    256,
  );
  const authBytes = new Uint8Array(authBits);
  const verifier = await crypto.subtle.digest('SHA-256', authBytes);
  return {
    encryptionKey,
    authToken: bytesToBase64(authBytes),
    authVerifier: bytesToBase64(new Uint8Array(verifier)),
  };
}

export async function encryptJson(
  value: unknown,
  key: CryptoKey,
  associatedData: string,
): Promise<EncryptionEnvelope> {
  const nonce = new Uint8Array(12);
  crypto.getRandomValues(nonce);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: encoder.encode(associatedData), tagLength: 128 },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  return { v: 1, alg: 'A256GCM', nonce: bytesToBase64(nonce), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
}

export async function decryptJson<T>(
  envelope: EncryptionEnvelope,
  key: CryptoKey,
  associatedData: string,
): Promise<T> {
  if (envelope.v !== 1 || envelope.alg !== 'A256GCM') throw new Error('Unsupported encrypted record');
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64ToBytes(envelope.nonce),
      additionalData: encoder.encode(associatedData),
      tagLength: 128,
    },
    key,
    base64ToBytes(envelope.ciphertext),
  );
  return JSON.parse(decoder.decode(plaintext)) as T;
}

export async function encryptBytes(value: ArrayBuffer, key: CryptoKey, associatedData: string): Promise<EncryptedBinary> {
  const nonce = new Uint8Array(12);
  crypto.getRandomValues(nonce);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: encoder.encode(associatedData), tagLength: 128 },
    key,
    value,
  );
  return { nonce: bytesToBase64(nonce), ciphertext };
}

export async function decryptBytes(value: EncryptedBinary, key: CryptoKey, associatedData: string): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64ToBytes(value.nonce),
      additionalData: encoder.encode(associatedData),
      tagLength: 128,
    },
    key,
    value.ciphertext,
  );
}

export function recordAssociatedData(kind: string, id: string, revision: number): string {
  return `${kind}:${id}:${revision}`;
}
