/**
 * @openapi
 * components:
 *   schemas:
 *     EmailDto:
 *       type: object
 *       required:
 *         - to
 *         - subject
 *         - body
 *         - scheduled_at
 *         - delayMs
 *         - hourlyLimit
 *       properties:
 *         to:
 *           type: array
 *           items:
 *             type: string
 *             format: email
 *           description: List of recipient email addresses
 *         subject:
 *           type: string
 *           description: Email subject line
 *         body:
 *           type: string
 *           description: Email body content
 *         scheduled_at:
 *           type: string
 *           format: date-time
 *           description: Date and time the email is scheduled to be sent
 *         delayMs:
 *           type: integer
 *           minimum: 0
 *           description: Delay in milliseconds between email sends
 *           example: 1000
 *         hourlyLimit:
 *           type: integer
 *           minimum: 1
 *           description: Maximum number of emails allowed to be sent per hour
 *           example: 100
 */
export class EmailDto {
  to!: string[];
  subject!: string;
  body!: string;
  scheduled_at!: Date;
  delayMs!: number;
  hourlyLimit!: number;
}
