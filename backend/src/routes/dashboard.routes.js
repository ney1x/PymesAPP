const dashboardService = require('../services/dashboard.service');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middlewares/validate.middleware');
const { query } = require('express-validator');
const { authenticate } = require('../middlewares/auth.middleware');
const { Router } = require('express');

const router = Router();
router.use(authenticate);

router.get(
  '/',
  validate([query('pymeId').optional().isInt()]),
  asyncHandler(async (req, res) => {
    const data = await dashboardService.get(req.user, req.query);
    res.json({ ok: true, data });
  })
);

module.exports = router;
