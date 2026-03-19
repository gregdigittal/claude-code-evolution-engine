/**
 * notifications.ts — Pipeline notifications via Slack webhook.
 */

import axios from 'axios';
import { createTaggedLogger } from './logger.js';

const log = createTaggedLogger('notifications');

export type NotificationLevel = 'info' | 'success' | 'warning' | 'error';

export type PipelineNotification = {
  readonly level: NotificationLevel;
  readonly title: string;
  readonly message: string;
  readonly runDate?: string;
  readonly link?: string;
};

const COLOUR_MAP: Record<NotificationLevel, string> = {
  info: '#22d3ee',
  success: '#34d399',
  warning: '#fbbf24',
  error: '#f87171',
};

/**
 * Send a notification to Slack. No-ops if webhook URL is not configured.
 */
export async function sendNotification(
  webhookUrl: string | undefined,
  notification: PipelineNotification
): Promise<void> {
  if (!webhookUrl) {
    log.debug(`notification skipped (no webhook configured): ${notification.title}`);
    return;
  }

  const payload = {
    attachments: [
      {
        color: COLOUR_MAP[notification.level],
        title: `[CCEE] ${notification.title}`,
        text: notification.message,
        footer: notification.runDate
          ? `Run: ${notification.runDate}`
          : 'CCEE Pipeline',
        ...(notification.link
          ? { title_link: notification.link }
          : {}),
      },
    ],
  };

  try {
    await axios.post(webhookUrl, payload, { timeout: 10_000 });
    log.info(`notification sent: ${notification.title}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(`notification failed: ${message}`);
  }
}
