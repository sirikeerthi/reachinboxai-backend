import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

class MailService {
  private transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendMail(
    from: string,
    to: string,
    subject: string,
    text: string,
  ): Promise<void> {
    await this.transporter.sendMail({
      from,
      to,
      subject,
      text,
    });
  }
}

export default new MailService();
