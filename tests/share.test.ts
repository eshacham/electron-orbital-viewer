import { copyText, shareUrlFor } from '../src/share';

describe('share', () => {
    it('builds the link from this page, keeping its query', () => {
        expect(shareUrlFor('mode=atom&Z=26', { origin: 'https://x.org', pathname: '/app/', search: '?embed=1' }))
            .toBe('https://x.org/app/?embed=1#mode=atom&Z=26');
    });

    it('uses the clipboard API when it works', async () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        const execCopy = jest.fn();
        expect(await copyText('u', { clipboard: { writeText }, execCopy })).toBe(true);
        expect(writeText).toHaveBeenCalledWith('u');
        expect(execCopy).not.toHaveBeenCalled();
    });

    it('falls back to execCommand when the clipboard API refuses', async () => {
        const execCopy = jest.fn().mockReturnValue(true);
        expect(await copyText('u', { clipboard: { writeText: jest.fn().mockRejectedValue(new Error('denied')) }, execCopy })).toBe(true);
        expect(execCopy).toHaveBeenCalledWith('u');
    });

    it('reports failure when neither works (insecure page, no clipboard)', async () => {
        expect(await copyText('u', { execCopy: () => false })).toBe(false);
    });
});
