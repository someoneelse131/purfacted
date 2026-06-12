export interface EmailMessage {
	to: string;
	subject: string;
	html: string;
	text: string;
}

export interface QueuedEmail extends EmailMessage {
	attempts: number;
	enqueuedAt: number;
}

export type SendEmailFn = (mail: EmailMessage) => Promise<void>;
