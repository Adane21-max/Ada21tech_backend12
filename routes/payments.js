const express = require('express');
const router = express.Router();
const { authenticate, isAdmin } = require('../middleware/authMiddleware');
const { submitPayment, getPayments, updatePaymentStatus } = require('../controllers/paymentController');

// Student submits payment info (name + transaction reference)
router.post('/submit', authenticate, submitPayment);

// Admin gets all payments
router.get('/', authenticate, isAdmin, getPayments);

// Admin approves or rejects a payment
router.put('/:id', authenticate, isAdmin, updatePaymentStatus);

module.exports = router;
