import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import MoleculePicker from '../../src/components/MoleculePicker';
import { computedEntries } from '../../src/jobs/computed';
import { LIBRARY_INDEX } from '../molecules/fixtures';
import { jobFixture } from './api_fixtures';

describe('the Computed category', () => {
    it('appears only when there are computed molecules to list', () => {
        const { unmount } = render(<MoleculePicker entries={LIBRARY_INDEX} error={null} selectedId={null} onSelect={() => {}} />);
        expect(screen.queryByRole('button', { name: 'Computed' })).toBeNull();
        unmount();
        const onSelect = jest.fn();
        render(<MoleculePicker entries={[...LIBRARY_INDEX, ...computedEntries([jobFixture('get_done')])]} error={null} selectedId={null} onSelect={onSelect} />);
        fireEvent.click(screen.getByRole('button', { name: 'Computed' }));
        const list = screen.getByRole('list', { name: 'molecules' });
        expect(within(list).getAllByRole('button')).toHaveLength(1);
        fireEvent.click(within(list).getByRole('button', { name: /Water/ }));
        expect(onSelect).toHaveBeenCalledWith(jobFixture('get_done').key);
    });
});
