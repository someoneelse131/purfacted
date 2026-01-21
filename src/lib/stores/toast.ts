import { writable } from 'svelte/store';

export interface Toast {
	id: string;
	message: string;
	type: 'success' | 'error' | 'info';
}

function createToastStore() {
	const { subscribe, update } = writable<Toast[]>([]);

	return {
		subscribe,
		add(message: string, type: Toast['type'] = 'info', duration = 3000) {
			const id = Math.random().toString(36).slice(2);
			update((toasts) => [...toasts, { id, message, type }]);
			if (duration > 0) {
				setTimeout(() => this.remove(id), duration);
			}
			return id;
		},
		remove(id: string) {
			update((toasts) => toasts.filter((t) => t.id !== id));
		},
		success(message: string, duration = 3000) {
			return this.add(message, 'success', duration);
		},
		error(message: string, duration = 5000) {
			return this.add(message, 'error', duration);
		},
		info(message: string, duration = 3000) {
			return this.add(message, 'info', duration);
		}
	};
}

export const toast = createToastStore();
