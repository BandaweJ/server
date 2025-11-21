import { Logger } from '@nestjs/common';

export type LogLevel = 'log' | 'warn' | 'error';

export function logStructured(
  logger: Logger,
  level: LogLevel,
  action: string,
  message: string,
  metadata: Record<string, any> = {},
): void {
  const payload = {
    action,
    ...metadata,
    timestamp: new Date().toISOString(),
  };
  const formattedMessage = `${message} | ${JSON.stringify(payload)}`;

  switch (level) {
    case 'warn':
      logger.warn(formattedMessage);
      break;
    case 'error':
      logger.error(formattedMessage);
      break;
    default:
      logger.log(formattedMessage);
      break;
  }
}

