import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Memory } from '../src/domain/models';

const mocks = vi.hoisted(() => ({ loadPhotoObjectUrl: vi.fn(), revokeObjectURL: vi.fn() }));

vi.mock('../src/app/WorkspaceContext', () => ({
  useWorkspace: () => ({ session: { workspace: { id: 'workspace_test' } } }),
}));
vi.mock('../src/data/repository', () => ({ loadPhotoObjectUrl: mocks.loadPhotoObjectUrl }));

import { MemoryCover } from '../src/features/memories/MemoryPage';

const memory: Memory = {
  id: 'memory_retry', placeId: 'place_one', title: '照片回忆', text: '', occurredOn: '2026-07-20',
  photoIds: ['photo_one'], frameNumber: 1, createdAt: 1, updatedAt: 1, revision: 0,
  deviceId: 'device_one', deletedAt: null,
};

describe('MemoryCover', () => {
  beforeEach(() => {
    mocks.loadPhotoObjectUrl.mockReset();
    mocks.revokeObjectURL.mockReset();
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: mocks.revokeObjectURL });
  });

  it('retries a failed photo load from an independent accessible control', async () => {
    mocks.loadPhotoObjectUrl.mockResolvedValueOnce(null).mockResolvedValueOnce('blob:retried');
    const user = userEvent.setup();
    const { unmount } = render(<MemoryCover memory={memory} />);

    await user.click(await screen.findByRole('button', { name: '重试照片' }));

    expect(await screen.findByRole('img', { name: '照片回忆' })).toHaveAttribute('src', 'blob:retried');
    expect(mocks.loadPhotoObjectUrl).toHaveBeenCalledTimes(2);
    unmount();
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:retried');
  });
});
