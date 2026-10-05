/**
 * Admin "משתמשים" screen: list, create viewer, disable, reset password, delete.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import UsersPage from '@/components/UsersPage';
import { api } from '@/lib/api';

const mockConfirm = jest.fn();
const mockSuccess = jest.fn();
const mockError = jest.fn();

jest.mock('@/components/ui', () => {
    const actual = jest.requireActual('@/components/ui');
    return {
        ...actual,
        useToast: () => ({
            success: mockSuccess, error: mockError, warning: jest.fn(), info: jest.fn(), toast: jest.fn(), confirm: mockConfirm,
        }),
    };
});

jest.mock('@/lib/api', () => {
    const actual = jest.requireActual('@/lib/api');
    return {
        ...actual,
        api: {
            listUsers: jest.fn(),
            createUser: jest.fn(),
            disableUser: jest.fn(),
            enableUser: jest.fn(),
            resetUserPassword: jest.fn(),
            deleteUser: jest.fn(),
        },
    };
});

const mocked = api as jest.Mocked<typeof api>;

const rows = [
    { email: 'admin@example.com', role: 'admin', display_name: 'אילן', active: true, manageable: false },
    { email: 'viewer@example.com', role: 'viewer', display_name: 'צופה', active: true, manageable: true, last_sign_in_at: null },
];

beforeEach(() => {
    jest.clearAllMocks();
    mocked.listUsers.mockResolvedValue(rows as never);
    mocked.createUser.mockResolvedValue({} as never);
    mocked.disableUser.mockResolvedValue({ email: 'viewer@example.com', active: false });
    mocked.resetUserPassword.mockResolvedValue({ email: 'viewer@example.com', status: 'password_reset' });
    mocked.deleteUser.mockResolvedValue({ email: 'viewer@example.com', status: 'deleted' });
});

it('lists users; actions only on manageable (viewer) rows', async () => {
    render(<UsersPage />);
    const viewerRow = await screen.findByTestId('user-row-viewer@example.com');
    const adminRow = screen.getByTestId('user-row-admin@example.com');
    expect(within(viewerRow).getByText('צפייה בלבד')).toBeInTheDocument();
    expect(within(viewerRow).getByLabelText('מחק')).toBeInTheDocument();
    expect(within(adminRow).queryByLabelText('מחק')).not.toBeInTheDocument();
    expect(within(adminRow).queryByLabelText('השבת')).not.toBeInTheDocument();
});

it('creates a viewer and reloads', async () => {
    render(<UsersPage />);
    await screen.findByTestId('user-row-viewer@example.com');
    fireEvent.change(screen.getByLabelText('אימייל'), { target: { value: ' new@example.com ' } });
    fireEvent.change(screen.getByLabelText('שם תצוגה'), { target: { value: 'חדש' } });
    fireEvent.change(screen.getByLabelText('סיסמה'), { target: { value: 'longenough1' } });
    fireEvent.click(screen.getByText('צור משתמש'));
    await waitFor(() => expect(mocked.createUser).toHaveBeenCalledWith({
        email: 'new@example.com', display_name: 'חדש', password: 'longenough1',
    }));
    await waitFor(() => expect(mocked.listUsers).toHaveBeenCalledTimes(2));
});

it('rejects a short password before calling the backend', async () => {
    render(<UsersPage />);
    await screen.findByTestId('user-row-viewer@example.com');
    fireEvent.change(screen.getByLabelText('אימייל'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('שם תצוגה'), { target: { value: 'חדש' } });
    fireEvent.change(screen.getByLabelText('סיסמה'), { target: { value: 'short' } });
    fireEvent.submit(screen.getByLabelText('יצירת משתמש צפייה'));
    expect(mockError).toHaveBeenCalled();
    expect(mocked.createUser).not.toHaveBeenCalled();
});

it('disables, resets password, and deletes only after confirm', async () => {
    render(<UsersPage />);
    const row = await screen.findByTestId('user-row-viewer@example.com');

    fireEvent.click(within(row).getByLabelText('השבת'));
    await waitFor(() => expect(mocked.disableUser).toHaveBeenCalledWith('viewer@example.com'));
    await waitFor(() => expect(mocked.listUsers).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(screen.getByTestId('user-row-viewer@example.com')).getByLabelText('איפוס סיסמה')).not.toBeDisabled());

    fireEvent.click(within(screen.getByTestId('user-row-viewer@example.com')).getByLabelText('איפוס סיסמה'));
    fireEvent.change(screen.getByLabelText('סיסמה חדשה'), { target: { value: 'anotherpass1' } });
    fireEvent.click(screen.getByText('שמור'));
    await waitFor(() => expect(mocked.resetUserPassword).toHaveBeenCalledWith('viewer@example.com', 'anotherpass1'));
    await waitFor(() => expect(within(screen.getByTestId('user-row-viewer@example.com')).getByLabelText('מחק')).not.toBeDisabled());

    mockConfirm.mockResolvedValueOnce(false);
    fireEvent.click(within(screen.getByTestId('user-row-viewer@example.com')).getByLabelText('מחק'));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1));
    expect(mocked.deleteUser).not.toHaveBeenCalled();

    mockConfirm.mockResolvedValueOnce(true);
    fireEvent.click(within(screen.getByTestId('user-row-viewer@example.com')).getByLabelText('מחק'));
    await waitFor(() => expect(mocked.deleteUser).toHaveBeenCalledWith('viewer@example.com'));
});

it('shows the backend error detail when loading fails', async () => {
    const { ApiError } = jest.requireActual('@/lib/api');
    mocked.listUsers.mockRejectedValue(new ApiError('x', 'אין הרשאה', 403));
    render(<UsersPage />);
    await waitFor(() => expect(mockError).toHaveBeenCalledWith('אין הרשאה'));
    expect(mocked.listUsers).toHaveBeenCalledTimes(1);
});
