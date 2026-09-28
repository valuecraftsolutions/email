import { Router } from 'express';

export function createHealthRoutes({ healthController }) {
  const router = Router();
  router.get('/', healthController.live);
  router.get('/ready', healthController.ready);
  return router;
}
