// Cloudflare Turnstile verification (R3). When no secret key is configured
// (dev/test), the check passes - the honeypot field still applies.

export async function verifyCaptcha(
	secretKey: string | undefined,
	token: string | undefined,
	ip: string
): Promise<boolean> {
	if (!secretKey) return true;
	if (!token) return false;
	try {
		const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ secret: secretKey, response: token, remoteip: ip })
		});
		const data = (await res.json()) as { success: boolean };
		return data.success === true;
	} catch {
		// Fail closed: a captcha outage must not open the registration to bots.
		return false;
	}
}
