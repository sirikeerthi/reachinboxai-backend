import app from "../../common/express.js";
import EmailService from "./service.js";
import { EmailDto } from "./dto/email.dto.js";
import { EmailScheduleStatus } from "../../entities/email.recipients.entity.js";
import { authenticate } from "../../common/auth.middleware.js";

const MAX_EMAILS_PER_HOUR = Number(process.env.MAX_EMAILS_PER_HOUR);

function validateEmailDto(body: Partial<EmailDto>): string | null {
  if (!Array.isArray(body.to) || body.to.length === 0) {
    return "'to' must be a non-empty array of recipient email addresses";
  }

  if (
    body.to.some((email) => typeof email !== "string" || email.trim() === "")
  ) {
    return "'to' must only contain valid, non-empty email addresses";
  }

  if (typeof body.subject !== "string" || body.subject.trim() === "") {
    return "'subject' is required and must be a non-empty string";
  }

  if (typeof body.body !== "string" || body.body.trim() === "") {
    return "'body' is required and must be a non-empty string";
  }

  if (
    !body.scheduled_at ||
    Number.isNaN(new Date(body.scheduled_at).getTime())
  ) {
    return "'scheduled_at' is required and must be a valid date";
  }

  if (
    typeof body.delayMs !== "number" ||
    !Number.isInteger(body.delayMs) ||
    body.delayMs < 0
  ) {
    return "'delayMs' must be a non-negative integer";
  }

  if (!Number.isInteger(MAX_EMAILS_PER_HOUR) || MAX_EMAILS_PER_HOUR < 1) {
    return "MAX_EMAILS_PER_HOUR is not configured correctly";
  }

  if (
    typeof body.hourlyLimit !== "number" ||
    !Number.isInteger(body.hourlyLimit) ||
    body.hourlyLimit < 1 ||
    body.hourlyLimit > MAX_EMAILS_PER_HOUR
  ) {
    return `'hourlyLimit' must be between 1 and ${MAX_EMAILS_PER_HOUR}`;
  }

  return null;
}

/**
 * @openapi
 * /api/emails/schedule:
 *   post:
 *     summary: Schedule an email to be sent
 *     tags:
 *       - Email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EmailDto'
 *     responses:
 *       201:
 *         description: Email schedule created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Email scheduled successfully
 *                 data:
 *                   type: object
 *       400:
 *         description: Invalid request body
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "'hourlyLimit' must be between 1 and 1000"
 *       500:
 *         description: Failed to schedule email
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Failed to schedule email
 */
app.post("/api/emails/schedule", authenticate, async (req, res) => {
  try {
    const body = req.body as Partial<EmailDto>;

    const validationError = validateEmailDto(body);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const data = await EmailService.schedule(body as EmailDto, req.id!);

    return res.status(201).json({
      success: true,
      message: "Email scheduled successfully",
      data,
    });
  } catch (error) {
    console.error("Error scheduling email:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to schedule email",
    });
  }
});

/**
 * @openapi
 * /api/emails/list:
 *   get:
 *     summary: List scheduled emails for the current user, filtered by status
 *     tags:
 *       - Email
 *     parameters:
 *       - in: query
 *         name: status
 *         required: true
 *         schema:
 *           type: string
 *           enum: [SCHEDULED, SENT, FAILED]
 *         description: Recipient status to filter by
 *     responses:
 *       200:
 *         description: Email list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Email list retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       to:
 *                         type: string
 *                         format: email
 *                       sentAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       scheduledAt:
 *                         type: string
 *                         format: date-time
 *                       status:
 *                         type: string
 *                         enum: [SCHEDULED, SENT, FAILED]
 *                       subject:
 *                         type: string
 *                       body:
 *                         type: string
 *       400:
 *         description: Missing or invalid 'status' query parameter
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "'status' must be one of SCHEDULED, SENT, FAILED"
 *       500:
 *         description: Failed to retrieve email list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Failed to retrieve email list
 */
app.get("/api/emails/list", authenticate, async (req, res) => {
  try {
    const status = req.query.status as EmailScheduleStatus;

    const validStatuses = Object.values(EmailScheduleStatus);

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `'status' must be one of ${validStatuses.join(", ")}`,
      });
    }

    const data = await EmailService.getList(req.id!, status);

    return res.status(200).json({
      success: true,
      message: "Email list retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Error retrieving email list:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve email list",
    });
  }
});

/**
 * @openapi
 * /api/emails/search:
 *   get:
 *     summary: Full-text search over the current user's scheduled/sent/failed emails (Elasticsearch)
 *     tags:
 *       - Email
 *     parameters:
 *       - in: query
 *         name: q
 *         required: false
 *         schema:
 *           type: string
 *         description: Free-text search across subject, body and recipient email
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [SCHEDULED, SENT, FAILED]
 *         description: Optionally filter by recipient status
 *     responses:
 *       200:
 *         description: Search results retrieved successfully
 *       400:
 *         description: Invalid 'status' query parameter
 *       500:
 *         description: Failed to search emails
 */
app.get("/api/emails/search", authenticate, async (req, res) => {
  try {
    const query = (req.query.q as string) || "";
    const status = req.query.status as EmailScheduleStatus | undefined;

    if (status && !Object.values(EmailScheduleStatus).includes(status)) {
      return res.status(400).json({
        success: false,
        message: `'status' must be one of ${Object.values(EmailScheduleStatus).join(", ")}`,
      });
    }

    const data = await EmailService.search(req.id!, query, status);

    return res.status(200).json({
      success: true,
      message: "Search results retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Error searching emails:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to search emails",
    });
  }
});

/**
 * @openapi
 * /api/emails/count:
 *   get:
 *     summary: Get sent/failed email counts for the current user
 *     tags:
 *       - Email
 *     responses:
 *       200:
 *         description: Email counts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Email counts retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       status:
 *                         type: string
 *                         enum: [SENT, FAILED]
 *                       count:
 *                         type: string
 *                         example: "3"
 *       500:
 *         description: Failed to retrieve email counts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Failed to retrieve email counts
 */
app.get("/api/emails/count", authenticate, async (req, res) => {
  try {
    const data = await EmailService.getCount(req.id!);

    return res.status(200).json({
      success: true,
      message: "Email counts retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Error retrieving email counts:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve email counts",
    });
  }
});
