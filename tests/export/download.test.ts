import { downloadBlob } from '../../src/export/download';

/**
 * jsdom implements neither URL.createObjectURL nor URL.revokeObjectURL
 * (confirmed: calling either throws "is not a function"), so both are
 * stubbed here rather than left to the environment.
 */
describe('downloadBlob', () => {
    let createObjectURL: jest.Mock;
    let revokeObjectURL: jest.Mock;

    beforeEach(() => {
        jest.useFakeTimers();
        createObjectURL = jest.fn(() => 'blob:mock-url');
        revokeObjectURL = jest.fn();
        (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL = createObjectURL;
        (URL as unknown as { revokeObjectURL: typeof revokeObjectURL }).revokeObjectURL = revokeObjectURL;
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('clicks an anchor built from the blob and the file name, then revokes the URL after the deferral', () => {
        const blob = new Blob(['a,b\n1,2\n'], { type: 'text/csv' });
        const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

        downloadBlob(blob, 'orbital-viewer_Fe_atom.csv');

        expect(createObjectURL).toHaveBeenCalledWith(blob);
        expect(clickSpy).toHaveBeenCalledTimes(1);
        const link = clickSpy.mock.instances[0] as unknown as HTMLAnchorElement;
        expect(link.download).toBe('orbital-viewer_Fe_atom.csv');
        expect(link.href).toBe('blob:mock-url');
        // Removed from the document once clicked -- it was only ever a
        // means to trigger the download, not something to leave behind.
        expect(link.isConnected).toBe(false);

        // Not revoked at once: some browsers start the download only after
        // click() returns, and revoking too early would break that download.
        expect(revokeObjectURL).not.toHaveBeenCalled();
        jest.advanceTimersByTime(9_999);
        expect(revokeObjectURL).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

        clickSpy.mockRestore();
    });
});
