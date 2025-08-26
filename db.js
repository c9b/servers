const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// إضافة نقاط مع تحديث nickname
async function addPoints(botName, userId, groupId, points, nickname="") {
  await pool.query(
    `INSERT INTO users_points (bot_name, user_id, group_id, nickname, points)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (bot_name, user_id, group_id)
     DO UPDATE SET points = users_points.points + $5,
                   nickname = EXCLUDED.nickname`,
    [botName, userId, groupId, nickname, points]
  );
}

// الحصول على نقاط مستخدم محدد
async function getPoints(botName, userId, groupId) {
  const res = await pool.query(
    `SELECT points FROM users_points WHERE bot_name=$1 AND user_id=$2 AND group_id=$3`,
    [botName, userId, groupId]
  );
  return res.rows[0]?.points || 0;
}

// الحصول على قائمة أفضل المستخدمين لبوت معين داخل مجموعة
async function getLeaderboard(botName, groupId, limit=10) {
  const res = await pool.query(
    `SELECT user_id, nickname, points 
     FROM users_points 
     WHERE bot_name=$1 AND group_id=$2 
     ORDER BY points DESC 
     LIMIT $3`,
    [botName, groupId, limit]
  );
  return res.rows;
}

// الحصول على الترتيب العام داخل مجموعة لجميع البوتات
async function getGlobalLeaderboard(groupId, limit=10) {
  const res = await pool.query(
    `SELECT user_id, MAX(nickname) as nickname, SUM(points) as total
     FROM users_points 
     WHERE group_id=$1 
     GROUP BY user_id 
     ORDER BY total DESC 
     LIMIT $2`,
    [groupId, limit]
  );
  return res.rows;
}

module.exports = { addPoints, getPoints, getLeaderboard, getGlobalLeaderboard };
