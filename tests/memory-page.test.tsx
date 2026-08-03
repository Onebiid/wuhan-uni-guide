import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Memory } from '../src/domain/models';

const mocks = vi.hoisted(() => ({ loadPhotoObjectUrl: vi.fn(), revokeObjectURL: vi.fn() }));

vi.mock('../src/app/WorkspaceContext', () => ({
  useWorkspace: () => ({ session: { workspace: { id: 'workspace_test' } } }),
}));
vi.mock('../src/data/repository', () => ({ loadPhotoObjectUrl: mocks.loadPhotoObjectUrl }));

import { MemoryCover, MemoryDetail } from '../src/features/memories/MemoryPage';

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

  it('revokes a cover URL that resolves after unmount', async () => {
    let resolvePhoto!: (value: string | null) => void;
    mocks.loadPhotoObjectUrl.mockImplementationOnce(() => new Promise((resolve) => { resolvePhoto = resolve; }));
    const { unmount } = render(<MemoryCover memory={memory} />);

    await waitFor(() => expect(mocks.loadPhotoObjectUrl).toHaveBeenCalledOnce());
    unmount();
    resolvePhoto('blob:late-cover');
    await waitFor(() => expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:late-cover'));
  });
});

describe('MemoryDetail', () => {
  beforeEach(() => {
    mocks.loadPhotoObjectUrl.mockReset();
    mocks.revokeObjectURL.mockReset();
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: mocks.revokeObjectURL });
  });

  it('revokes a detail URL that resolves after unmount', async () => {
    let resolvePhoto!: (value: string | null) => void;
    mocks.loadPhotoObjectUrl.mockImplementationOnce(() => new Promise((resolve) => { resolvePhoto = resolve; }));
    const { unmount } = render(<MemoryDetail memory={memory} placeName="测试地点" onClose={vi.fn()} onMap={vi.fn()} />);

    await waitFor(() => expect(mocks.loadPhotoObjectUrl).toHaveBeenCalledOnce());
    unmount();
    resolvePhoto('blob:late-detail');
    await waitFor(() => expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:late-detail'));
  });

  it('keeps successful detail photos when a sibling load rejects and revokes them on cleanup', async () => {
    const detailMemory = { ...memory, photoIds: ['photo_one', 'photo_two'] };
    mocks.loadPhotoObjectUrl.mockResolvedValueOnce('blob:loaded').mockRejectedValueOnce(new Error('decrypt failed'));
    const { unmount } = render(<MemoryDetail memory={detailMemory} placeName="测试地点" onClose={vi.fn()} onMap={vi.fn()} />);

    expect(await screen.findByRole('img', { name: '照片回忆照片 1' })).toHaveAttribute('src', 'blob:loaded');
    expect(mocks.loadPhotoObjectUrl).toHaveBeenCalledTimes(2);
    unmount();
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:loaded');
  });

  it('revokes each staggered detail URL without waiting for pending siblings', async () => {
    const detailMemory = { ...memory, photoIds: ['photo_one', 'photo_two'] };
    let resolveFirst!: (value: string | null) => void;
    let resolveSecond!: (value: string | null) => void;
    mocks.loadPhotoObjectUrl
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    const { unmount } = render(<MemoryDetail memory={detailMemory} placeName="测试地点" onClose={vi.fn()} onMap={vi.fn()} />);

    await waitFor(() => expect(mocks.loadPhotoObjectUrl).toHaveBeenCalledTimes(2));
    await act(async () => { resolveFirst('blob:first'); await Promise.resolve(); });
    expect(mocks.revokeObjectURL).not.toHaveBeenCalled();

    unmount();
    expect(mocks.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(mocks.revokeObjectURL).toHaveBeenNthCalledWith(1, 'blob:first');

    await act(async () => { resolveSecond('blob:second'); await Promise.resolve(); });
    await waitFor(() => expect(mocks.revokeObjectURL).toHaveBeenCalledTimes(2));
    expect(mocks.revokeObjectURL).toHaveBeenNthCalledWith(1, 'blob:first');
    expect(mocks.revokeObjectURL).toHaveBeenNthCalledWith(2, 'blob:second');
  });
});
