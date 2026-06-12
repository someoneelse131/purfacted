// Local blocklist of common disposable email domains (R3). An optional
// external API check can be layered on top in R19.

const DISPOSABLE_DOMAINS = new Set([
	'10minutemail.com',
	'10minutemail.net',
	'20minutemail.com',
	'33mail.com',
	'anonbox.net',
	'burnermail.io',
	'byom.de',
	'dispostable.com',
	'emailondeck.com',
	'fakeinbox.com',
	'getairmail.com',
	'getnada.com',
	'guerrillamail.biz',
	'guerrillamail.com',
	'guerrillamail.de',
	'guerrillamail.info',
	'guerrillamail.net',
	'guerrillamail.org',
	'inboxkitten.com',
	'maildrop.cc',
	'mailinator.com',
	'mailnesia.com',
	'mailsac.com',
	'mintemail.com',
	'mohmal.com',
	'mytemp.email',
	'nada.email',
	'sharklasers.com',
	'spam4.me',
	'spamgourmet.com',
	'tempail.com',
	'temp-mail.io',
	'temp-mail.org',
	'tempmail.com',
	'tempmail.dev',
	'tempmailo.com',
	'tempr.email',
	'throwawaymail.com',
	'trash-mail.com',
	'trashmail.com',
	'trashmail.de',
	'yopmail.com',
	'yopmail.fr',
	'yopmail.net'
]);

export function isDisposableEmail(email: string): boolean {
	const domain = email.split('@')[1]?.toLowerCase();
	if (!domain) return false;
	return DISPOSABLE_DOMAINS.has(domain);
}
