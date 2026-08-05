import { describe, expect, it } from 'vitest';
import { createSalt, decryptJson, deriveDiscoveryId, deriveWorkspaceKeys, encryptJson, recordAssociatedData } from '../src/security/crypto';

describe('encrypted records', () => {
  it('derives a stable non-secret discovery identifier', async () => {
    expect(await deriveDiscoveryId('shared passphrase')).toMatch(/^[a-f0-9]{64}$/);
    expect(await deriveDiscoveryId('shared passphrase')).toBe(await deriveDiscoveryId('shared passphrase'));
  });

  it('derives separated keys and round-trips JSON', async () => {
    const keys = await deriveWorkspaceKeys('a shared test passphrase', createSalt(), 1_000);
    const associatedData = recordAssociatedData('place', 'place_1', 1);
    const envelope = await encryptJson({ name: '桂园食堂' }, keys.encryptionKey, associatedData);
    await expect(decryptJson(envelope, keys.encryptionKey, associatedData)).resolves.toEqual({ name: '桂园食堂' });
    expect(keys.authToken).not.toBe(keys.authVerifier);
  });

  it('rejects changed associated data', async () => {
    const keys = await deriveWorkspaceKeys('another shared passphrase', createSalt(), 1_000);
    const envelope = await encryptJson({ ok: true }, keys.encryptionKey, 'place:one:1');
    await expect(decryptJson(envelope, keys.encryptionKey, 'place:one:2')).rejects.toThrow();
  });
});
