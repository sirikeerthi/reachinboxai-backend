import elasticsearchClient, {
  EMAILS_INDEX,
} from "../config/elasticsearch.config.js";
import { EmailSchedules } from "../entities/email.schedules.entity.js";
import {
  EmailRecipients,
  EmailScheduleStatus,
} from "../entities/email.recipients.entity.js";

export async function indexScheduledRecipients(
  schedule: EmailSchedules,
  recipients: EmailRecipients[],
): Promise<void> {
  if (recipients.length === 0) {
    return;
  }

  const operations = recipients.flatMap((recipient) => [
    { index: { _index: EMAILS_INDEX, _id: String(recipient.id) } },
    {
      recipientId: recipient.id,
      scheduleId: schedule.id,
      userId: schedule.user_id,
      to: recipient.email,
      subject: schedule.subject,
      body: schedule.body,
      status: recipient.status,
      scheduledAt: schedule.scheduled_at,
      sentAt: recipient.sent_at,
      createdAt: recipient.created_at,
    },
  ]);

  await elasticsearchClient.bulk({ operations, refresh: true });
}

export async function updateRecipientStatus(
  recipientId: number,
  status: EmailScheduleStatus,
  sentAt: Date | null,
): Promise<void> {
  await elasticsearchClient.update({
    index: EMAILS_INDEX,
    id: String(recipientId),
    doc: { status, sentAt },
  });
}

export async function searchEmails(
  userId: number,
  query: string,
  status?: EmailScheduleStatus,
) {
  const filter: object[] = [{ term: { userId } }];

  if (status) {
    filter.push({ term: { status } });
  }

  const must = query
    ? [
        {
          multi_match: {
            query,
            type: "phrase_prefix" as const,
            fields: ["subject", "body", "to.text"],
          },
        },
      ]
    : [{ match_all: {} }];

  const result = await elasticsearchClient.search<{
    recipientId: number;
    scheduleId: number;
    userId: number;
    to: string;
    subject: string;
    body: string;
    status: EmailScheduleStatus;
    scheduledAt: string;
    sentAt: string | null;
    createdAt: string;
  }>({
    index: EMAILS_INDEX,
    query: { bool: { must, filter } },
    sort: [{ createdAt: { order: "desc" } }],
    size: 50,
  });

  return result.hits.hits.map((hit) => hit._source);
}
