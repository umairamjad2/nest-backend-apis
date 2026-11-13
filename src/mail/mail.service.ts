
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);

    constructor(private configService: ConfigService) {
        this.transporter = nodemailer.createTransport({
        host: this.configService.get<string>('MAIL_HOST'),
        port: Number(this.configService.get<string>('MAIL_PORT')),
        secure: false,
        auth: {
            user: this.configService.get<string>('MAIL_USER'),
            pass: this.configService.get<string>('MAIL_PASSWORD'),
        },
        });
    }

    // Sends one email and logs the SMTP server's answer, so delivery problems show up in the terminal
    private async send(options: { to: string; subject: string; text?: string; html?: string }) {
        try {
            const info = await this.transporter.sendMail({
                from: this.configService.get<string>('MAIL_USER'),
                ...options,
            });
            this.logger.log(`"${options.subject}" sent to ${options.to}: ${info.response}`);
            return info;
        } catch (error) {
            this.logger.error(
                `"${options.subject}" to ${options.to} failed: ${error instanceof Error ? error.message : error}`,
            );
            throw error;
        }
    }

    async sendTestEmail(email: string) {
        return this.send({
        to: email,
        subject: 'NestJS Email Test',
        text: 'Congratulations! Your NestJS email service is working.',
        });
    }


    async sendPasswordResetEmail(email: string, resetLink: string) {
        return this.send({
            to: email,
            subject: 'Reset Your Password',
            html: `
            <h2>Password Reset Request</h2>
            <p>We received a request to reset your password.</p>
            <p>Click the link below to reset it:</p>
            <a href="${resetLink}">Reset Password</a>
            <p>This link expires in 15 minutes.</p>
            <p>If you did not request this, please ignore this email.</p>
            `,
            });
    }

    async sendVerificationEmail(email: string, verificationLink: string) {
        return this.send({
        to: email,
        subject: 'Verify Your Email Address',
        html: `
            <h2>Email Verification</h2>
            <p>Thank you for registering!</p>
            <p>Please click the link below to verify your email address:</p>
            <a href="${verificationLink}">Verify Email</a>
            <p>This link expires in 24 hours.</p>
            <p>If you did not create this account, please ignore this email.</p>
            `,
        });
    }

}
