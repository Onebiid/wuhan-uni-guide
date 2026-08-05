import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  join: vi.fn(),
  setup: vi.fn(),
  unlock: vi.fn(),
}));

vi.mock('../src/app/WorkspaceContext', () => ({
  useWorkspace: () => ({
    bootState: 'setup',
    error: null,
    join: mocks.join,
    setup: mocks.setup,
    unlock: mocks.unlock,
  }),
}));

import { UnlockView } from '../src/features/unlock/UnlockView';

afterEach(cleanup);

describe('UnlockView', () => {
  it('joins an existing shared space with one passphrase and trusts this device by default', async () => {
    mocks.join.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<UnlockView />);

    expect(screen.getByRole('button', { name: '加入已有空间' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByLabelText('再次输入')).not.toBeInTheDocument();
    expect(screen.getByLabelText('共同口令')).toHaveAttribute('autocomplete', 'current-password');
    await user.type(screen.getByLabelText('共同口令'), 'shared passphrase');
    await user.click(screen.getByRole('button', { name: '加入共享空间' }));

    expect(mocks.join).toHaveBeenCalledWith('shared passphrase', true);
  });

  it('passes the cleared trusted-device choice to the join flow', async () => {
    mocks.join.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<UnlockView />);

    await user.click(screen.getByLabelText('信任此设备'));
    await user.type(screen.getByLabelText('共同口令'), 'shared passphrase');
    await user.click(screen.getByRole('button', { name: '加入共享空间' }));

    expect(mocks.join).toHaveBeenCalledWith('shared passphrase', false);
  });
  it('switches from the default join mode to create with keyboard controls', async () => {
    const user = userEvent.setup();
    render(<UnlockView />);

    await user.tab();
    expect(screen.getByRole('button', { name: '创建新空间' })).toHaveFocus();
    await user.keyboard(' ');

    expect(screen.getByRole('heading', { name: '创建安全空间' })).toBeInTheDocument();
    expect(screen.getByLabelText('再次输入')).toBeInTheDocument();
  });
});
