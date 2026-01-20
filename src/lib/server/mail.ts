import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { set, get } from './redis';

const MAIL_HOST = process.env.MAIL_HOST || 'smtp.example.com';
const MAIL_PORT = parseInt(process.env.MAIL_PORT || '587', 10);
const MAIL_USER = process.env.MAIL_USER || '';
const MAIL_PASSWORD = process.env.MAIL_PASSWORD || '';
const MAIL_FROM = process.env.MAIL_FROM || 'noreply@purfacted.com';
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || 'PurFacted';
const MAIL_ENCRYPTION = process.env.MAIL_ENCRYPTION || 'tls';
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
	if (transporter) return transporter;

	// Build transport options based on encryption setting
	// Supported values: 'ssl', 'tls', 'none' (plaintext)
	const transportOptions: Record<string, unknown> = {
		host: MAIL_HOST,
		port: MAIL_PORT,
		secure: MAIL_ENCRYPTION === 'ssl'
	};

	// Only include auth if credentials are provided
	if (MAIL_USER && MAIL_PASSWORD) {
		transportOptions.auth = {
			user: MAIL_USER,
			pass: MAIL_PASSWORD
		};
	}

	// Add TLS config when using TLS (STARTTLS)
	if (MAIL_ENCRYPTION === 'tls') {
		transportOptions.tls = { rejectUnauthorized: false };
	}

	transporter = nodemailer.createTransport(transportOptions);

	return transporter;
}

export interface EmailOptions {
	to: string;
	subject: string;
	html: string;
	text?: string;
}

/**
 * Send an email immediately
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
	try {
		const transport = getTransporter();

		await transport.sendMail({
			from: `"${MAIL_FROM_NAME}" <${MAIL_FROM}>`,
			to: options.to,
			subject: options.subject,
			html: options.html,
			text: options.text || stripHtml(options.html)
		});

		return true;
	} catch (error) {
		console.error('Failed to send email:', error);
		return false;
	}
}

/**
 * Queue an email for later sending (via Redis)
 */
export async function queueEmail(options: EmailOptions): Promise<void> {
	const queueKey = `email_queue:${Date.now()}:${Math.random().toString(36).substring(7)}`;
	await set(queueKey, JSON.stringify(options), 86400); // 24 hour TTL

	// In a real implementation, you'd have a worker process consuming this queue
	// For now, we'll just send immediately in development
	if (process.env.NODE_ENV === 'development') {
		console.log('[Email Queue] Would send email:', options.subject, 'to:', options.to);
	}
}

/**
 * Process queued emails (would be called by a worker)
 */
export async function processEmailQueue(): Promise<void> {
	// This would be implemented with a proper queue consumer
	// For MVP, emails are sent immediately
	console.log('[Email Queue] Processing queued emails...');
}

// Simple HTML to text converter
function stripHtml(html: string): string {
	return html
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/p>/gi, '\n\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.trim();
}

// ============================================
// Email Templates
// ============================================

const baseTemplate = (content: string, unsubscribeText: string = '') => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PurFacted</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; }
    .header h1 { color: #0ea5e9; margin: 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 8px; }
    .button { display: inline-block; background: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
    .unsubscribe { color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>PurFacted</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} PurFacted. All rights reserved.</p>
      ${unsubscribeText ? `<p class="unsubscribe">${unsubscribeText}</p>` : ''}
    </div>
  </div>
</body>
</html>
`;

/**
 * Email verification template
 */
export function emailVerificationTemplate(firstName: string, verificationUrl: string): string {
	const content = `
    <h2>Welcome to PurFacted, ${firstName}!</h2>
    <p>Thank you for registering. Please verify your email address by clicking the button below:</p>
    <p style="text-align: center;">
      <a href="${verificationUrl}" class="button">Verify Email Address</a>
    </p>
    <p>Or copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: #6b7280;">${verificationUrl}</p>
    <p>This link will expire in 24 hours.</p>
    <p>If you didn't create an account with PurFacted, you can safely ignore this email.</p>
  `;
	return baseTemplate(content, 'This is a transactional email. You received this because you signed up for PurFacted.');
}

/**
 * Password reset template
 */
export function passwordResetTemplate(firstName: string, resetUrl: string): string {
	const content = `
    <h2>Password Reset Request</h2>
    <p>Hi ${firstName},</p>
    <p>We received a request to reset your password. Click the button below to create a new password:</p>
    <p style="text-align: center;">
      <a href="${resetUrl}" class="button">Reset Password</a>
    </p>
    <p>Or copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: #6b7280;">${resetUrl}</p>
    <p>This link will expire in 1 hour.</p>
    <p>If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
  `;
	return baseTemplate(content, 'This is a transactional email related to your account security.');
}

/**
 * Generic notification template
 */
export function notificationTemplate(
	firstName: string,
	title: string,
	message: string,
	actionUrl?: string,
	actionText?: string
): string {
	const actionButton = actionUrl && actionText
		? `<p style="text-align: center;"><a href="${actionUrl}" class="button">${actionText}</a></p>`
		: '';

	const content = `
    <h2>${title}</h2>
    <p>Hi ${firstName},</p>
    <p>${message}</p>
    ${actionButton}
  `;
	return baseTemplate(
		content,
		`To manage your notification preferences, visit your <a href="${PUBLIC_URL}/user/settings">account settings</a>.`
	);
}

// ============================================
// Helper functions for common emails
// ============================================

/**
 * Send verification email
 */
export async function sendVerificationEmail(
	email: string,
	firstName: string,
	token: string
): Promise<boolean> {
	const verificationUrl = `${PUBLIC_URL}/auth/verify?token=${token}`;
	const html = emailVerificationTemplate(firstName, verificationUrl);

	return sendEmail({
		to: email,
		subject: 'Verify your PurFacted account',
		html
	});
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
	email: string,
	firstName: string,
	token: string
): Promise<boolean> {
	const resetUrl = `${PUBLIC_URL}/auth/reset-password?token=${token}`;
	const html = passwordResetTemplate(firstName, resetUrl);

	return sendEmail({
		to: email,
		subject: 'Reset your PurFacted password',
		html
	});
}

/**
 * Send a notification email
 */
export async function sendNotificationEmail(
	email: string,
	firstName: string,
	title: string,
	message: string,
	actionUrl?: string,
	actionText?: string
): Promise<boolean> {
	const html = notificationTemplate(firstName, title, message, actionUrl, actionText);

	return sendEmail({
		to: email,
		subject: title,
		html
	});
}

// Alias for backwards compatibility
export const sendMail = sendEmail;

// ============================================
// Dynamic Template Rendering
// ============================================

/**
 * Render an email template by name with data
 */
export function renderTemplate(templateName: string, data: Record<string, unknown>): string {
	const templates: Record<string, (data: Record<string, unknown>) => string> = {
		trustChange: (d) => {
			const content = d.gained
				? `<h2>Your Trust Score Increased!</h2>
				   <p>Hi ${d.firstName},</p>
				   <p>Your trust score has increased by <strong>${d.change}</strong> points!</p>
				   <p>Your new trust score is: <strong>${d.newScore}</strong></p>
				   <p>Keep contributing quality content to build your reputation.</p>`
				: `<h2>Trust Score Update</h2>
				   <p>Hi ${d.firstName},</p>
				   <p>Your trust score has decreased by <strong>${d.change}</strong> points.</p>
				   <p>Your new trust score is: <strong>${d.newScore}</strong></p>
				   <p>Review our community guidelines to understand how trust scores work.</p>`;
			return baseTemplate(content, d.unsubscribeUrl ? `<a href="${d.unsubscribeUrl}">Unsubscribe from trust notifications</a>` : '');
		},

		factReply: (d) => {
			const content = `
				<h2>New Reply to Your Fact</h2>
				<p>Hi ${d.firstName},</p>
				<p><strong>${d.replyAuthor}</strong> replied to your fact:</p>
				<blockquote style="border-left: 4px solid #0ea5e9; padding-left: 16px; color: #6b7280;">"${d.factTitle}"</blockquote>
				<p style="color: #6b7280;">"${d.replyPreview}"</p>
				<p style="text-align: center;">
					<a href="${d.factUrl}" class="button">View Fact</a>
				</p>
			`;
			return baseTemplate(content, d.unsubscribeUrl ? `<a href="${d.unsubscribeUrl}">Unsubscribe</a>` : '');
		},

		factDisputed: (d) => {
			const content = `
				<h2>Your Fact Has Been Disputed</h2>
				<p>Hi ${d.firstName},</p>
				<p>Your fact has been ${d.disputeType === 'veto' ? 'vetoed' : 'disputed'}:</p>
				<blockquote style="border-left: 4px solid #ef4444; padding-left: 16px; color: #6b7280;">"${d.factTitle}"</blockquote>
				<p style="text-align: center;">
					<a href="${d.factUrl}" class="button">View Details</a>
				</p>
			`;
			return baseTemplate(content, d.unsubscribeUrl ? `<a href="${d.unsubscribeUrl}">Unsubscribe</a>` : '');
		},

		vetoReceived: (d) => {
			const content = `
				<h2>Veto Filed Against Your Fact</h2>
				<p>Hi ${d.firstName},</p>
				<p>A veto has been filed against your fact:</p>
				<blockquote style="border-left: 4px solid #f59e0b; padding-left: 16px; color: #6b7280;">"${d.factTitle}"</blockquote>
				<p><strong>Reason:</strong> ${d.vetoReason}</p>
				<p style="text-align: center;">
					<a href="${d.factUrl}" class="button">View Veto</a>
				</p>
			`;
			return baseTemplate(content, d.unsubscribeUrl ? `<a href="${d.unsubscribeUrl}">Unsubscribe</a>` : '');
		},

		verificationResult: (d) => {
			const content = d.approved
				? `<h2>Verification Approved!</h2>
				   <p>Hi ${d.firstName},</p>
				   <p>Your ${d.verificationType} verification has been approved!</p>
				   <p>You now have access to additional features.</p>
				   <p style="text-align: center;">
					   <a href="${d.settingsUrl}" class="button">View Settings</a>
				   </p>`
				: `<h2>Verification Update</h2>
				   <p>Hi ${d.firstName},</p>
				   <p>Your ${d.verificationType} verification has been reviewed.</p>
				   <p>Please check your settings for more details.</p>
				   <p style="text-align: center;">
					   <a href="${d.settingsUrl}" class="button">View Settings</a>
				   </p>`;
			return baseTemplate(content, d.unsubscribeUrl ? `<a href="${d.unsubscribeUrl}">Unsubscribe</a>` : '');
		},

		orgComment: (d) => {
			const content = `
				<h2>Official Response from ${d.orgName}</h2>
				<p>Hi ${d.firstName},</p>
				<p><strong>${d.orgName}</strong> has posted an official response to the fact:</p>
				<blockquote style="border-left: 4px solid #10b981; padding-left: 16px; color: #6b7280;">"${d.factTitle}"</blockquote>
				<p style="text-align: center;">
					<a href="${d.factUrl}" class="button">View Response</a>
				</p>
			`;
			return baseTemplate(content, d.unsubscribeUrl ? `<a href="${d.unsubscribeUrl}">Unsubscribe</a>` : '');
		},

		debateRequest: (d) => {
			const content = `
				<h2>Debate Request</h2>
				<p>Hi ${d.firstName},</p>
				<p><strong>${d.initiatorName}</strong> wants to debate with you about:</p>
				<blockquote style="border-left: 4px solid #0ea5e9; padding-left: 16px; color: #6b7280;">"${d.factTitle}"</blockquote>
				<p style="text-align: center;">
					<a href="${d.debateUrl}" class="button">View Request</a>
				</p>
			`;
			return baseTemplate(content, d.unsubscribeUrl ? `<a href="${d.unsubscribeUrl}">Unsubscribe</a>` : '');
		},

		debatePublished: (d) => {
			const content = `
				<h2>Debate Published!</h2>
				<p>Hi ${d.firstName},</p>
				<p>Your debate has been published:</p>
				<blockquote style="border-left: 4px solid #10b981; padding-left: 16px; color: #6b7280;">"${d.debateTitle}"</blockquote>
				<p style="text-align: center;">
					<a href="${d.debateUrl}" class="button">View Debate</a>
				</p>
			`;
			return baseTemplate(content, d.unsubscribeUrl ? `<a href="${d.unsubscribeUrl}">Unsubscribe</a>` : '');
		},

		moderatorStatus: (d) => {
			const content = d.promoted
				? `<h2>Congratulations, Moderator!</h2>
				   <p>Hi ${d.firstName},</p>
				   <p>You have been elected as a moderator based on your contributions to the community.</p>
				   <p>You now have access to the moderation dashboard.</p>
				   <p style="text-align: center;">
					   <a href="${d.dashboardUrl}" class="button">View Dashboard</a>
				   </p>`
				: `<h2>Moderator Status Update</h2>
				   <p>Hi ${d.firstName},</p>
				   <p>Your moderator status has been updated.</p>
				   <p style="text-align: center;">
					   <a href="${d.dashboardUrl}" class="button">View Details</a>
				   </p>`;
			return baseTemplate(content, d.unsubscribeUrl ? `<a href="${d.unsubscribeUrl}">Unsubscribe</a>` : '');
		},

		factStatus: (d) => {
			const content = `
				<h2>Fact Status Update</h2>
				<p>Hi ${d.firstName},</p>
				<p>Your fact has been marked as <strong>${d.newStatus}</strong>:</p>
				<blockquote style="border-left: 4px solid ${d.newStatus === 'PROVEN' ? '#10b981' : d.newStatus === 'DISPROVEN' ? '#ef4444' : '#f59e0b'}; padding-left: 16px; color: #6b7280;">"${d.factTitle}"</blockquote>
				<p style="text-align: center;">
					<a href="${d.factUrl}" class="button">View Fact</a>
				</p>
			`;
			return baseTemplate(content, d.unsubscribeUrl ? `<a href="${d.unsubscribeUrl}">Unsubscribe</a>` : '');
		}
	};

	const templateFn = templates[templateName];
	if (!templateFn) {
		console.warn(`Unknown email template: ${templateName}`);
		return baseTemplate(`<p>${JSON.stringify(data)}</p>`);
	}

	return templateFn(data);
}
