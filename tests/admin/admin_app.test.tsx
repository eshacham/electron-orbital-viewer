import React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import jobsReducer, { sessionExpired, sessionFailed } from '../../src/store/jobsSlice';
import { BUILD_ENV } from '../../src/jobs/build_env';
import { currentMonth } from '../../src/jobs/format';
import { recentMonths } from '../../src/admin/jobs_table';
import { resetBuildEnv } from '../jobs/build_env_stub';
import { costsFixture, listFixture } from '../jobs/api_fixtures';
import AdminApp from '../../src/admin/AdminApp';

const mockApi = { list: jest.fn(), costs: jest.fn(), get: jest.fn(), preview: jest.fn(), submit: jest.fn() };
jest.mock('../../src/jobs/client', () => ({ jobsApi: () => mockApi, chooseTarget: jest.fn(), bindJobsClient: jest.fn() }));

const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
function renderAdmin() {
    const store = configureStore({ reducer: { jobs: jobsReducer } });
    render(<Provider store={store}><AdminApp /></Provider>);
    return store;
}
function asPhone(): () => void {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
        matches: query.includes('max-width: 600px'), media: query, onchange: null,
        addEventListener: () => undefined, removeEventListener: () => undefined,
        addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    return () => { window.matchMedia = original; };
}

beforeEach(() => {
    mockApi.list.mockResolvedValue(listFixture('list_all'));
    mockApi.costs.mockResolvedValue(costsFixture());
});
afterEach(() => { resetBuildEnv(); jest.clearAllMocks(); window.localStorage.clear(); });

describe('/admin.html', () => {
    it('asks a visitor to sign in, and reads nothing', async () => {
        renderAdmin();
        await flush();
        expect(screen.getByText('Sign in as the owner to see jobs and costs.')).toBeInTheDocument();
        expect(screen.getByText('Owner sign-in: not configured in this build')).toBeInTheDocument();
        expect(mockApi.list).not.toHaveBeenCalled();
    });
    it("shows the owner this month's jobs and costs", async () => {
        BUILD_ENV.dev = true;
        renderAdmin();
        await flush();
        expect(mockApi.list).toHaveBeenCalledWith(currentMonth());
        expect(mockApi.costs).toHaveBeenCalledWith(currentMonth());
        expect(screen.getByRole('heading', { name: 'Owner dashboard' })).toBeInTheDocument();
        expect(within(screen.getByRole('table', { name: 'jobs' })).getAllByRole('row')).toHaveLength(3);
        // The cost panel became the budget strip above the list (Phase 6G-3), named for its month.
        expect(screen.getByRole('region', { name: /^Budget, / })).toBeInTheDocument();
    });
    it('shows the shape of the page while the first answer is on its way', async () => {
        BUILD_ENV.dev = true;
        let answer: (value: unknown) => void = () => undefined;
        mockApi.list.mockReturnValueOnce(new Promise(resolve => { answer = resolve; }));
        renderAdmin();
        await flush();
        expect(screen.getByLabelText('Loading jobs and costs')).toHaveAttribute('aria-busy', 'true');
        expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();
        answer(listFixture('list_all'));
        await flush();
        expect(screen.queryByLabelText('Loading jobs and costs')).toBeNull();
        expect(screen.getByRole('table', { name: 'jobs' })).toBeInTheDocument();
    });
    it('keeps the jobs when only the costs fail, and says so', async () => {
        BUILD_ENV.dev = true;
        mockApi.costs.mockRejectedValueOnce(new Error('Cost Explorer did not answer.'));
        renderAdmin();
        await flush();
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('Costs could not be read: Cost Explorer did not answer. Reload to try again.');
        expect(screen.getByRole('table', { name: 'jobs' })).toBeInTheDocument();
        fireEvent.click(within(alert).getByRole('button', { name: 'Reload' }));
        await flush();
        expect(mockApi.costs).toHaveBeenCalledTimes(2);
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.getByRole('region', { name: /^Budget, / })).toBeInTheDocument();
    });
    it('on a phone, says a sign-in problem outside the menu, and marks the menu', async () => {
        const restore = asPhone();
        try {
            const store = renderAdmin();
            await flush();
            act(() => { store.dispatch(sessionFailed('Sign-in was cancelled.')); });
            const notice = () => screen.getAllByRole('alert').find(el => el.classList.contains('admin-phone-notice'));
            expect(notice()).toHaveTextContent('Sign-in was cancelled. Open the menu to sign in again.');
            expect(screen.getByRole('button', { name: 'Jobs target, sign-in and viewer link: sign-in problem' })).toBeInTheDocument();
            act(() => { store.dispatch(sessionExpired()); });
            expect(notice()).toHaveTextContent('Your owner session has ended.');
        } finally {
            restore();
        }
    });
    it('keeps a phone’s top bar to one line: the brand, the theme, and a menu holding where jobs run and the sign-in', async () => {
        BUILD_ENV.dev = true;
        const original = window.matchMedia;
        window.matchMedia = ((query: string) => ({
            matches: query.includes('max-width: 600px'), media: query, onchange: null,
            addEventListener: () => undefined, removeEventListener: () => undefined,
            addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
        })) as typeof window.matchMedia;
        try {
            renderAdmin();
            await flush();
            const header = screen.getByRole('banner');
            expect(within(header).queryByText('Owner sign-in: not configured in this build')).toBeNull();
            expect(within(header).getByRole('heading', { name: 'Owner dashboard' })).toBeInTheDocument();
            const menu = within(header).getByRole('button', { name: 'Jobs target, sign-in and viewer link' });
            fireEvent.click(menu);
            const panel = screen.getByRole('dialog', { name: 'Jobs target, sign-in and viewer link' });
            expect(within(panel).getByRole('group', { name: 'where jobs run' })).toBeInTheDocument();
            expect(within(panel).getByText('Owner sign-in: not configured in this build')).toBeInTheDocument();
            expect(within(panel).getByRole('link', { name: 'Back to the viewer' })).toHaveAttribute('href', '/');
        } finally {
            window.matchMedia = original;
        }
    });
    it('reads another month when asked, and says when the API fails', async () => {
        BUILD_ENV.dev = true;
        renderAdmin();
        await flush();
        const previous = recentMonths(new Date())[1];
        mockApi.list.mockRejectedValueOnce(new Error('The job server on this Mac is not answering.'));
        fireEvent.change(screen.getByLabelText('Month'), { target: { value: previous } });
        await flush();
        expect(mockApi.list).toHaveBeenLastCalledWith(previous);
        expect(screen.getByRole('alert')).toHaveTextContent('The job server on this Mac is not answering.');
        mockApi.list.mockResolvedValueOnce(listFixture('list_all'));
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        await flush();
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.getByRole('table', { name: 'jobs' })).toBeInTheDocument();
    });
});
