import { Worker, type Job } from "bullmq";
import emailQueue from "../../config/queue.config.js";
import dataSource from "../../config/db.config.js";
import mailService from "../../common/mail.js";
import { EmailSchedules } from "../../entities/email.schedules.entity.js";
import {
  EmailRecipients,
  EmailScheduleStatus,
} from "../../entities/email.recipients.entity.js";
import redisClient from "../../config/redis.config.js";
import { notifySlack } from "../../common/slack.js";
import { updateRecipientStatus } from "../../common/email-search.js";

const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY) || 1;

const emailWorker = new Worker(
  "email",
  async (job: Job) => {
    const emailScheduleId = job.data.emailScheduleId;

    const scheduleRepo = dataSource.getRepository(EmailSchedules);
    const recipientRepo = dataSource.getRepository(EmailRecipients);

    const schedule = await scheduleRepo
      .createQueryBuilder("schedule")
      .leftJoinAndSelect(
        "schedule.recipients",
        "recipient",
        "recipient.status = :status",
        { status: EmailScheduleStatus.SCHEDULED },
      )
      .leftJoinAndSelect("schedule.user", "user")
      .where("schedule.id = :id", { id: emailScheduleId })
      .getOne();

    if (!schedule) {
      throw new Error(`Email schedule ${emailScheduleId} not found`);
    }

    if (!schedule.user) {
      throw new Error(
        `User ${schedule.user_id} not found for schedule ${emailScheduleId}`,
      );
    }

    const fromEmail = schedule.user.email;
    const hourlyLimit = schedule.hourlyLimit;
    const delayMs = schedule.delayMs;

    const HOUR_MS = 60 * 60 * 1000;

    for (const recipient of schedule.recipients) {
      if (hourlyLimit) {
        const hourBucket = Math.floor(Date.now() / HOUR_MS);
        const redisKey = `email:hourlyCount:${emailScheduleId}:${hourBucket}`;
        const sentThisHour = Number((await redisClient.get(redisKey)) ?? 0);

        if (sentThisHour >= hourlyLimit) {
          await notifySlack(
            schedule.user_id,
            ` Hourly send limit reached for schedule #${schedule.id} ("${schedule.subject}"). ` +
              `Sent ${sentThisHour}/${hourlyLimit} emails this hour — remaining recipients will resume automatically next hour.`,
          );

          const nextHourStart = (hourBucket + 1) * HOUR_MS;
          const delayToNextHour = nextHourStart - Date.now();

          await emailQueue.add(
            "scheduleEmailJob",
            { emailScheduleId },
            {
              delay: delayToNextHour,
              attempts: 5,
              backoff: { type: "exponential", delay: 5000 },
              removeOnComplete: true,
            },
          );
          break;
        }
      }

      try {
        await mailService.sendMail(
          fromEmail,
          recipient.email,
          schedule.subject,
          schedule.body,
        );

        const sentAt = new Date();

        await recipientRepo.update(recipient.id, {
          status: EmailScheduleStatus.SENT,
          sent_at: sentAt,
        });

        updateRecipientStatus(
          recipient.id,
          EmailScheduleStatus.SENT,
          sentAt,
        ).catch((error) => {
          console.error(
            `Failed to update Elasticsearch for recipient ${recipient.id}:`,
            error,
          );
        });

        if (hourlyLimit) {
          const hourBucket = Math.floor(Date.now() / HOUR_MS);
          const nextHourStart = (hourBucket + 1) * HOUR_MS;
          const redisKey = `email:hourlyCount:${emailScheduleId}:${hourBucket}`;

          await redisClient
            .multi()
            .incr(redisKey)
            .pexpireat(redisKey, nextHourStart)
            .exec();
        }
      } catch (error) {
        console.error(`Failed to send email to ${recipient.email}:`, error);

        await recipientRepo.update(recipient.id, {
          status: EmailScheduleStatus.FAILED,
          error_message: (error as Error).message,
        });

        updateRecipientStatus(
          recipient.id,
          EmailScheduleStatus.FAILED,
          null,
        ).catch((esError) => {
          console.error(
            `Failed to update Elasticsearch for recipient ${recipient.id}:`,
            esError,
          );
        });
      }

      if (delayMs) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  },
  {
    connection: redisClient,
    concurrency: WORKER_CONCURRENCY,
  },
);

emailWorker.on("failed", (job, error) => {
  console.error(`Job ${job?.id} failed:`, error);
});
