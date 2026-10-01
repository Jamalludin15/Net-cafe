import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { env } from './config/env.js';
import { pool } from './config/database.js';
import { createRoutes } from './routes/index.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export function createApp(databasePool = pool, sessionSecret = env.sessionSecret) {
  if (typeof sessionSecret !== 'string' || sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters.');
  }

  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(currentDirectory, 'views'));
  app.set('trust proxy', env.trustProxy);
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:']
      }
    }
  }));
  app.use(express.urlencoded({ extended: false, limit: '10kb' }));
  app.use(express.json({ limit: '10kb' }));
  app.use(session({
    name: 'netcafe.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.nodeEnv === 'production',
      maxAge: 60 * 60 * 1000
    }
  }));
  app.use(express.static(path.join(currentDirectory, 'public')));
  app.use(createRoutes(databasePool));

  app.use((error, _request, response, _next) => {
    if (error.type === 'entity.too.large') {
      return response.status(413).send('Request body too large.');
    }

    console.error('Request failed.');
    return response.status(500).send('Internal server error.');
  });

  return app;
}