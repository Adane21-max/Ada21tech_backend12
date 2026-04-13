const db = require('../config/db');

exports.createFreeTrialQuestion = async (req, res) => {
  try {
    const { grade, subject, question, optionA, optionB, optionC, optionD, correct_answer, explanation, time_limit } = req.body;
    const [result] = await db.query(
      `INSERT INTO free_trial_questions 
       (grade, subject, question, optionA, optionB, optionC, optionD, correct_answer, explanation, time_limit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [grade, subject, question, optionA, optionB, optionC, optionD, correct_answer, explanation, time_limit || null]
    );
    res.status(201).json({ message: 'Free trial question added', id: result.insertId });
  } catch (error) {
    console.error('CREATE FREE TRIAL ERROR:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

exports.getFreeTrialQuestions = async (req, res) => {
  try {
    const { grade, subject } = req.query;
    let query = 'SELECT * FROM free_trial_questions WHERE 1=1';
    const params = [];
    if (grade) {
      query += ' AND grade = ?';
      params.push(grade);
    }
    if (subject) {
      query += ' AND subject = ?';
      params.push(subject);
    }
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('GET FREE TRIAL ERROR:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

exports.updateFreeTrialQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    // Remove fields that shouldn't be updated
    delete updates.id;
    delete updates.created_at;

    // Convert empty time_limit to null
    if (updates.time_limit === '' || updates.time_limit === undefined) {
      updates.time_limit = null;
    } else if (typeof updates.time_limit === 'string') {
      updates.time_limit = parseInt(updates.time_limit);
    }

    const [result] = await db.query('UPDATE free_trial_questions SET ? WHERE id = ?', [updates, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Question not found' });
    }

    res.json({ message: 'Free trial question updated' });
  } catch (error) {
    console.error('UPDATE FREE TRIAL ERROR:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

exports.deleteFreeTrialQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await db.query('DELETE FROM free_trial_questions WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Question not found' });
    }
    res.json({ message: 'Free trial question deleted' });
  } catch (error) {
    console.error('DELETE FREE TRIAL ERROR:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};