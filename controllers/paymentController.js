const db = require('../config/db');

// Student submits payment information (payer name + transaction reference)
exports.submitPayment = async (req, res) => {
  try {
    console.log('📥 Payment submit attempt');
    console.log('   Student ID from token:', req.user?.id);
    console.log('   Request body:', req.body);
    const student_id = req.user.id;
    const { payer_name, transaction_ref } = req.body;

    if (!payer_name || !transaction_ref) {
      return res.status(400).json({ message: 'Payer name and transaction reference are required' });
    }

    // Check if there's already a pending payment for this student
    const [existing] = await db.query(
      'SELECT id FROM payments WHERE student_id = ? AND status = ?',
      [student_id, 'pending']
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: 'You already have a pending payment request' });
    }

    // Insert the payment record
    await db.query(
      'INSERT INTO payments (student_id, payer_name, transaction_ref, status) VALUES (?, ?, ?, ?)',
      [student_id, payer_name, transaction_ref, 'pending']
    );

    res.status(201).json({ message: 'Payment information submitted. Awaiting admin approval.' });
  } catch (error) {
    console.error('Submit payment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin: Get all payments with student info
exports.getPayments = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.*, u.username, u.grade 
       FROM payments p 
       JOIN users u ON p.student_id = u.id 
       ORDER BY p.created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Admin: Approve or reject a payment
exports.updatePaymentStatus = async (req, res) => {
  const { id } = req.params;
  const { status, reason } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Update payment status
    await connection.query(
      'UPDATE payments SET status = ?, reason = ? WHERE id = ?',
      [status, reason || null, id]
    );

    // If approved, update student status to 'approved'
    if (status === 'approved') {
      const [payment] = await connection.query('SELECT student_id FROM payments WHERE id = ?', [id]);
      if (payment.length > 0) {
        await connection.query(
          "UPDATE users SET status = 'approved' WHERE id = ? AND role = 'student'",
          [payment[0].student_id]
        );
      }
    }

    await connection.commit();
    res.json({ message: `Payment ${status}` });
  } catch (error) {
    await connection.rollback();
    console.error('Update payment error:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
};
