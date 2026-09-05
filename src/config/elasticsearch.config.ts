import { Client } from "@elastic/elasticsearch";

export const EMAILS_INDEX = "emails";

const elasticsearchClient = new Client({
  node: process.env.ELASTICSEARCH_NODE || "http://localhost:9200",
  ...(process.env.ELASTICSEARCH_API_KEY
    ? { auth: { apiKey: process.env.ELASTICSEARCH_API_KEY } }
    : {}),
});

export async function ensureEmailsIndex(): Promise<void> {
  const exists = await elasticsearchClient.indices.exists({
    index: EMAILS_INDEX,
  });

  if (exists) {
    return;
  }

  await elasticsearchClient.indices.create({
    index: EMAILS_INDEX,
    mappings: {
      properties: {
        recipientId: { type: "integer" },
        scheduleId: { type: "integer" },
        userId: { type: "integer" },
        to: {
          type: "keyword",
          fields: { text: { type: "text" } },
        },
        subject: { type: "text" },
        body: { type: "text" },
        status: { type: "keyword" },
        scheduledAt: { type: "date" },
        sentAt: { type: "date" },
        createdAt: { type: "date" },
      },
    },
  });
}

export default elasticsearchClient;
