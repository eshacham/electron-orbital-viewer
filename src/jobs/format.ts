import type { Capacity, CanonicalJob, JobView } from './api_types';

export type MoneyLabel = 'spent' | 'reserved' | 'projected' | 'remaining' | 'billed';

/**
 * USD at the precision the meter has (whole micro-dollars): cents from a
 * cent up, and below that four significant figures, so a 0.3-cent Spot
 * minute reads "$0.002980" rather than a misleading "$0.00".
 */
export function formatUsd(usd: number): string {
    const sign = usd < 0 ? '−' : '';
    const value = Math.abs(usd);
    if (value === 0 || value >= 0.01) return `${sign}$${value.toFixed(2)}`;
    return `${sign}$${value.toPrecision(4)}`;
}

/** A figure is never bare: spent, reserved and projected mean different things for the cap. */
export function money(label: MoneyLabel, usd: number): string {
    return `${label} ${formatUsd(usd)}`;
}

export const microsToUsd = (micros: number): number => micros / 1_000_000;

export function formatDuration(seconds: number): string {
    const s = Math.max(0, Math.round(seconds));
    if (s < 60) return `${s} s`;
    if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
    return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} min`;
}

export const formatGB = (gb: number): string => `${gb.toFixed(gb < 10 ? 2 : 1)} GB`;

/** Total energies to the µHa the SCF converges to, with the method beside them (parent spec §3.1). */
export function formatEnergy(hartree: number, method: string): string {
    return `${hartree < 0 ? '−' : ''}${Math.abs(hartree).toFixed(6)} Ha (${method})`;
}

/** Recipe B's optimisation steps run in the smaller basis; everything else is the job's own. */
export function methodOf(job: CanonicalJob, stage: string | null = null): string {
    const { xc, basis, optimiseBasis } = job.method;
    if (optimiseBasis && stage !== null && /^optimisation/i.test(stage)) return `${xc}/${optimiseBasis}`;
    return `${xc}/${basis}`;
}

export const predictionNote = (version: number): string => `sizing v${version} prediction`;

const CAPACITY: Record<Capacity, string> = { spot: 'Spot', 'on-demand': 'on-demand', local: 'This Mac' };
export const capacityLabel = (capacity: Capacity): string => CAPACITY[capacity];

/** Jobs are charged to the UTC month they were submitted in (spec §6.4). */
export function currentMonth(now: Date = new Date()): string {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Seconds since the job started (or, while it waits for a worker, since it was submitted), until it ended. */
export function elapsedSeconds(view: JobView, nowMs: number): number {
    const start = Date.parse(view.startedAt ?? view.submittedAt);
    const end = view.endedAt ? Date.parse(view.endedAt) : nowMs;
    return Math.max(0, Math.round((end - start) / 1000));
}

export const shortKey = (key: string): string => `${key.slice(0, 10)}…`;
