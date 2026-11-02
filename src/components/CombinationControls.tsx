import React, { useEffect, useId, useRef, useState } from 'react';
import {
  Alert, FormControl, FormLabel, Slider, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import {
  CombinationSelection, Construction, constructionOf, NO_COMBINATION, DEFAULT_FIELD_AU, OVERLAY_COLORS, StarkChoice,
  hybridMemberLabel, selectionProblem,
} from '../combinations';
import { HybridKind, HYBRID_NAMES, hybridCount } from '../hybrids';
import { MAX_FIELD_AU } from '../field_source';
import { KEEP_CASE } from '../design/mui';
import { useRovingFocus } from '../shell/useRovingFocus';
import InfoButton from '../info/InfoButton';
import '../basic_ui/basic_explore.css';
import {
  N2_MAX_FIELD_AU, DEBYE_PER_EA0, formatVoltsPerMetre, inducedDipole, starkShiftHartree, starkShiftText,
} from '../stark';

/* Task 5: the captions that stood here -- what a combination is built from, the hybrids' basis-choice note, the
   field's method and validity -- are Info's now (src/info/basic_info.ts). The picker keeps its controls and the
   short labelled readouts (the field, the induced dipole, the n = 2 shifts). */

/** "2p" with a real subscript z (Task 5), in the n = 2 readouts' state names. */
const TwoPz = () => <>2p<sub>z</sub></>;

/** Panel fixes (owner review 2026-11-02): what is being built is a plain choice, not a menu entry beside "None". */
const CONSTRUCTIONS: Array<{ value: Construction; label: string }> = [
  { value: 'single', label: 'Single orbital' },
  { value: 'hybrid', label: 'Hybrids' },
  { value: 'field', label: 'Electric field' },
];

/** The hybrid types, typeset (sp²) in the label and spoken with plain digits ("sp2"), as the project says them. */
const HYBRID_KINDS = Object.keys(HYBRID_NAMES) as HybridKind[];

type HybridSelection = Extract<CombinationSelection, { kind: 'hybrid' }>;
type FieldSelection = Extract<CombinationSelection, { kind: 'field' }>;

/** Entering Hybrids from a single orbital starts at sp³, the classic methane teaching case. */
const FIRST_HYBRID: HybridSelection = { kind: 'hybrid', hybrid: 'sp3', member: 'all' };
const FIRST_FIELD: FieldSelection = { kind: 'field', level: 1, field: DEFAULT_FIELD_AU, stark: 'lower' };

interface CombinationControlsProps {
  selection: CombinationSelection;
  onChange: (selection: CombinationSelection) => void;
  /**
   * What the Single orbital choice shows beneath the group -- BasicExplore's Shell n chips. They are not shown while
   * hybrids or a field are drawn, so no chip can stay lit beside a combination.
   */
  singleControls?: React.ReactNode;
}

/**
 * Basic Orbitals' Construction picker (spec §5 Phase 1; panel fixes P1): Single orbital · Hybrids · Electric field,
 * then what the choice needs. Every choice here is complete on its own, so it renders at once -- there is no Update
 * step. The slider commits on release: each commit is a fresh worker render, and dragging would otherwise start one
 * per pixel. The group follows `selection.kind`, so a ⌘K pick, a link or a strip pick moves it with no extra wiring.
 */
const CombinationControls: React.FC<CombinationControlsProps> = ({ selection, onChange, singleControls }) => {
  const committedField = selection.kind === 'field' ? selection.field : DEFAULT_FIELD_AU;
  const [draftField, setDraftField] = useState(committedField);
  useEffect(() => { setDraftField(committedField); }, [committedField]);
  const problem = selectionProblem(selection);
  const construction = constructionOf(selection);
  const hybridLabelId = useId();

  // The session's last hybrid and last field, so going Hybrids -> Electric field -> Hybrids returns to what the reader
  // had. Taken from the selection itself, so one that arrived by a link or a ⌘K pick is remembered too -- unless
  // selectionProblem refuses it, which would re-enter a picture that is not drawn. Never in a link. Refs, so they live
  // for the component's lifetime and are lost when Orbitals unmounts, on purpose (panel fixes review).
  const lastHybrid = useRef<HybridSelection>(FIRST_HYBRID);
  const lastField = useRef<FieldSelection>(FIRST_FIELD);
  useEffect(() => {
    if (selectionProblem(selection)) return;
    if (selection.kind === 'hybrid') lastHybrid.current = selection;
    else if (selection.kind === 'field') lastField.current = selection;
  }, [selection]);

  // §13: arrow keys, Home and End move within each group, which is one Tab stop.
  const constructionRef = useRef<HTMLDivElement>(null);
  useRovingFocus(constructionRef, { selector: '.MuiToggleButton-root', orientation: 'horizontal' });
  const hybridTypeRef = useRef<HTMLDivElement>(null);
  useRovingFocus(hybridTypeRef, { selector: '.MuiToggleButton-root', orientation: 'horizontal' }, selection.kind === 'hybrid');

  const choose = (next: Construction) => {
    if (next === 'single') onChange(NO_COMBINATION);
    else onChange(next === 'hybrid' ? lastHybrid.current : lastField.current);
  };

  return (
    <>
      <ToggleButtonGroup
        ref={constructionRef}
        sx={{ ...KEEP_CASE, my: 1 }}
        value={construction}
        exclusive
        size="small"
        fullWidth
        aria-label="Construction"
        onChange={(_event: React.MouseEvent<HTMLElement>, value: Construction | null) => {
          if (value !== null) choose(value);
        }}
      >
        {CONSTRUCTIONS.map(({ value, label }) => <ToggleButton key={value} value={value}>{label}</ToggleButton>)}
      </ToggleButtonGroup>

      {construction === 'single' && singleControls}

      {/* Owner review 2026-11-02: each construction's controls open with a visible label and an (i), as BasicExplore's
          "Shell n (i)" -- the same row-head, so Hybrids and Electric field are explained where they are chosen. The group
          is named by the visible label (WCAG 2.5.3), not by a lower-case aria-label that differed from it. */}
      {selection.kind === 'hybrid' && (
        <div className="basic-row-head">
          <span id={hybridLabelId} className="basic-row-label">Hybrid type</span>
          <InfoButton topic="hybrid" label="Hybrid orbitals" />
        </div>
      )}

      {selection.kind === 'hybrid' && (
        <ToggleButtonGroup
          ref={hybridTypeRef}
          sx={{ ...KEEP_CASE, mt: 0.5 }}
          value={selection.hybrid}
          exclusive
          size="small"
          fullWidth
          aria-labelledby={hybridLabelId}
          onChange={(_event: React.MouseEvent<HTMLElement>, value: HybridKind | null) => {
            if (value !== null) onChange({ kind: 'hybrid', hybrid: value, member: 'all' });
          }}
        >
          {HYBRID_KINDS.map(kind => <ToggleButton key={kind} value={kind} aria-label={kind}>{HYBRID_NAMES[kind]}</ToggleButton>)}
        </ToggleButtonGroup>
      )}

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
        </FormControl>
      )}

      {selection.kind === 'field' && (
        <div className="basic-row-head">
          <span className="basic-row-label">Field</span>
          <InfoButton topic="field" label="Orbital in an electric field" />
        </div>
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
                      (2s + <TwoPz />)/√2: ΔE = −3F = {starkShiftText(lowerShift)}
                    </Typography>
                    <Typography variant="body2" className="combination-readout">
                      (2s − <TwoPz />)/√2: ΔE = +3F = {starkShiftText(upperShift)}
                    </Typography>
                  </>
                );
              })()}
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
