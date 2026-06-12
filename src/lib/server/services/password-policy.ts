import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core';
import * as zxcvbnCommonPackage from '@zxcvbn-ts/language-common';
import * as zxcvbnEnPackage from '@zxcvbn-ts/language-en';

zxcvbnOptions.setOptions({
	translations: zxcvbnEnPackage.translations,
	graphs: zxcvbnCommonPackage.adjacencyGraphs,
	dictionary: {
		...zxcvbnCommonPackage.dictionary,
		...zxcvbnEnPackage.dictionary
	}
});

export interface PasswordPolicy {
	minLength: number;
	minScore: number;
}

export interface PasswordCheck {
	ok: boolean;
	error?: string;
}

export function checkPassword(
	password: string,
	policy: PasswordPolicy,
	userInputs: string[] = []
): PasswordCheck {
	if (password.length < policy.minLength) {
		return { ok: false, error: `Password must be at least ${policy.minLength} characters.` };
	}
	const result = zxcvbn(password, userInputs);
	if (result.score < policy.minScore) {
		const hint = result.feedback.warning || 'Password is too easy to guess.';
		return { ok: false, error: hint };
	}
	return { ok: true };
}
