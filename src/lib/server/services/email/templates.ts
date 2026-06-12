// Email templates: base layout + verification / password reset / generic
// notification. Plain TS string templates - lightweight, easily unit-tested.

export interface RenderedEmail {
	subject: string;
	html: string;
	text: string;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

export function baseLayout(title: string, bodyHtml: string, unsubscribeUrl?: string): string {
	const footer = unsubscribeUrl
		? `<p style="font-size:12px;color:#64748b">
				<a href="${unsubscribeUrl}" style="color:#64748b">Unsubscribe</a> from these emails with one click.
			</p>`
		: '';
	return `<!doctype html>
<html>
<body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
	<div style="max-width:560px;margin:0 auto;padding:24px">
		<h2 style="margin:0 0 4px">PurFacted</h2>
		<p style="margin:0 0 24px;font-size:13px;color:#64748b">Community fact verification</p>
		<div style="background:#ffffff;border-radius:8px;padding:24px">
			<h3 style="margin-top:0">${escapeHtml(title)}</h3>
			${bodyHtml}
		</div>
		${footer}
	</div>
</body>
</html>`;
}

function button(url: string, label: string): string {
	return `<p style="margin:24px 0"><a href="${url}" style="background:#0f172a;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none">${escapeHtml(label)}</a></p>
<p style="font-size:12px;color:#64748b">Or open this link: ${url}</p>`;
}

export function renderVerificationEmail(params: {
	username: string;
	verifyUrl: string;
	expiryHours: number;
}): RenderedEmail {
	const subject = 'Verify your PurFacted account';
	const html = baseLayout(
		subject,
		`<p>Hi ${escapeHtml(params.username)},</p>
<p>welcome to PurFacted! Confirm your email address to activate your account.</p>
${button(params.verifyUrl, 'Verify email')}
<p style="font-size:12px;color:#64748b">The link expires in ${params.expiryHours} hours. If you did not sign up, ignore this email.</p>`
	);
	const text = `Hi ${params.username},

welcome to PurFacted! Confirm your email address to activate your account:

${params.verifyUrl}

The link expires in ${params.expiryHours} hours. If you did not sign up, ignore this email.`;
	return { subject, html, text };
}

export function renderPasswordResetEmail(params: {
	username: string;
	resetUrl: string;
	expiryHours: number;
}): RenderedEmail {
	const subject = 'Reset your PurFacted password';
	const html = baseLayout(
		subject,
		`<p>Hi ${escapeHtml(params.username)},</p>
<p>someone (hopefully you) requested a password reset.</p>
${button(params.resetUrl, 'Reset password')}
<p style="font-size:12px;color:#64748b">The link expires in ${params.expiryHours} hour(s). If you did not request this, ignore this email - your password stays unchanged.</p>`
	);
	const text = `Hi ${params.username},

someone (hopefully you) requested a password reset:

${params.resetUrl}

The link expires in ${params.expiryHours} hour(s). If you did not request this, ignore this email.`;
	return { subject, html, text };
}

export function renderNotificationEmail(params: {
	username: string;
	subject: string;
	bodyHtml: string;
	bodyText: string;
	unsubscribeUrl: string;
}): RenderedEmail {
	const html = baseLayout(
		params.subject,
		`<p>Hi ${escapeHtml(params.username)},</p>
${params.bodyHtml}`,
		params.unsubscribeUrl
	);
	const text = `Hi ${params.username},

${params.bodyText}

--
Unsubscribe: ${params.unsubscribeUrl}`;
	return { subject: params.subject, html, text };
}
