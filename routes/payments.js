const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const { authenticate, isAdmin } = require('../middleware/authMiddleware');
const { uploadReceipt, getPayments, updatePaymentStatus } = require('../controllers/paymentController');

// 学生上传收据
router.post('/upload', authenticate, upload.single('receipt'), uploadReceipt);
// 管理员获取支付列表
router.get('/', authenticate, isAdmin, getPayments);
// 管理员更新支付状态
router.put('/:id', authenticate, isAdmin, updatePaymentStatus);

module.exports = router;