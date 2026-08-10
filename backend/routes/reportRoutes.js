const express = require('express');
const router = express.Router();
const { getReportPreview, exportExcel } = require('../controllers/reportController');
const { authMiddleware, authorize } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/preview', authorize(['admin', 'manager', 'director']), getReportPreview);
router.get('/export', authorize(['admin', 'manager', 'director']), exportExcel);

module.exports = router;
