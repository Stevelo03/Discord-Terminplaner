// src/logger.ts
type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const levels: Record<Level, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const currentLevel: Level = (process.env.LOG_LEVEL as Level) || 'INFO';

function log(level: Level, msg: string, ...args: any[]): void {
  if (levels[level] < levels[currentLevel]) return;
  const ts = new Date().toISOString();
  const fn = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
  fn(`[${ts}] [${level}] ${msg}`, ...args);
}

export const logger = {
  debug: (msg: string, ...args: any[]) => log('DEBUG', msg, ...args),
  info:  (msg: string, ...args: any[]) => log('INFO',  msg, ...args),
  warn:  (msg: string, ...args: any[]) => log('WARN',  msg, ...args),
  error: (msg: string, ...args: any[]) => log('ERROR', msg, ...args),
};
