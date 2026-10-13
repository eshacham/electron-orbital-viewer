import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import SearchIcon from '@mui/icons-material/Search';
import { searchAll, SEARCH_GROUP_ORDER, type SearchAction, type SearchResult, type SearchSources } from '../search/search_index';
import './search.css';

interface GlobalSearchProps {
    sources: SearchSources;
    /** Does what the existing pickers do (App's handleSearchPick). */
    onPick(action: SearchAction): void;
    /** The molecule index loads on demand; focusing the search asks for it. */
    onWantIndex?(): void;
    autoFocus?: boolean;
    /** 'sheet' is the phone's full-screen search: no shortcut hint, the list in the flow. */
    variant?: 'bar' | 'sheet';
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const slug = (text: string) => text.toLowerCase().replace(/[^a-z]+/g, '-');

/**
 * The top bar's search (spec §8.3): a combobox over one client-side index,
 * grouped, at most six per group. ↑/↓ move, Enter opens, Esc closes;
 * ⌘K/Ctrl+K focuses it from anywhere (it has a modifier, so it is outside
 * WCAG 2.1.4's single-key rule).
 */
const GlobalSearch: React.FC<GlobalSearchProps> = ({ sources, onPick, onWantIndex, autoFocus = false, variant = 'bar' }) => {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const id = useId();
    const listId = `${id}-results`;
    const optionId = (result: SearchResult) => `${id}-${result.key}`;
    const results = useMemo(() => searchAll(query, sources), [query, sources]);
    const showPopup = open && query.trim().length > 0;
    const showList = showPopup && results.length > 0;

    useEffect(() => {
        if (variant !== 'bar') return undefined;
        const onKey = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                inputRef.current?.focus();
                setOpen(true);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [variant]);

    const pick = (result: SearchResult) => {
        onPick(result.action);
        setQuery('');
        setOpen(false);
        inputRef.current?.blur();
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setActive(index => Math.min(results.length - 1, index + 1));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive(index => Math.max(0, index - 1));
        } else if (event.key === 'Enter') {
            if (showList && results[active]) {
                event.preventDefault();
                pick(results[active]);
            }
        } else if (event.key === 'Escape') {
            setOpen(false);
        }
    };

    return (
        <div className={`global-search ${variant}`}>
            <SearchIcon className="global-search-icon" fontSize="small" aria-hidden />
            <input
                ref={inputRef}
                className="global-search-input"
                type="search"
                role="combobox"
                aria-label="Search elements, molecules and orbitals"
                placeholder="Search elements, molecules…"
                aria-autocomplete="list"
                aria-expanded={showList}
                aria-controls={showList ? listId : undefined}
                aria-activedescendant={showList && results[active] ? optionId(results[active]) : undefined}
                autoFocus={autoFocus}
                value={query}
                onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }}
                onFocus={() => { onWantIndex?.(); setOpen(true); }}
                onBlur={() => setOpen(false)}
                onKeyDown={onKeyDown}
            />
            {variant === 'bar' && <kbd className="global-search-hint" aria-hidden="true">{IS_MAC ? '⌘K' : 'Ctrl K'}</kbd>}
            {showPopup && (
                <div className="global-search-popup">
                    {results.length === 0 ? (
                        <p className="global-search-empty" role="status">No matches</p>
                    ) : (
                        <ul id={listId} role="listbox" aria-label="Search results">
                            {SEARCH_GROUP_ORDER.filter(group => results.some(result => result.group === group)).map(group => (
                                <li key={group} role="presentation">
                                    <div className="global-search-group" id={`${id}-${slug(group)}`}>{group}</div>
                                    <ul role="group" aria-labelledby={`${id}-${slug(group)}`}>
                                        {results.filter(result => result.group === group).map(result => {
                                            const index = results.indexOf(result);
                                            return (
                                                <li
                                                    key={result.key}
                                                    id={optionId(result)}
                                                    role="option"
                                                    aria-selected={index === active}
                                                    className="global-search-option"
                                                    // Keeps focus in the field, so blur does not close the list first.
                                                    onMouseDown={event => event.preventDefault()}
                                                    onClick={() => pick(result)}
                                                >
                                                    <span className="global-search-label">{result.label}</span>
                                                    <span className="global-search-detail ql-caption">{result.detail}</span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
};

export default GlobalSearch;
