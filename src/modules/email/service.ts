import { EmailDto } from "./dto/email.dto.js";
import dataSource from "../../config/db.config.js";
import { EmailSchedules } from "../../entities/email.schedules.entity.js";
import { EmailRecipients } from "../../entities/email.recipients.entity.js";
import emailQueue from "../../config/queue.config.js";
import type { Queue } from "bullmq";
import { EmailScheduleStatus } from "../../entities/email.recipients.entity.js";
import { indexScheduledRecipients, searchEmails } from "../../common/email-search.js";

class EmailService {
  constructor(private emailQueue: Queue) {}

  async schedule(body: EmailDto, userId: number) {
    try {
      const scheduledAt = new Date(body.scheduled_at);

      if (isNaN(scheduledAt.getTime())) {
        throw new Error("Invalid scheduled_at");
      }

      const delay = scheduledAt.getTime() - Date.now();

      if (delay < 0) {
        throw new Error("scheduled_at must be in the future");
      }

      const { savedEmailSchedule, savedRecipients } =
        await dataSource.transaction(async (manager) => {
          const emailScheduleRepo = manager.getRepository(EmailSchedules);

          const emailRecipientRepo = manager.getRepository(EmailRecipients);

          const emailSchedule = emailScheduleRepo.create({
            user_id: userId,
            subject: body.subject,
            body: body.body,
            scheduled_at: scheduledAt,
            delayMs: body.delayMs,
            hourlyLimit: body.hourlyLimit,
          });

          const savedEmailSchedule =
            await emailScheduleRepo.save(emailSchedule);

          const emailRecipients = body.to.map((email) =>
            emailRecipientRepo.create({
              schedule_id: savedEmailSchedule.id,
              email,
            }),
          );

          const savedRecipients =
            await emailRecipientRepo.save(emailRecipients);

          return { savedEmailSchedule, savedRecipients };
        });

      indexScheduledRecipients(savedEmailSchedule, savedRecipients).catch(
        (error) => {
          console.error(
            "Failed to index scheduled emails in Elasticsearch:",
            error,
          );
        },
      );

      await this.emailQueue.add(
        "scheduleEmailJob",
        {
          emailScheduleId: savedEmailSchedule.id,
        },
        {
          delay,
          attempts: 5,
          backoff: {
            type: "exponential",
            delay: 5000,
          },
          removeOnComplete: true,
        },
      );

      return savedEmailSchedule;
    } catch (error) {
      console.error("Failed to schedule email:", error);

      throw new Error("Failed to schedule email");
    }
  }

  async getList(userId: number, ScheduleStatus: EmailScheduleStatus) {
    try {
      const scheduleRepo = dataSource.getRepository(EmailSchedules);
      const schedules = await scheduleRepo
        .createQueryBuilder("schedule")
        .leftJoinAndSelect(
          "schedule.recipients",
          "recipient",
          "recipient.status = :status",
          { status: ScheduleStatus },
        )
        .where("schedule.user_id = :userId", { userId })
        .getMany();

      return schedules.flatMap((schedule) =>
        schedule.recipients.map((recipient) => ({
          to: recipient.email,
          sentAt: recipient.sent_at,
          scheduledAt: schedule.scheduled_at,
          status: recipient.status,
          subject: schedule.subject,
          body: schedule.body,
        })),
      );
    } catch (error) {
      console.error("Failed to get email list:", error);

      throw new Error("Failed to get email list");
    }
  }

  async search(userId: number, query: string, status?: EmailScheduleStatus) {
    try {
      return await searchEmails(userId, query, status);
    } catch (error) {
      console.error("Failed to search emails:", error);

      throw new Error("Failed to search emails");
    }
  }

  async getCount(userId: number) {
    try {
      const recipientRepo = dataSource.getRepository(EmailRecipients);

      const result = await recipientRepo
        .createQueryBuilder("recipient")
        .innerJoin(
          EmailSchedules,
          "schedule",
          'schedule.id = recipient."schedule_id"',
        )
        .select("recipient.status", "status")
        .addSelect("COUNT(*)", "count")
        .where('schedule."user_id" = :userId', { userId })
        .andWhere("recipient.status IN (:...statuses)", {
          statuses: [EmailScheduleStatus.SENT, EmailScheduleStatus.FAILED],
        })
        .groupBy("recipient.status")
        .getRawMany();

      return result;
    } catch (error) {
      console.error("Failed to get email counts:", error);
      throw new Error("Failed to get email counts");
    }
  }
}

export default new EmailService(emailQueue);
