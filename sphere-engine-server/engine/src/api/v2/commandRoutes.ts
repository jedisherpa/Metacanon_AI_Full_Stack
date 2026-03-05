import { Router } from 'express';
import { error } from '../../lib/http.js';
import { getCommand } from '../../db/queries.js';
import { requireAdminSession } from '../../admin/middleware.js';

export function createCommandRoutes() {
  const router = Router();

  router.get('/api/v2/admin/commands/:commandId', requireAdminSession, async (req, res) => {
    const command = await getCommand(req.params.commandId);
    if (!command) {
      return error(res, 404, 'Command not found');
    }

    res.json({ command });
  });

  return router;
}
