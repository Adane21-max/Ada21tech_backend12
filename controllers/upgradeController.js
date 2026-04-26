const db = require('../config/db');
const TH = 70;

exports.requestUpgrade = async (req, res) => {
  try {
    const sid = req.user.id;
    const grd = req.user.grade;
    const [[u]] = await db.query('SELECT current_level FROM users WHERE id = ?', [sid]);
    if (!u) return res.status(400).json({msg:'User not found'});
    const lvl = u.current_level;
    const [q] = await db.query('SELECT id FROM question_types WHERE grade=? AND level=? AND is_visible=1',[grd,lvl]);
    if (!q.length) return res.status(400).json({msg:'No quizzes'});
    const ids = q.map(r=>r.id);
    const [a] = await db.query('SELECT type_id,score,total_questions FROM quiz_attempts WHERE student_id=? AND type_id IN (?)',[sid,ids]);
    if (a.length !== ids.length) return res.status(400).json({msg:'Complete all quizzes first'});
    let sum=0;
    a.forEach(r=> sum += (r.score/r.total_questions)*100);
    const avg = sum/a.length;
    if (avg < TH) return res.status(400).json({msg:`Avg ${avg.toFixed(1)}%, need ${TH}%`});
    const [ex] = await db.query("SELECT id FROM upgrade_requests WHERE student_id=? AND subject_id IS NULL AND status='pending'",[sid]);
    if (ex.length) return res.status(400).json({msg:'Pending already exists'});
    await db.query('INSERT INTO upgrade_requests (student_id,subject_id,from_level,to_level,average_score) VALUES (?,NULL,?,?,?)',[sid,lvl,lvl+1,avg]);
    res.json({msg:`Request to Level ${lvl+1} submitted`});
  } catch(e){ console.error(e); res.status(500).json({msg:'Server error'}); }
};

exports.getUpgradeRequests = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT ur.*, u.username, COALESCE(s.name,'All') subj FROM upgrade_requests ur JOIN users u ON ur.student_id=u.id LEFT JOIN subjects s ON ur.subject_id=s.id ORDER BY ur.created_at DESC");
    res.json(rows);
  } catch(e){ console.error(e); res.status(500).json({msg:'Server error'}); }
};

exports.approveUpgrade = async (req, res) => {
  try {
    const {id} = req.params;
    const [[r]] = await db.query('SELECT * FROM upgrade_requests WHERE id=?',[id]);
    if (!r) return res.status(404).json({msg:'Not found'});
    await db.query('UPDATE users SET current_level=? WHERE id=?',[r.to_level, r.student_id]);
    await db.query('UPDATE student_subject_level SET level=? WHERE student_id=?',[r.to_level, r.student_id]);
    await db.query("UPDATE upgrade_requests SET status='approved' WHERE id=?",[id]);
    res.json({msg:`Approved Level ${r.to_level}`});
  } catch(e){ console.error(e); res.status(500).json({msg:'Server error'}); }
};

exports.rejectUpgrade = async (req, res) => {
  try {
    await db.query("UPDATE upgrade_requests SET status='rejected' WHERE id=?",[req.params.id]);
    res.json({msg:'Rejected'});
  } catch(e){ console.error(e); res.status(500).json({msg:'Server error'}); }
};

exports.getMyPendingRequests = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT id FROM upgrade_requests WHERE student_id=? AND subject_id IS NULL AND status='pending'",[req.user.id]);
    res.json({pending: rows.length>0});
  } catch(e){ console.error(e); res.status(500).json({msg:'Server error'}); }
};
