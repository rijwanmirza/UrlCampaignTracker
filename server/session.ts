import session from 'express-session';
import { Pool } from '@neondatabase/serverless';
import connectPg from 'connect-pg-simple';

export const configureSession = (pool: Pool) => {
  const PgStore = connectPg(session);
  
  // Session TTL (1 week)
  const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
  
  // Use a strong session secret
  // In a production app, this would come from environment variables
  const SESSION_SECRET = process.env.SESSION_SECRET || 'f3dc8fa6d04b80ae7ef4b5c88d5f1f68';
  
  return session({
    store: new PgStore({
      pool,
      tableName: 'sessions',
      createTableIfMissing: true,
      ttl: SESSION_TTL,
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
      httpOnly: true,
      maxAge: SESSION_TTL,
    },
  });
};