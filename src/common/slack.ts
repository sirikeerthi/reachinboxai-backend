import dataSource from "../config/db.config.js";
import { SlackConnections } from "../entities/slack.connections.entity.js";

interface SlackApiResponse {
  ok: boolean;
  error?: string;
  channel?: { id: string };
}

export async function notifySlack(userId: number, text: string): Promise<void> {
  const slackRepo = dataSource.getRepository(SlackConnections);

  const connection = await slackRepo.findOne({ where: { user_id: userId } });

  if (!connection) {
    return;
  }

  try {
    const openRes = await fetch("https://slack.com/api/conversations.open", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${connection.access_token}`,
      },
      body: JSON.stringify({ users: connection.slack_user_id }),
    });

    const openData = (await openRes.json()) as SlackApiResponse;

    if (!openData.ok || !openData.channel) {
      throw new Error(openData.error || "Failed to open Slack conversation");
    }

    const messageRes = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${connection.access_token}`,
      },
      body: JSON.stringify({ channel: openData.channel.id, text }),
    });

    const messageData = (await messageRes.json()) as SlackApiResponse;

    if (!messageData.ok) {
      throw new Error(messageData.error || "Failed to send Slack message");
    }
  } catch (error) {
    console.error(`Failed to notify Slack for user ${userId}:`, error);
  }
}
