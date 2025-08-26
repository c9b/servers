require("dotenv").config();
const { WOLFBot } = require("wolf.js");
const express = require("express");
const { addPoints, getPoints } = require("./db");
const words = require("./words");

// تحويل الأرقام العربية إلى إنجليزية
function arabicToEnglishNums(str) {
  return str.replace(/[٠-٩]/g, d => "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)]);
}

// دالة تشيل الفروقات لتسهيل المقارنة
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

  // إذا كانت هناك جولة نشطة، لا تبدأ جولة جديدة
  if (gameData.currentGame && gameData.currentGame.active) return;

  if (gameData.currentGame && gameData.currentGame.timeout) {
    clearTimeout(gameData.currentGame.timeout);
  }

  const word = gameData.getRandomWord();
  gameData.currentGame = { word, active: true, answers: [], timeout: null };

  // مؤقت انتهاء الجولة
  gameData.currentGame.timeout = setTimeout(async () => {
    const answers = gameData.currentGame.answers;
    const hasCorrect = answers.some(a => a.correct);

    // إيقاف الجولة الحالية
    gameData.currentGame.active = false;

    if (hasCorrect) {
      // توزيع النقاط
      let firstCorrectGiven = false;
      const results = [];

      for (const ans of answers) {
        let points = 0;
        if (ans.correct) {
          points = firstCorrectGiven ? 2 : 3;
          firstCorrectGiven = true;
        } else if (firstCorrectGiven) {
          points = 1;
        }
        await addPoints("نقطة", ans.user, groupId, points);

        const user = await api.subscriber().getById(ans.user);
        const name = user?.nickname || "مشارك";
        results.push(`${name}: ${points} نقطة${ans.correct ? " ✅" : ""}`);
      }

      api.messaging().sendGroupMessage(groupId, `🎯 النتائج:\n${results.join("\n")}`);

      gameData.currentGame.answers = [];

      // بدء جولة جديدة بعد انتهاء الحالية
      startGame(groupId);

    } else {
      api.messaging().sendGroupMessage(groupId, `⏰ انتهت الجولة بدون أي إجابات صحيحة! الكلمة: ${gameData.currentGame.word}`);
      gameData.currentGame.answers = [];
    }
  }, 10000);

  const masked = removeDotsAndHamza(word);
  api.messaging().sendGroupMessage(groupId, `🎮 كلمة جديدة: ${masked} (لديك 10 ثواني)`);
}

// استقبال رسائل المجموعات
api.on("groupMessage", async (msg) => {
  const groupId = msg.targetGroupId;
  const content = (msg.body || "").trim();
  const gameData = gameManager.getGame(groupId);
  const game = gameData.currentGame;

  if (content === "!نقطة") return startGame(groupId);

  if (content === "!نقطة مجموعي") {
    const pts = await getPoints("نقطة", msg.sourceSubscriberId, groupId);
    return api.messaging().sendGroupMessage(groupId, `📊 نقاطك في نقطة: ${pts}`);
  }

  if (content === "!نقطة مساعدة") {
    return api.messaging().sendGroupMessage(groupId,
`🎮 أوامر نقطة بوت:
!نقطة - بدء جولة جديدة
!نقطة مجموعي - عرض نقاطك
!نقطة مساعدة - عرض هذه الرسالة`);
  }

  if (game && game.active) {
    const normalizedInput = normalizeWord(content);
    const normalizedWord = normalizeWord(game.word);

    game.answers.push({ user: msg.sourceSubscriberId, correct: normalizedInput === normalizedWord });

    // أول إجابة صحيحة توقف استقبال الإجابات مؤقتًا
    if (normalizedInput === normalizedWord) {
      const firstCorrectExists = game.answers.some(a => a.correct && a.user !== msg.sourceSubscriberId);
      if (!firstCorrectExists) {
        game.active = false;

        // إلغاء أي مؤقت سابق لتجنب التكرار
        if (game.timeout) clearTimeout(game.timeout);

        game.timeout = setTimeout(async () => {
          const answers = game.answers;
          let firstCorrectGiven = false;
          const results = [];

          for (const ans of answers) {
            let points = 0;
            if (ans.correct) {
              points = firstCorrectGiven ? 2 : 3;
              firstCorrectGiven = true;
            } else if (firstCorrectGiven) {
              points = 1;
            }
            await addPoints("نقطة", ans.user, groupId, points);

            const user = await api.subscriber().getById(ans.user);
            const name = user?.nickname || "مشارك";
            results.push(`${name}: ${points} نقطة${ans.correct ? " ✅" : ""}`);
          }

          api.messaging().sendGroupMessage(groupId, `🎯 النتائج:\n${results.join("\n")}`);

          // بدء جولة جديدة بعد انتهاء الحالية
          startGame(groupId);

        }, 3000); // تأخير 3 ثواني
      }
    }
  }
});

// API Express
const app = express();
app.get("/", (req, res) => res.send("✅ Noqta Bot يعمل"));
app.listen(process.env.PORT || 3000);

api.login(process.env.WOLF_EMAIL, process.env.WOLF_PASSWORD);
