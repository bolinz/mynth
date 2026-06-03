type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  taskId?: string;
  agentId?: string;
  [key: string]: string | undefined;
}

export class Logger {
  private static levelOrder: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  private static currentLevel: LogLevel = 'info';

  static setLevel(level: LogLevel): void {
    Logger.currentLevel = level;
  }

  constructor(
    private name: string,
    private context?: LogContext,
  ) {}

  child(name: string): Logger {
    return new Logger(`${this.name}.${name}`, this.context);
  }

  withContext(ctx: LogContext): Logger {
    return new Logger(this.name, { ...this.context, ...ctx });
  }

  debug(msg: string, ctx?: LogContext): void {
    this.log('debug', msg, ctx);
  }

  info(msg: string, ctx?: LogContext): void {
    this.log('info', msg, ctx);
  }

  warn(msg: string, ctx?: LogContext): void {
    this.log('warn', msg, ctx);
  }

  error(msg: string, ctx?: LogContext, err?: Error): void {
    this.log('error', msg, ctx, err);
  }

  private log(level: LogLevel, msg: string, ctx?: LogContext, err?: Error): void {
    const logLevelOrder = Logger.levelOrder.indexOf(level);
    const currentLevelOrder = Logger.levelOrder.indexOf(Logger.currentLevel);
    if (logLevelOrder < currentLevelOrder) return;

    const timestamp = new Date().toISOString();
    const merged = { ...this.context, ...ctx };
    const contextStr = Object.keys(merged).length > 0 ? ` ${JSON.stringify(merged)}` : '';
    const errorStr = err ? ` ${err.stack ?? err.message}` : '';
    const line = `[${timestamp}] [${level.toUpperCase()}] [${this.name}] ${msg}${contextStr}${errorStr}`;

    switch (level) {
      case 'error':
        console.error(line);
        break;
      case 'warn':
        console.warn(line);
        break;
      default:
        console.log(line);
    }
  }
}
