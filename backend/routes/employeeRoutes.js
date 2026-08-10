const express = require('express');
const router = express.Router();
const { getEmployees, createEmployee, updateEmployee, deleteEmployee, getDepartments, createDepartment } = require('../controllers/employeeController');
const { authMiddleware, authorize } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', authorize(['admin', 'manager', 'director']), getEmployees);
router.post('/', authorize('admin'), createEmployee);
router.put('/:id', authorize('admin'), updateEmployee);
router.delete('/:id', authorize('admin'), deleteEmployee);

router.get('/departments', getDepartments);
router.post('/departments', authorize('admin'), createDepartment);

module.exports = router;
