/**
 * Security utilities and configurations
 */

import { logger } from './logger';

// Content Security Policy configuration
export const getCSPHeader = (): string => {
  const isDev = import.meta.env.DEV;
  
  const directives = [
    `default-src 'self'`,
    `script-src 'self' ${isDev ? "'unsafe-inline' 'unsafe-eval'" : ''} https://www.googletagmanager.com https://www.google-analytics.com`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com`,
    `img-src 'self' data: https: blob:`,
    `connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in https://www.google-analytics.com`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `upgrade-insecure-requests`
  ];

  return directives.join('; ');
};

// Security headers configuration
export const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// Input sanitization
export const sanitizeInput = (input: string): string => {
  return input
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
};

// Email validation
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length < 255;
};

// Password strength validation
export const validatePassword = (password: string): { 
  valid: boolean; 
  errors: string[] 
} => {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

// Rate limiting helper
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private limits = new Map<string, RateLimitEntry>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests = 10, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  check(key: string): boolean {
    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry || now > entry.resetTime) {
      this.limits.set(key, {
        count: 1,
        resetTime: now + this.windowMs
      });
      return true;
    }

    if (entry.count >= this.maxRequests) {
      logger.warn('Rate limit exceeded', { key });
      return false;
    }

    entry.count++;
    return true;
  }

  reset(key: string): void {
    this.limits.delete(key);
  }
}

export const authRateLimiter = new RateLimiter(5, 60000); // 5 attempts per minute
export const apiRateLimiter = new RateLimiter(100, 60000); // 100 requests per minute

// XSS protection
export const escapeHtml = (unsafe: string): string => {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// CSRF token generation
export const generateCSRFToken = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

// Session validation
export const validateSession = (session: any): boolean => {
  if (!session || typeof session !== 'object') return false;
  if (!session.access_token || typeof session.access_token !== 'string') return false;
  if (!session.expires_at || typeof session.expires_at !== 'number') return false;
  
  // Check if session is expired
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at < now) {
    logger.warn('Session expired', { expires_at: session.expires_at, now });
    return false;
  }
  
  return true;
};
