import React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import jobsReducer from '../../src/store/jobsSlice';
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
        expect(screen.getByRole('region', { name: 'costs' })).toBeInTheDocument();
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
    });
});
