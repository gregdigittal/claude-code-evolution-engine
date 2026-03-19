/**
 * logger.ts — Structured logger for CCEE pipeline.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

let logFilePath: string | null = null;

export function setLogFile(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  logFilePath = path;
}

function formatMessage(level: LogLevel, tag: string, message: string): string {
  const ts = new Date().toISOString();
  return `[${ts}] [${level.toUpperCase()}] [${tag}] ${message}`;
}

function write(level: LogLevel, tag: string, message: string): void {
  const line = formatMessage(level, tag, message);
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
  if (logFilePath) {
    try {
      appendFileSync(logFilePath, line + '\n', 'utf-8');
    } catch {
      // Best-effort log file write — never crash on logging failure
    }
  }
}

export const logger = {
  info: (tag: string, message: string) => write('info', tag, message),
  warn: (tag: string, message: string) => write('warn', tag, message),
  error: (tag: string, message: string) => write('error', tag, message),
  debug: (tag: string, message: string) => {
    if (process.env.DEBUG === '1') write('debug', tag, message);
  },
};

export function createTaggedLogger(tag: string) {
  return {
    info: (msg: string) => logger.info(tag, msg),
    warn: (msg: string) => logger.warn(tag, msg),
    error: (msg: string) => logger.error(tag, msg),
    debug: (msg: string) => logger.debug(tag, msg),
  };
}
