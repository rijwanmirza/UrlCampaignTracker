import session from 'express-session';
import { Pool } from '@neondatabase/serverless';
import connectPg from 'connect-pg-simple';

// Create PostgreSQL session store
const PgStore = connectPg(session);

// Configure session middleware with PostgreSQL store
export const configureSession = (pool: Pool) => {
  // Session lifetime: 7 days
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  
  return session({
    store: new PgStore({
      pool,
      tableName: 'sessions',
      createTableIfMissing: true,
    }),
    name: 'trafficstar.sid',
    secret: process.env.SESSION_SECRET || 'traffic-stars-secure-secret-key',
    resave: false,
    saveUninitialized: false, 
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: maxAge,
      sameSite: 'lax',
    }
  });
};