// Announcement Controller 
const db = require('../config/db');

exports.createAnnouncement = async (req, res) => {
  try {
    const { title, content, expires_at } = req.body;
    const [result] = await db.query(
      'INSERT INTO announcements (title, content, expires_at) VALUES (?, ?, ?)',
      [title, content, expires_at || null]
    );
    res.status(201).json({ message: 'Announcement created', id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getAnnouncements = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM announcements WHERE expires_at IS NULL OR expires_at > NOW() ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    await db.query('UPDATE announcements SET ? WHERE id = ?', [updates, id]);
    res.json({ message: 'Announcement updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM announcements WHERE id = ?', [id]);
    res.json({ message: 'Announcement deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};