import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PhoneSheet from '../../src/components/PhoneSheet';

describe('PhoneSheet, restyled (spec §9.8)', () => {
    it('keeps Explore / View / Plot and shows a grab handle when open', () => {
        const onChange = jest.fn();
        const tabs = [{ key: 'explore', label: 'Explore', content: <p>e</p> }, { key: 'view', label: 'View', content: <p>v</p> }, { key: 'plot', label: 'Plot', content: <p>p</p> }];
        const { container, rerender } = render(<PhoneSheet tabs={tabs} active={null} onChange={onChange} />);
        expect(container.querySelector('.phone-sheet-handle')).toBeNull();
        fireEvent.click(screen.getByRole('tab', { name: 'View' }));
        expect(onChange).toHaveBeenCalledWith('view');
        rerender(<PhoneSheet tabs={tabs} active="view" onChange={onChange} />);
        expect(container.querySelector('.phone-sheet-handle')).not.toBeNull();
        expect(screen.getByRole('tabpanel')).toHaveTextContent('v');
    });
});
