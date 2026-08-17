import '@testing-library/jest-dom';
// jsdom does not implement matchMedia, which the responsive layout reads to
// decide between the sidebar and the phone sheet. Report desktop width.
if (!window.matchMedia) {
    window.matchMedia = (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
