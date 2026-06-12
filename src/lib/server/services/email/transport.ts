import nodemailer from 'nodemailer';
import type { Redis } from 'ioredis';
import type { EmailMessage, SendEmailFn } from './types';

// SMTP transport from .env. Without SMTP_HOST (local dev / E2E) mails land in
// a Redis "dev mailbox" readable via the dev-only mailbox endpoint.

export interface SmtpEnv {
	SMTP_HOST?: string;
	SMTP_PORT?: string;
	SMTP_USER?: string;
	SMTP_PASSWORD?: string;
	SMTP_FROM?: string;
	SMTP_ENCRYPTION?: string; // none | starttls | tls
}

export function createSmtpSender(env: SmtpEnv): SendEmailFn {
	const port = Number(env.SMTP_PORT ?? 587);
	const encryption = env.SMTP_ENCRYPTION ?? 'starttls';
	const transporter = nodemailer.createTransport({
		host: env.SMTP_HOST,
		port,
		secure: encryption === 'tls',
		ignoreTLS: encryption === 'none',
		auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined
	});
	const from = env.SMTP_FROM ?? 'PurFacted <noreply@purfacted.com>';
	return async (mail: EmailMessage) => {
		await transporter.sendMail({
			from,
			to: mail.to,
			subject: mail.subject,
			html: mail.html,
			text: mail.text
		});
	};
}

const DEV_MAILBOX_PREFIX = 'dev:mailbox:';
const DEV_MAILBOX_MAX = 20;

export function createDevMailboxSender(redis: Redis): SendEmailFn {
	return async (mail: EmailMessage) => {
		const key = DEV_MAILBOX_PREFIX + mail.to.toLowerCase();
		await redis.lpush(key, JSON.stringify({ ...mail, receivedAt: Date.now() }));
		await redis.ltrim(key, 0, DEV_MAILBOX_MAX - 1);
	};
}

export async function readDevMailbox(redis: Redis, to: string): Promise<EmailMessage[]> {
	const raw = await redis.lrange(DEV_MAILBOX_PREFIX + to.toLowerCase(), 0, -1);
	return raw.map((entry) => JSON.parse(entry) as EmailMessage);
}

export function createSenderFromEnv(env: SmtpEnv, redis: Redis): SendEmailFn {
	return env.SMTP_HOST ? createSmtpSender(env) : createDevMailboxSender(redis);
}
