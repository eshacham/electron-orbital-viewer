/**
 * What the eye reads in `node` (final review: a typeset label is its visual, aria-hidden, beside a visually hidden plain
 * copy for the ear -- subscripts.ts typesetLabel): its text with those copies left out, as textContent read before.
 */
export function seenText(node: Node | null | undefined): string {
    if (!node) return '';
    const clone = node.cloneNode(true);
    if (clone instanceof Element || clone instanceof DocumentFragment) {
        clone.querySelectorAll('.typeset-label > .visually-hidden').forEach(copy => copy.remove());
    }
    return clone.textContent ?? '';
}

/**
 * jest-dom's toHaveTextContent, read as the eye reads it (`seenText`): whitespace collapsed, a string found in it, or a
 * pattern matched. Registered in src/setupTests.ts.
 */
export function toHaveSeenText(this: jest.MatcherContext, node: Node | null, expected: string | RegExp): jest.CustomMatcherResult {
    const seen = seenText(node).replace(/\s+/g, ' ').trim();
    const pass = typeof expected === 'string' ? seen.includes(expected.replace(/\s+/g, ' ').trim()) : expected.test(seen);
    return {
        pass,
        message: () => `expected the seen text ${this.utils.printReceived(seen)} ${pass ? 'not ' : ''}to ${typeof expected === 'string' ? 'contain' : 'match'} ${this.utils.printExpected(expected)}`,
    };
}
