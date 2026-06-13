/**
 * Single source of truth for how a fact status looks (DESIGN.md §2/§3).
 * Consumed by StatusBadge (and later embeds / OG images) so label, color
 * and icon can never drift between surfaces.
 *
 * Icons are Heroicons outline paths (24x24 viewBox, 1.5px stroke).
 */

export type FactStatus = 'UNDER_REVIEW' | 'VERIFIED' | 'DISPUTED' | 'REFUTED' | 'UNSUBSTANTIATED';

export interface StatusStyle {
	/** Sentence-case label; badges render it uppercase via CSS. */
	label: string;
	/** Text/icon color utility (the strong tone). */
	strongClass: string;
	/** Background utility (the soft tone). */
	softClass: string;
	/** Heroicon outline path data. */
	icon: string;
}

export const STATUS_STYLES: Record<FactStatus, StatusStyle> = {
	VERIFIED: {
		label: 'Verified',
		strongClass: 'text-status-verified-strong',
		softClass: 'bg-status-verified-soft',
		// check-badge
		icon: 'M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z'
	},
	DISPUTED: {
		label: 'Disputed',
		strongClass: 'text-status-disputed-strong',
		softClass: 'bg-status-disputed-soft',
		// scale
		icon: 'M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.971A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 0 1-2.031.352 5.988 5.988 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971Zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 0 1-2.031.352 5.989 5.989 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971Z'
	},
	REFUTED: {
		label: 'Refuted',
		strongClass: 'text-status-refuted-strong',
		softClass: 'bg-status-refuted-soft',
		// x-circle
		icon: 'm9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'
	},
	UNSUBSTANTIATED: {
		label: 'Unsubstantiated',
		strongClass: 'text-status-unsubstantiated-strong',
		softClass: 'bg-status-unsubstantiated-soft',
		// question-mark-circle
		icon: 'M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z'
	},
	UNDER_REVIEW: {
		label: 'Under review',
		strongClass: 'text-status-under-review-strong',
		softClass: 'bg-status-under-review-soft',
		// magnifying-glass
		icon: 'm21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z'
	}
};

/**
 * Contested marker: outline-only amber pill rendered NEXT TO the regular
 * status badge (e.g. an open veto), never replacing it.
 */
export const CONTESTED_MARKER = {
	strongClass: 'text-contested',
	outlineClass: 'border border-contested text-contested',
	// exclamation-triangle
	icon: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.008v.008H12v-.008Z'
} as const;

/** Lookup with a safe fallback so an unknown status can never crash the UI. */
export function statusStyle(status: string): StatusStyle {
	return STATUS_STYLES[status as FactStatus] ?? STATUS_STYLES.UNSUBSTANTIATED;
}
