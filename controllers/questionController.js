const db = require('../config/db');

// Helper: recalculate scores for all attempts of a given quiz type
async function recalcAttemptsForType(typeId) {
  console.log('📊 RECALC START for type_id:', typeId);
  const [attempts] = await db.query(
    'SELECT id, student_id, answers FROM quiz_attempts WHERE type_id = ?',
    [typeId]
  );
  console.log(`   Found ${attempts.length} attempts`);

  if (attempts.length === 0) return;

  const [questions] = await db.query(
    'SELECT id, correct_answer FROM questions WHERE type_id = ?',
    [typeId]
  );
  const totalQuestions = questions.length;
  console.log(`   Current questions: ${totalQuestions}`);

  if (totalQuestions === 0) {
    for (const attempt of attempts) {
      await db.query('UPDATE quiz_attempts SET score = 0, total_questions = 0 WHERE id = ?', [attempt.id]);
    }
    console.log('   No questions left – scores zeroed');
    return;
  }

  const correctMap = {};
  questions.forEach(q => { correctMap[q.id] = q.correct_answer; });

  for (const attempt of attempts) {
    let studentAnswers = {};
    if (attempt.answers) {
      try {
        studentAnswers = typeof attempt.answers === 'string'
          ? JSON.parse(attempt.answers)
          : attempt.answers;
      } catch (e) {
        console.error('   ❌ Failed to parse answers for attempt', attempt.id, e);
        continue;
      }
    }

    let correctCount = 0;
    for (const questionId of Object.keys(correctMap)) {
      if (studentAnswers[questionId] === correctMap[questionId]) {
        correctCount++;
      }
    }

    await db.query(
      'UPDATE quiz_attempts SET score = ?, total_questions = ? WHERE id = ?',
      [correctCount, totalQuestions, attempt.id]
    );
    console.log(`   ✅ Attempt ${attempt.id} updated: ${correctCount}/${totalQuestions}`);
  }
}

// ✅ Single create (with image support)
exports.createQuestion = async (req, res) => {
  try {
    const { grade, level, type_id, question, optionA, optionB, optionC, optionD, correct_answer, explanation } = req.body;
    const image = req.file ? req.file.filename : null;
    const [result] = await db.query(
      `INSERT INTO questions (grade, level, type_id, question, optionA, optionB, optionC, optionD, correct_answer, explanation, image)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [grade, level, type_id, question, optionA, optionB, optionC, optionD, correct_answer, explanation, image]
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

// ✅ Update question (with image support)
exports.updateQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const rawUpdates = req.body;

    const updates = {};
    const allowedFields = ['question', 'optionA', 'optionB', 'optionC', 'optionD', 'correct_answer', 'explanation'];

    allowedFields.forEach(field => {
      if (rawUpdates[field] !== undefined) {
        updates[field] = rawUpdates[field];
      }
    });

    if (req.file) {
      updates.image = req.file.filename;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(id);

    const [result] = await db.query(`UPDATE questions SET ${setClause} WHERE id = ?`, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Question not found' });
    }

    if (rawUpdates.correct_answer !== undefined) {
      const [rows] = await db.query('SELECT type_id FROM questions WHERE id = ?', [id]);
      if (rows.length > 0) {
        await recalcAttemptsForType(rows[0].type_id);
      }
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

    const [rows] = await db.query('SELECT type_id FROM questions WHERE id = ?', [id]);
    const typeId = rows.length > 0 ? rows[0].type_id : null;

    await db.query('DELETE FROM questions WHERE id = ?', [id]);

    if (typeId) {
      await recalcAttemptsForType(typeId);
    }

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
