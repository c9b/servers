require("dotenv").config();
const { WOLFBot } = require("wolf.js");
const express = require("express");
const { addPoints, getPoints } = require("./db");
const words = require("./words");

// تحويل الأرقام العربية إلى إنجليزية
function arabicToEnglishNums(str) {
  return str.replace(/[٠-٩]/g, d => "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)]);
}

// دالة تشيل النقاط والهمزات
function removeDotsAndHamza(str) {
  return str
    // إزالة الهمزات
    .replace(/[أإآءؤئ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    // تحويل الأحرف المنقوطة إلى ما يشبهها بلا نقاط
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
    this.active = false;
  }
  getRandomWord() {
    if (this.remainingWords.length === 0) this.remainingWords = [...words];
    const i = Math.floor(Math.random() * this.remainingWords.length);
    return this.remainingWords.splice(i, 1)[0];
  }
}

// مدير الألعاب (لكل جروب)
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
  gameData.currentGame = { word, active: true };

  // مؤقت انتهاء الجولة
  gameData.currentGame.timeout = setTimeout(() => {
    gameData.currentGame.active = false;
    api.messaging().sendGroupMessage(groupId, `⏰ انتهت الجولة! الكلمة: ${word}`);
  }, 10000);

  // عرض الكلمة بدون نقاط/همزات
  const masked = removeDotsAndHamza(word);
  api.messaging().sendGroupMessage(groupId, `🎮 كلمة جديدة: ${masked} (لديك 10 ثواني)`);
}

// استقبال رسائل المجموعات
api.on("groupMessage", async (msg) => {
  const groupId = msg.targetGroupId;
  const content = (msg.body || "").trim();
  const gameData = gameManager.getGame(groupId);
  const game = gameData.currentGame;

  // بدء لعبة
  if (content === "!نقطة") startGame(groupId);

  // عرض مجموع النقاط
  if (content === "!نقطة مجموعي") {
    const pts = await getPoints("نقطة", msg.sourceSubscriberId, groupId);
    return api.messaging().sendGroupMessage(groupId, `📊 نقاطك في نقطة: ${pts}`);
  }

  // أوامر المساعدة
  if (content === "!نقطة مساعدة") {
    return api.messaging().sendGroupMessage(groupId,
`🎮 أوامر نقطة بوت:
!نقطة - بدء جولة جديدة
!نقطة مجموعي - عرض نقاطك
!نقطة مساعدة - عرض هذه الرسالة`);
  }

  // التحقق من الإجابة
  if (game && game.active) {
    const normalized = arabicToEnglishNums(content);
    if (normalized === game.word) {
      clearTimeout(game.timeout);
      await addPoints("نقطة", msg.sourceSubscriberId, groupId, 1);
      const winner = await api.subscriber().getById(msg.sourceSubscriberId);
      const winnerName = winner?.nickname || "مشارك";
      api.messaging().sendGroupMessage(groupId, `🏆 مبروك ${winnerName}! الإجابة صحيحة: ${game.word}`);
      game.active = false;
    }
  }
});

// API Express
const app = express();
app.get("/", (req, res) => res.send("✅ Noqta Bot يعمل"));
app.listen(process.env.PORT || 3000);

// تسجيل الدخول
api.login(process.env.WOLF_EMAIL, process.env.WOLF_PASSWORD);
