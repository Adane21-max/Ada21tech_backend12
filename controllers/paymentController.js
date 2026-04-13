const db = require('../config/db');

// 学生上传收据
exports.uploadReceipt = async (req, res) => {
  try {
    const student_id = req.user.id;
    const receipt_image = req.file?.filename;
    if (!receipt_image) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    await db.query(
      'INSERT INTO payments (student_id, receipt_image) VALUES (?, ?)',
      [student_id, receipt_image]
    );
    res.status(201).json({ message: 'Receipt uploaded' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// 管理员：获取所有支付记录（含学生姓名）
exports.getPayments = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.*, u.username 
       FROM payments p 
       JOIN users u ON p.student_id = u.id 
       ORDER BY p.created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// 管理员：更新支付状态（批准/拒绝）
exports.updatePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    // 更新支付状态
    await db.query(
      'UPDATE payments SET status = ?, reason = ? WHERE id = ?',
      [status, reason || null, id]
    );

    // 如果批准，同时将学生状态更新为 approved
    if (status === 'approved') {
      const [payment] = await db.query('SELECT student_id FROM payments WHERE id = ?', [id]);
      if (payment.length > 0) {
        await db.query("UPDATE users SET status = 'approved' WHERE id = ?", [payment[0].student_id]);
      }
    }

    res.json({ message: 'Payment updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};