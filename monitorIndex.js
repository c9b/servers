require('dotenv').config();
const express = require("express");
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const { startBot, stopBot, getUsersAPI, getBotStatus, clearUsers, isBotRunning } = require("./monitorBot");

const app = express();
const PORT = process.env.MONITOR_PORT || 3001;

// إعدادات القوالب
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// التحقق من المتغيرات البيئة
const requiredEnvVars = ['WOLF_EMAIL', 'WOLF_PASSWORD'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ متغيرات البيئة المطلوبة مفقودة:', missingEnvVars.join(', '));
  process.exit(1);
}

// Middleware للتحقق من تسجيل الدخول
function requireLogin(req, res, next) {
  if (!req.session.loggedIn) {
    return res.redirect('/login');
  }
  next();
}

// صفحة تسجيل الدخول
app.get('/login', (req, res) => {
  res.render('login', { 
    error: req.query.error,
    email: process.env.WOLF_EMAIL 
  });
});

// معالجة تسجيل الدخول
app.post('/login', (req, res) => {
  const { password } = req.body;
  
  if (password === process.env.WOLF_PASSWORD) {
    req.session.loggedIn = true;
    res.redirect('/dashboard');
  } else {
    res.redirect('/login?error=كلمة المرور غير صحيحة');
  }
});

// لوحة التحكم الرئيسية
app.get('/dashboard', requireLogin, (req, res) => {
  const status = getBotStatus();
  const users = getUsersAPI();
  
  res.render('dashboard', {
    botStatus: status,
    users: users,
    success: req.query.success,
    error: req.query.error,
    groupId: process.env.GROUP_ID
  });
});

// صفحة حالة البوت
app.get('/status', requireLogin, (req, res) => {
  res.render('status', { 
    botStatus: getBotStatus(),
    users: getUsersAPI() 
  });
});

// تشغيل البوت
app.post('/start', requireLogin, (req, res) => {
  if (isBotRunning()) {
    return res.redirect('/dashboard?error=البوت يعمل بالفعل');
  }
  
  startBot(
    process.env.WOLF_EMAIL,
    process.env.WOLF_PASSWORD,
    process.env.GROUP_ID,
    (nickname) => {
      res.redirect('/dashboard?success=تم تشغيل البوت بنجاح: ' + nickname);
    },
    (error) => {
      res.redirect('/dashboard?error=فشل تشغيل البوت: ' + error);
    }
  );
});

// إيقاف البوت
app.post('/stop', requireLogin, (req, res) => {
  if (!isBotRunning()) {
    return res.redirect('/dashboard?error=البوت غير يعمل');
  }
  
  stopBot();
  res.redirect('/dashboard?success=تم إيقاف البوت بنجاح');
});

// مسح المستخدمين
app.post('/clear', requireLogin, (req, res) => {
  clearUsers();
  res.redirect('/dashboard?success=تم مسح جميع المستخدمين');
});

// API للحصول على المستخدمين
app.get('/api/users', requireLogin, (req, res) => {
  res.json(getUsersAPI());
});

// API للحصول على حالة البوت
app.get('/api/status', requireLogin, (req, res) => {
  res.json(getBotStatus());
});

// تسجيل الخروج
app.post('/logout', requireLogin, (req, res) => {
  if (isBotRunning()) {
    stopBot();
  }
  req.session.destroy();
  res.redirect('/login');
});

// الصفحة الرئيسية
app.get('/', (req, res) => {
  if (req.session.loggedIn) {
    res.redirect('/dashboard');
  } else {
    res.redirect('/login');
  }
});

app.listen(PORT, () => {
  console.log(`👂 البوت المراقب يعمل على http://localhost:${PORT}`);
});