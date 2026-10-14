import React, { useState } from 'react';
import { FormControl, FormControlLabel, FormHelperText, FormLabel, IconButton, Popover, Radio, RadioGroup, Tooltip } from '@mui/material';
import MoreVert from '@mui/icons-material/MoreVert';
import PersonOutline from '@mui/icons-material/PersonOutline';
import { BRANDS, type BrandId } from '../design/brands';
import type { OwnerSession } from '../store/jobsSlice';

/** "eyal.shacham@…" or "EyalShacham@…" → "ES"; one name → its first two letters. */
export function initialsOf(email: string | null): string {
    if (!email) return 'O';
    const parts = email.split('@')[0].split(/[._-]+|(?=[A-Z])/).filter(Boolean);
    const initials = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] ?? 'O').slice(0, 2);
    return initials.toUpperCase();
}

interface AvatarMenuProps {
    session: OwnerSession;
    isOwner: boolean;
    /** The dev server, where the jobs target toggle lives (today's rule). */
    dev: boolean;
    /** <ConnectedOwnerBar page="/" showError={false} showDashboardLink />: today's sign-in, sign-out, jobs target and dashboard link. */
    ownerBar: React.ReactNode;
    onSignIn(): void;
    brandId: BrandId;
    onBrand(id: BrandId): void;
    /** The phone puts Theme and Help in here too (spec §9.8). */
    extra?: React.ReactNode;
}

/**
 * The avatar (spec §8.1 item 6). Signed out it is "Owner sign-in", which
 * grants nothing by itself; signed in it shows the owner's initials and a
 * menu with the owner bar and, for the owner only, the brand preview (§5).
 * Absent when it would do nothing: a production build without sign-in
 * (ruling R14).
 */
const AvatarMenu: React.FC<AvatarMenuProps> = ({ session, isOwner, dev, ownerBar, onSignIn, brandId, onBrand, extra }) => {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    if (!dev && !session.configured && !session.signedIn && !extra) return null;
    const signedIn = session.signedIn;
    const canSignIn = session.configured || dev;
    // On a phone the avatar also holds Theme and Help (spec §9.8); without sign-in it is just a menu.
    const label = signedIn ? `Owner menu, signed in as ${session.email ?? 'the owner'}` : canSignIn ? 'Owner sign-in' : 'Menu';
    // A visitor of a production build with sign-in gets straight to Cognito.
    const opensMenu = signedIn || dev || isOwner || Boolean(extra) || !session.configured;
    // Final review B, M1: the popover used to always say "Owner", including the phone's
    // visitor case (label 'Menu'), which holds only Theme and Help -- nothing owner-related.
    const popoverLabel = label === 'Menu' ? 'Menu' : 'Owner';
    return (
        <>
            <Tooltip title={signedIn ? 'Owner menu' : label}>
                <IconButton
                    className="ql-avatar-button"
                    aria-label={label}
                    aria-haspopup={opensMenu ? 'dialog' : undefined}
                    aria-expanded={opensMenu ? anchor !== null : undefined}
                    onClick={event => (opensMenu ? setAnchor(event.currentTarget) : onSignIn())}
                >
                    {signedIn ? <span className="ql-avatar" aria-hidden="true">{initialsOf(session.email)}</span>
                        : canSignIn ? <PersonOutline fontSize="small" /> : <MoreVert fontSize="small" />}
                </IconButton>
            </Tooltip>
            <Popover
                open={anchor !== null}
                anchorEl={anchor}
                onClose={() => setAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{ paper: { className: 'avatar-menu', role: 'dialog', 'aria-label': popoverLabel } as object }}
            >
                {(signedIn || canSignIn) && ownerBar}
                {isOwner && (
                    <FormControl component="fieldset" className="avatar-brand">
                        <FormLabel component="legend" id="brand-preview-label">Brand preview</FormLabel>
                        <RadioGroup aria-labelledby="brand-preview-label" value={brandId}
                            onChange={event => onBrand(event.target.value as BrandId)}>
                            {BRANDS.map(brand => (
                                <FormControlLabel key={brand.id} value={brand.id} control={<Radio size="small" />} label={brand.name} />
                            ))}
                        </RadioGroup>
                        <FormHelperText>Previews the name in this browser only; nobody else sees it.</FormHelperText>
                    </FormControl>
                )}
                {extra}
            </Popover>
        </>
    );
};

export default AvatarMenu;
