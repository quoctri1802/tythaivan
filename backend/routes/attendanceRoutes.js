const express = require('express');
const router = express.Router();
const { 
  getAttendance, 
  saveAttendanceBulk, 
  getAuditLogs, 
  getApprovals, 
  approveMonth, 
  getAttendanceTypes, 
  getHolidays 
} = require('../controllers/attendanceController');
const { authMiddleware, authorize } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', getAttendance);
router.post('/bulk', saveAttendanceBulk);
router.get('/audit-log', authorize(['admin', 'manager', 'director']), getAuditLogs);
router.get('/approvals', getApprovals);
router.post('/approve', approveMonth);
router.get('/types', getAttendanceTypes);
router.get('/holidays', getHolidays);

module.exports = router;
