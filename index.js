require("dotenv").config();
const { WOLFBot } = require("wolf.js");
const express = require("express");
const { addPoints, getPoints } = require("./db");
const words = require("./words");

// تحويل الأرقام العربية إلى إنجليزية
function arabicToEnglishNums(str) {
  return str.replace(/[٠-٩]/g, d => "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)]);
}

// دالة لتسهيل المقارنة بين الكلمات
function normalizeWord(str) {
  return arabicToEnglishNums(
    (str || "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      .trim()
  );
}

// دالة لإخفاء النقاط والهمزات (لعرض الكلمة)
function removeDotsAndHamza(str) {
  return str
    .replace(/[أإآءؤئ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[بپ]/g, "ٮ")
    .replace(/[تث]/g, "ٮٮ")
    .replace(/ج/g, "ح")
    .replace(/خ/g, "ح")
    .replace(/ذ/g, "د")
    .replace(/ز/g, "ر")
    .replace(/[شس]/g, "س")
    .replace(/ض/g, "ص")
    .replace(/ظ/g, "ط")
    .replace(/غ/g, "ع")
    .replace(/ف/g, "ڡ")
    .replace(/ق/g, "ٯ")
    .replace(/ن/g, "ں")
    .replace(/ي/g, "ى");
}

// كلاس اللعبة
class Game {
  constructor(words) {
    this.remainingWords = [...words];
  }
  getRandomWord() {
    if (this.remainingWords.length === 0) this.remainingWords = [...words];
    const i = Math.floor(Math.random() * this.remainingWords.length);
    return this.remainingWords.splice(i, 1)[0];
  }
}

// مدير الألعاب لكل جروب
class GameManager {
  constructor() {
    this.games = new Map();
  }
  getGame(groupId) {
    if (!this.games.has(groupId)) this.games.set(groupId, new Game(words));
    return this.games.get(groupId);
  }
}

const gameManager = new GameManager();
const api = new WOLFBot();

api.on("ready", () => console.log("✅ Noqta Bot جاهز"));

// بدء جولة
function startGame(groupId) {
  const gameData = gameManager.getGame(groupId);
  const word = gameData.getRandomWord();
  gameData.currentGame = { 
    word, 
    active: true, 
    players: new Map(), // userId => نقاطهم في الجولة
    firstCorrect: null  // لتحديد من أجاب أولاً
  };

  const masked = removeDotsAndHamza(word);
  try {
    api.messaging().sendGroupMessage(groupId, `🎮 كلمة جديدة: ${masked} (لديك 10 ثواني).`);
  } catch (err) {
    console.error("حدث خطأ أثناء إرسال كلمة الجولة:", err);
  }

  // مؤقت انتهاء الجولة
  gameData.currentGame.timeout = setTimeout(async () => {
    const game = gameData.currentGame;
    game.active = false;

    let resultMsg = `⏰ انتهت الجولة! الكلمة: ${word}\n`;

    // ترتيب اللاعبين بحيث يظهر أول correct أولاً
    const sortedPlayers = [...game.players.entries()]
      .sort((a, b) => {
        if (a[0] === game.firstCorrect) return -1;
        if (b[0] === game.firstCorrect) return 1;
        return 0;
      });

    for (const [userId, points] of sortedPlayers) {
      await addPoints("نقطة", userId, groupId, points);

      let user;
      try { user = await api.subscriber().getById(userId); } catch { user = null; }
      let safeName = user?.profile?.nickname || user?.nickname || userId.toString();
      safeName = safeName.trim() || userId.toString();

      resultMsg += `${safeName}: ${points} نقطة\n`;
    }

    if (resultMsg.trim()) {
      try {
        api.messaging().sendGroupMessage(groupId, resultMsg + "🎉");
      } catch (err) {
        console.error("حدث خطأ أثناء إرسال نتائج الجولة:", err);
      }
    }
  }, 10000);
}

// استقبال رسائل المجموعات
api.on("groupMessage", async (msg) => {
  const groupId = msg.targetGroupId;
  const content = (msg.body || "").trim();
  const gameData = gameManager.getGame(groupId);
  const game = gameData.currentGame;

  // بدء اللعبة
  if (content === "!نقطة") return startGame(groupId);

  // عرض مجموع نقاط المستخدم
  if (content === "!نقطة مجموعي") {
    const pts = await getPoints("نقطة", msg.sourceSubscriberId, groupId);
    try {
      api.messaging().sendGroupMessage(groupId, `📊 نقاطك في نقطة: ${pts}.`);
    } catch (err) {
      console.error("حدث خطأ أثناء عرض مجموع النقاط:", err);
    }
    return;
  }

  // عرض المساعدة
  if (content === "!نقطة مساعدة") {
    try {
      api.messaging().sendGroupMessage(groupId,
`🎮 أوامر نقطة بوت:
!نقطة - بدء جولة جديدة
!نقطة مجموعي - عرض نقاطك
!نقطة مساعدة - عرض هذه الرسالة.`);
    } catch (err) {
      console.error("حدث خطأ أثناء عرض المساعدة:", err);
    }
    return;
  }

  // التحقق من الإجابة أثناء الجولة
  if (game && game.active) {
    const userId = msg.sourceSubscriberId;

    // إذا الإجابة صحيحة
    if (normalizeWord(content) === normalizeWord(game.word)) {
      // تحديد أول correct
      if (!game.firstCorrect) game.firstCorrect = userId;

      // النقاط: أول correct = 2، البقية = 1
      const points = (game.firstCorrect === userId) ? 2 : 1;
      game.players.set(userId, points);
    } else {
      // تسجيل مشاركة خاطئة (يمكن حذف هذا إذا لا تريد تسجيل الخاطئين)
      if (!game.players.has(userId)) game.players.set(userId, 0);
    }
  }
});

// API Express
const app = express();
app.get("/", (req, res) => res.send("✅ Noqta Bot يعمل"));
app.listen(process.env.PORT || 3000);

// تسجيل الدخول
api.login(process.env.WOLF_EMAIL, process.env.WOLF_PASSWORD);
