/**
 * Centralized logging utility with environment-aware output
 * Prevents sensitive data leaks in production
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: any;
}

class Logger {
  private isDevelopment = import.meta.env.DEV;
  private isDebugEnabled = import.meta.env.VITE_DEBUG === 'true';

  private sanitize(data: any): any {
    if (typeof data !== 'object' || data === null) return data;
    
    const sensitive = ['password', 'token', 'key', 'secret', 'authorization', 'cookie'];
    const sanitized = { ...data };
    
    Object.keys(sanitized).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (sensitive.some(s => lowerKey.includes(s))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object') {
        sanitized[key] = this.sanitize(sanitized[key]);
      }
    });
    
    return sanitized;
  }

  private log(level: LogLevel, message: string, context?: LogContext) {
    // In production, only log warnings and errors
    if (!this.isDevelopment && level === 'debug') return;
    if (!this.isDebugEnabled && level === 'debug') return;

    const sanitizedContext = context ? this.sanitize(context) : undefined;
    const timestamp = new Date().toISOString();
    
    const logData = {
      timestamp,
      level,
      message,
      ...(sanitizedContext && { context: sanitizedContext })
    };

    switch (level) {
      case 'debug':
        if (this.isDevelopment) console.debug(`[DEBUG] ${message}`, sanitizedContext || '');
        break;
      case 'info':
        if (this.isDevelopment) console.info(`[INFO] ${message}`, sanitizedContext || '');
        break;
      case 'warn':
        console.warn(`[WARN] ${message}`, sanitizedContext || '');
        break;
      case 'error':
        console.error(`[ERROR] ${message}`, sanitizedContext || '');
        // TODO: Send to error tracking service (Sentry)
        break;
    }
  }

  debug(message: string, context?: LogContext) {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext) {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext) {
    this.log('warn', message, context);
  }

  error(message: string, error?: Error | unknown, context?: LogContext) {
    const errorContext = {
      ...context,
      ...(error instanceof Error && {
        errorMessage: error.message,
        errorStack: this.isDevelopment ? error.stack : undefined
      })
    };
    this.log('error', message, errorContext);
  }
}

export const logger = new Logger();
