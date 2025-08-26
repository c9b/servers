require("dotenv").config();
const { WOLFBot } = require("wolf.js");
const express = require("express");
const { addPoints, getPoints } = require("./db");
const words = require("./words");

// تحويل الأرقام العربية إلى إنجليزية
function arabicToEnglishNums(str) {
  return str.replace(/[٠-٩]/g, d => "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)]);
}

// دالة تشيل الفروقات (همزات/تا مربوطة...) لتسهيل المقارنة
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

// دالة تشيل النقاط والهمزات للعرض فقط
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
    this.currentGame = null;
  }

  getRandomWord() {
    if (this.remainingWords.length === 0) this.remainingWords = [...words];
    const i = Math.floor(Math.random() * this.remainingWords.length);
    return this.remainingWords.splice(i, 1)[0];
  }

  resetAnswers() {
    if (this.currentGame) this.currentGame.answers = [];
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
  gameData.currentGame = { word, active: true, answers: [] };

  // مؤقت انتهاء الجولة
  gameData.currentGame.timeout = setTimeout(async () => {
    const answers = gameData.currentGame.answers;
    const hasCorrect = answers.some(a => a.correct);

    if (hasCorrect) {
      // توزيع نقاط لمن أخطأ
      for (const ans of answers) {
        if (!ans.correct) {
          await addPoints("نقطة", ans.user, groupId, 1);
        }
      }

      api.messaging().sendGroupMessage(groupId, `✅ انتهت الجولة! الكلمة: ${gameData.currentGame.word}`);
      gameData.currentGame.active = false;
      gameData.currentGame.resetAnswers();

      // بدء جولة جديدة تلقائيًا
      startGame(groupId);

    } else {
      // لم تكن هناك إجابات صحيحة
      api.messaging().sendGroupMessage(groupId, `⏰ انتهت الجولة بدون أي إجابات صحيحة! الكلمة: ${gameData.currentGame.word}`);
      gameData.currentGame.active = false;
      gameData.currentGame.resetAnswers();
    }
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
  if (content === "!نقطة") return startGame(groupId);

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
    const normalizedInput = normalizeWord(content);
    const normalizedWord = normalizeWord(game.word);

    if (normalizedInput === normalizedWord) {
      const isFirstCorrect = !game.answers.some(a => a.correct);

      if (isFirstCorrect) {
        await addPoints("نقطة", msg.sourceSubscriberId, groupId, 3);
      } else {
        await addPoints("نقطة", msg.sourceSubscriberId, groupId, 2);
      }

      game.answers.push({ user: msg.sourceSubscriberId, correct: true });

      const winner = await api.subscriber().getById(msg.sourceSubscriberId);
      const winnerName = winner?.nickname || "مشارك";

      api.messaging().sendGroupMessage(groupId, `🏆 ${winnerName} أجاب بشكل صحيح: ${game.word}`);
    } else {
      game.answers.push({ user: msg.sourceSubscriberId, correct: false });
    }
  }
});

// API Express
const app = express();
app.get("/", (req, res) => res.send("✅ Noqta Bot يعمل"));
app.listen(process.env.PORT || 3000);

// تسجيل الدخول
api.login(process.env.WOLF_EMAIL, process.env.WOLF_PASSWORD);
