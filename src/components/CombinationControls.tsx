import React, { useEffect, useState } from 'react';
import {
  Alert, FormControl, FormHelperText, FormLabel, InputLabel, MenuItem, Select, SelectChangeEvent,
  Slider, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import {
  CombinationSelection, NO_COMBINATION, DEFAULT_FIELD_AU, OVERLAY_COLORS, StarkChoice,
  hybridMemberLabel, selectionProblem,
} from '../combinations';
import { HybridKind, HYBRID_NAMES, hybridCount } from '../hybrids';
import { MAX_FIELD_AU } from '../field_source';
import {
  N2_MAX_FIELD_AU, DEBYE_PER_EA0, EV_PER_HARTREE, formatVoltsPerMetre, inducedDipole,
  nextOrderDipoleShare, starkShiftHartree,
} from '../stark';

export const HYBRID_CAPTION =
  "A basis choice for one atom — hybrids describe bonding directions, not a free atom's ground state.";
/** Both levels' validity statement; the refusal threshold that follows it is each level's own. */
const FIELD_VALIDITY = 'Valid for F ≪ 1 a.u.; ionisation by tunnelling is ignored.';
export const FIELD_CAPTION =
  `${FIELD_VALIDITY} Fields above 0.05 a.u. are refused (the n = 1 electron goes over the barrier at 0.0625 a.u.).`;
const N2_FIELD_CAPTION =
  `${FIELD_VALIDITY} Above ${N2_MAX_FIELD_AU} a.u. an n = 2 electron is not bound: the field lowers the barrier below its energy (F = E²/4, E = −1/8 Ha), so stronger fields are refused here. First-order (degenerate) perturbation theory: the field picks these two combinations out of the four n = 2 states. They are the sp hybrid shapes, and they do not change with F; only their energies do.`;

type Choice = 'none' | HybridKind | 'field';

const CHOICES: Array<{ value: Choice; label: string }> = [
  { value: 'none', label: 'None (single orbital)' },
  { value: 'sp', label: HYBRID_NAMES.sp },
  { value: 'sp2', label: HYBRID_NAMES.sp2 },
  { value: 'sp3', label: HYBRID_NAMES.sp3 },
  { value: 'field', label: 'Electric field' },
];

function choiceOf(selection: CombinationSelection): Choice {
  if (selection.kind === 'hybrid') return selection.hybrid;
  return selection.kind === 'field' ? 'field' : 'none';
}

function selectionFor(choice: Choice, current: CombinationSelection): CombinationSelection {
  if (choice === 'none') return NO_COMBINATION;
  if (choice === 'field') {
    return current.kind === 'field' ? current : { kind: 'field', level: 1, field: DEFAULT_FIELD_AU, stark: 'lower' };
  }
  return { kind: 'hybrid', hybrid: choice, member: 'all' };
}

/** "−0.0117", "+0.0117", "0.0000": with a real minus sign, and none on zero. */
function signed(value: number, digits: number): string {
  const text = Math.abs(value).toFixed(digits);
  if (Number(text) === 0) return text;
  return `${value < 0 ? '−' : '+'}${text}`;
}

interface CombinationControlsProps {
  selection: CombinationSelection;
  onChange: (selection: CombinationSelection) => void;
}

/**
 * Basic Orbitals' Combination picker (spec §5 Phase 1). Every choice here is
 * complete on its own, so it renders at once -- there is no Update step. The
 * slider commits on release: each commit is a fresh worker render, and
 * dragging would otherwise start one per pixel.
 */
// MUI capitalises toggle buttons, which turns the quantum number n = 2 into
// "N = 2" and the hybrid h₁ into "H₁". These labels are symbols; keep their case.
const KEEP_CASE = { '& .MuiToggleButton-root': { textTransform: 'none' } } as const;

const CombinationControls: React.FC<CombinationControlsProps> = ({ selection, onChange }) => {
  const committedField = selection.kind === 'field' ? selection.field : DEFAULT_FIELD_AU;
  const [draftField, setDraftField] = useState(committedField);
  useEffect(() => { setDraftField(committedField); }, [committedField]);
  const problem = selectionProblem(selection);

  return (
    <>
      <FormControl fullWidth margin="normal" size="small">
        <InputLabel id="combination-select-label">Combination</InputLabel>
        <Select
          labelId="combination-select-label"
          id="combination-select"
          value={choiceOf(selection)}
          label="Combination"
          onChange={(e: SelectChangeEvent<string>) => onChange(selectionFor(e.target.value as Choice, selection))}
        >
          {CHOICES.map(choice => <MenuItem key={choice.value} value={choice.value}>{choice.label}</MenuItem>)}
        </Select>
        {selection.kind !== 'none' && (
          <FormHelperText>
            {selection.kind === 'hybrid'
              ? "Built from hydrogen's exact 2s and 2p (Z = 1)."
              : 'Hydrogen (Z = 1) in a uniform field along +z, which pulls the electron towards −z.'}
          </FormHelperText>
        )}
      </FormControl>

      {selection.kind === 'hybrid' && (
        <FormControl component="fieldset" margin="normal" fullWidth>
          <FormLabel component="legend" sx={{ mb: 0.5, fontSize: '0.75rem' }}>Show</FormLabel>
          <ToggleButtonGroup
            sx={KEEP_CASE}
            value={selection.member === 'all' ? 'all' : String(selection.member)}
            exclusive
            size="small"
            fullWidth
            aria-label="hybrids shown"
            onChange={(event: React.MouseEvent<HTMLElement>, value: string | null) => {
              if (value !== null) onChange({ ...selection, member: value === 'all' ? 'all' : Number(value) });
            }}
          >
            <ToggleButton value="all" aria-label="all hybrids">All</ToggleButton>
            {Array.from({ length: hybridCount(selection.hybrid) }, (_, i) => (
              <ToggleButton key={i} value={String(i)} aria-label={`hybrid ${i + 1}`}>
                <span className="combination-swatch" style={{ background: OVERLAY_COLORS[i] }} />
                {hybridMemberLabel(i)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <FormHelperText className="combination-caption" sx={{ mx: 0 }}>{HYBRID_CAPTION}</FormHelperText>
        </FormControl>
      )}

      {selection.kind === 'field' && (
        <FormControl component="fieldset" margin="normal" fullWidth>
          <FormLabel component="legend" sx={{ mb: 0.5, fontSize: '0.75rem' }}>Level</FormLabel>
          <ToggleButtonGroup
            sx={KEEP_CASE}
            value={String(selection.level)}
            exclusive
            size="small"
            fullWidth
            aria-label="field level"
            onChange={(event: React.MouseEvent<HTMLElement>, value: string | null) => {
              if (value === null) return;
              const level = value === '2' ? 2 : 1;
              onChange({ ...selection, level, field: level === 2 ? Math.min(selection.field, N2_MAX_FIELD_AU) : selection.field });
            }}
          >
            <ToggleButton value="1" aria-label="ground state n = 1">n = 1</ToggleButton>
            <ToggleButton value="2" aria-label="first excited level n = 2">n = 2</ToggleButton>
          </ToggleButtonGroup>

          <FormLabel id="field-strength-label" sx={{ mt: 1.5, fontSize: '0.75rem' }}>
            Field F = {draftField.toFixed(selection.level === 1 ? 3 : 4)} a.u. ({formatVoltsPerMetre(draftField)})
          </FormLabel>
          <Slider
            aria-labelledby="field-strength-label"
            value={Math.min(draftField, selection.level === 1 ? MAX_FIELD_AU : N2_MAX_FIELD_AU)}
            min={0}
            max={selection.level === 1 ? MAX_FIELD_AU : N2_MAX_FIELD_AU}
            step={selection.level === 1 ? 0.001 : 0.0001}
            size="small"
            valueLabelDisplay="off"
            sx={{ mx: '12px', width: 'auto' }}
            onChange={(event: Event, value: number | number[]) => setDraftField(Array.isArray(value) ? value[0] : value)}
            onChangeCommitted={(event: React.SyntheticEvent | Event, value: number | number[]) =>
              onChange({ ...selection, field: Array.isArray(value) ? value[0] : value })}
          />

          {selection.level === 1 ? (
            <>
              <Typography variant="body2" className="combination-readout">
                Induced dipole μ = αF = {inducedDipole(draftField).toFixed(3)} e·a₀ ({(inducedDipole(draftField) * DEBYE_PER_EA0).toFixed(3)} D)
              </Typography>
              <FormHelperText sx={{ mx: 0 }}>
                α = 9/2 a₀³, exact for hydrogen. Drawn: ψ = ψ₁ₛ − F z (1 + r/2) ψ₁ₛ, first-order perturbation theory (Dalgarno–Lewis).
              </FormHelperText>
              <FormHelperText className="combination-caption" sx={{ mx: 0 }}>
                {FIELD_CAPTION}
                {nextOrderDipoleShare(draftField) >= 0.01
                  ? ` At this field the next-order (hyperpolarisability) term would change μ by about ${Math.round(nextOrderDipoleShare(draftField) * 100)} %.`
                  : ''}
              </FormHelperText>
            </>
          ) : (
            <>
              <ToggleButtonGroup
                value={selection.stark}
                exclusive
                size="small"
                fullWidth
                aria-label="Stark state"
                sx={{ ...KEEP_CASE, mt: 1 }}
                onChange={(event: React.MouseEvent<HTMLElement>, value: StarkChoice | null) => {
                  if (value !== null) onChange({ ...selection, stark: value });
                }}
              >
                <ToggleButton value="lower" aria-label="lower Stark state">Lower</ToggleButton>
                <ToggleButton value="upper" aria-label="upper Stark state">Upper</ToggleButton>
                <ToggleButton value="both" aria-label="both Stark states">Both</ToggleButton>
              </ToggleButtonGroup>
              {(() => {
                const lowerShift = starkShiftHartree('lower', draftField);
                const upperShift = starkShiftHartree('upper', draftField);
                return (
                  <>
                    <Typography variant="body2" className="combination-readout">
                      (2s + 2p_z)/√2: ΔE = −3F = {signed(lowerShift, 4)} Ha ({signed(lowerShift * EV_PER_HARTREE, 2)} eV)
                    </Typography>
                    <Typography variant="body2" className="combination-readout">
                      (2s − 2p_z)/√2: ΔE = +3F = {signed(upperShift, 4)} Ha ({signed(upperShift * EV_PER_HARTREE, 2)} eV)
                    </Typography>
                  </>
                );
              })()}
              <FormHelperText className="combination-caption" sx={{ mx: 0 }}>{N2_FIELD_CAPTION}</FormHelperText>
            </>
          )}
        </FormControl>
      )}

      {/* Any selection can fail (an out-of-range hybrid member, a field
          outside the drawn range) -- shown here, once, regardless of which
          kind of selection it is, so a failure is never silently swallowed
          into an empty view (see selectionProblem's doc comment). */}
      {problem && <Alert severity="error" sx={{ mt: 1 }}>{problem}</Alert>}
    </>
  );
};

export default CombinationControls;
