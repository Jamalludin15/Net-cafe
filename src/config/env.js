const port = Number.parseInt(process.env.PORT ?? '3000', 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const trustProxyValue = (process.env.TRUST_PROXY ?? 'false').toLowerCase();

if (!['true', 'false'].includes(trustProxyValue)) {
  throw new Error('TRUST_PROXY must be true or false.');
}

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port,
  databaseUrl: process.env.DATABASE_URL,
  sessionSecret: process.env.SESSION_SECRET,
  trustProxy: trustProxyValue === 'true'
});