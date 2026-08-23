require('dotenv').config();
const path = require('path');

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  sessionSecret: process.env.SESSION_SECRET || 'dev-nezabezpecene-zmen-ma',
  dbPath: process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(__dirname, '..', 'data', 'tbau.db'),
  trustProxy: process.env.TRUST_PROXY === '1',
  secureCookies: process.env.SECURE_COOKIES === '1',
};
