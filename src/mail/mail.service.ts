
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

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

    async sendTestEmail(email: string) {
        return this.transporter.sendMail({
        from: this.configService.get<string>('MAIL_USER'),
        to: email,
        subject: 'NestJS Email Test',
        text: 'Congratulations! Your NestJS email service is working.',
        });
    }

  
    async sendPasswordResetEmail(email: string, resetLink: string) {
        return this.transporter.sendMail({
            from: this.configService.get<string>('MAIL_USER'),
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
        return this.transporter.sendMail({
        from: this.configService.get<string>('MAIL_USER'),
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
