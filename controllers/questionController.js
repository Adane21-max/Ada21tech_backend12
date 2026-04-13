const db = require('../config/db');

// Single create
exports.createQuestion = async (req, res) => {
  try {
    const { grade, level, type_id, question, optionA, optionB, optionC, optionD, correct_answer, explanation } = req.body;
    const [result] = await db.query(
      `INSERT INTO questions (grade, level, type_id, question, optionA, optionB, optionC, optionD, correct_answer, explanation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [grade, level, type_id, question, optionA, optionB, optionC, optionD, correct_answer, explanation]
    );
    res.status(201).json({ message: 'Question added', id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get questions (filter by type_id)
exports.getQuestions = async (req, res) => {
  try {
    const { type_id } = req.query;
    let query = 'SELECT * FROM questions WHERE 1=1';
    const params = [];
    if (type_id) {
      query += ' AND type_id = ?';
      params.push(type_id);
    }
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update question – sanitized to avoid touching read-only fields
exports.updateQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const rawUpdates = req.body;

    // Create a clean object with only allowed fields
    const updates = {};
    const allowedFields = ['question', 'optionA', 'optionB', 'optionC', 'optionD', 'correct_answer', 'explanation'];

    allowedFields.forEach(field => {
      if (rawUpdates[field] !== undefined) {
        updates[field] = rawUpdates[field];
      }
    });

    const [result] = await db.query('UPDATE questions SET ? WHERE id = ?', [updates, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Question not found' });
    }

    res.json({ message: 'Question updated' });
  } catch (error) {
    console.error('UPDATE QUESTION ERROR:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
};

// Delete question
exports.deleteQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM questions WHERE id = ?', [id]);
    res.json({ message: 'Question deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Bulk create – transaction based, inserts all questions
exports.bulkCreateQuestions = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { questions } = req.body;

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ message: 'Questions must be a non-empty array' });
    }

    console.log(`BULK INSERT: Received ${questions.length} questions`);

    await connection.beginTransaction();

    let insertedCount = 0;
    for (const q of questions) {
      const { grade, level, type_id, question, optionA, optionB, optionC, optionD, correct_answer, explanation } = q;

      if (!grade || !type_id || !question || !optionA || !optionB || !optionC || !optionD || !correct_answer) {
        throw new Error(`Missing required fields in one of the questions`);
      }

      await connection.query(
        `INSERT INTO questions (grade, level, type_id, question, optionA, optionB, optionC, optionD, correct_answer, explanation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [grade, level || null, type_id, question, optionA, optionB, optionC, optionD, correct_answer, explanation || null]
      );
      insertedCount++;
    }

    await connection.commit();
    console.log(`BULK INSERT: Successfully inserted ${insertedCount} questions`);
    res.status(201).json({ message: `${insertedCount} questions added` });
  } catch (error) {
    await connection.rollback();
    console.error('BULK INSERT ERROR:', error.message);
    res.status(500).json({ message: error.message || 'Server error' });
  } finally {
    connection.release();
  }
};