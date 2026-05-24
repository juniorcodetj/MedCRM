import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export function requestCorrelationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const requestId = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();

  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Gateway-Service', 'medcrm-api-gateway');

  next();
}
