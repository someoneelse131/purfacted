// Honeypot check (R19): public forms include a hidden "website" field that
// humans never fill. A filled value marks the submission as bot traffic -
// handlers should pretend success and store nothing.
export function honeypotTriggered(form: FormData): boolean {
	return String(form.get('website') ?? '') !== '';
}
