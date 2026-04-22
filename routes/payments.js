const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/authMiddleware');
const { submitPayment, getPayments, updatePaymentStatus } = require('../controllers/paymentController');

// Student submits payment information (name + transaction reference)
router.post('/submit', authenticate, submitPayment);

// Admin gets all payment records
router.get('/', authenticate, isAdmin, getPayments);

// Admin updates payment status (approve/reject)
router.put('/:id', authenticate, isAdmin, updatePaymentStatus);

module.exports = router;
