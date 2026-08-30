import { Request, Response, NextFunction } from 'express';

const DRIVERHUB_API_KEY = process.env.DRIVERHUB_API_KEY;

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ 
      error: 'API_KEY_REQUIRED', 
      message: 'Authorization header with API key is required' 
    });
  }
  
  const [scheme, token] = authHeader.split(' ');
  
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return res.status(401).json({ 
      error: 'INVALID_AUTH_FORMAT', 
      message: 'Authorization header must be: Bearer <api_key>' 
    });
  }
  
  if (!DRIVERHUB_API_KEY) {
    console.error('[API Key Auth] DRIVERHUB_API_KEY not configured');
    return res.status(500).json({ 
      error: 'API_KEY_NOT_CONFIGURED', 
      message: 'API key authentication not configured on server' 
    });
  }
  
  if (token !== DRIVERHUB_API_KEY) {
    return res.status(403).json({ 
      error: 'INVALID_API_KEY', 
      message: 'Invalid API key' 
    });
  }
  
  next();
}

export function optionalApiKey(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return next();
  }
  
  const [scheme, token] = authHeader.split(' ');
  
  if (scheme?.toLowerCase() === 'bearer' && token && DRIVERHUB_API_KEY && token === DRIVERHUB_API_KEY) {
    (req as any).apiKeyAuthenticated = true;
  }
  
  next();
}
