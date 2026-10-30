import React, { useEffect, useId, useRef, useState } from 'react';
import { Button, Popover } from '@mui/material';
import { LEVELS, LEVEL_LABEL, LearningLevel } from './levels';
import { useLevel } from './useLevel';
import ExpandMore from '@mui/icons-material/ExpandMore';
import './levels.css';

interface LevelControlProps {
    /**
     * 'segmented': the top bar's one-row switch (desktop and tablet). 'menu': a titled list, in the phone's menu.
     * 'compact': the top bar below 1024 px -- one button naming the level, opening the 'menu' list.
     */
    variant: 'segmented' | 'menu' | 'compact';
}

const NEXT_KEYS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * The Learning level switch (spec plan): Basics · Explore · Advanced ·
 * Research, a radio group -- one Tab stop, the arrow keys move and choose,
 * wrapping, Home and End go to the ends (WAI-ARIA radio group). It shows the
 * level in use, a link's visit level included; a choice is stored and ends the visit.
 */
const LevelControl: React.FC<LevelControlProps> = ({ variant }) => {
    if (variant === 'compact') return <CompactLevelControl />;
    return <LevelRadios variant={variant} />;
};

/**
 * Below 1024 px: "Explore ▾" opens the four levels as the phone's list does, in a dialog (fix round 1, M4: named so,
 * with focus on the level in use as it opens). Label in name: "Learning level: Explore".
 */
const CompactLevelControl: React.FC = () => {
    const { level } = useLevel();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    return (
        <>
            <Button size="small" className="level-control-button" endIcon={<ExpandMore aria-hidden="true" />} aria-label={`Learning level: ${LEVEL_LABEL[level]}`}
                aria-haspopup="dialog" aria-expanded={anchor !== null} onClick={event => setAnchor(event.currentTarget)}>
                {LEVEL_LABEL[level]}
            </Button>
            <Popover open={anchor !== null} anchorEl={anchor} onClose={() => setAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                slotProps={{ paper: { className: 'level-control-popover', role: 'dialog', 'aria-label': 'Learning level' } as object }}>
                <LevelRadios variant="menu" focusChecked />
            </Popover>
        </>
    );
};

/** `focusChecked`: on mount, focus goes to the checked level (the compact dialog's first stop). */
const LevelRadios: React.FC<{ variant: 'segmented' | 'menu'; focusChecked?: boolean }> = ({ variant, focusChecked = false }) => {
    const { level, setLevel } = useLevel();
    const labelId = useId();
    const buttons = useRef<(HTMLButtonElement | null)[]>([]);
    // Runs before the Popover's own focus trap, which then leaves focus where it is (inside it).
    useEffect(() => {
        if (focusChecked) buttons.current[LEVELS.indexOf(level)]?.focus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusChecked]);

    const choose = (index: number) => {
        setLevel(LEVELS[index]);
        buttons.current[index]?.focus();
    };
    const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
        let next: number | null = null;
        if (event.key in NEXT_KEYS) next = (index + NEXT_KEYS[event.key] + LEVELS.length) % LEVELS.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = LEVELS.length - 1;
        if (next === null) return;
        event.preventDefault();
        choose(next);
    };

    return (
        <div className={`level-control level-control-${variant}`} role="radiogroup"
            {...(variant === 'menu' ? { 'aria-labelledby': labelId } : { 'aria-label': 'Learning level' })}>
            {variant === 'menu' && <span id={labelId} className="level-control-title">Learning level</span>}
            {LEVELS.map((item: LearningLevel, index) => {
                const checked = item === level;
                return (
                    <button key={item} type="button" role="radio" aria-checked={checked} tabIndex={checked ? 0 : -1}
                        ref={element => { buttons.current[index] = element; }}
                        className={`level-control-option${checked ? ' checked' : ''}`}
                        onClick={() => choose(index)} onKeyDown={event => onKeyDown(event, index)}>
                        {LEVEL_LABEL[item]}
                    </button>
                );
            })}
        </div>
    );
};

export default LevelControl;
