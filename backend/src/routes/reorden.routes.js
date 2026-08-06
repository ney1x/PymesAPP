const reordenService = require('../services/reorden.service');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middlewares/validate.middleware');
const { query } = require('express-validator');
const { authenticate } = require('../middlewares/auth.middleware');
const { Router } = require('express');

const router = Router();
router.use(authenticate);

router.get(
  '/',
  validate([
    query('pymeId').optional().isInt(),
    query('diasForecast').optional().isInt({ min: 1, max: 120 }),
  ]),
  asyncHandler(async (req, res) => {
    const reorden = await reordenService.listar(req.user, req.query);
    res.json({ ok: true, reorden });
  })
);

module.exports = router;
