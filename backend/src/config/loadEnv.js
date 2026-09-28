import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Always load backend/.env regardless of the process working directory (PM2, npm workspaces).
dotenv.config({
  path: fileURLToPath(new URL('../../.env', import.meta.url)),
  quiet: true,
});
