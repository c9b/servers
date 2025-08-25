require("dotenv").config();
const { WOLFBot } = require("wolf.js");
const words = require("./words");
const express = require("express");

/////////////////////
// بوت النقاط
/////////////////////

function removeDots(word) {
  const map = {
    "ب": "ٮ","ت": "ٮ","ث": "ٮ","ن": "ٮ",
    "ي": "ى","ق": "ٯ","ف": "ڡ","ج": "ح",
    "خ": "ح","ذ": "د","ز": "ر","ش": "س",
    "ض": "ص","ظ": "ط","غ": "ع",
    "ئ": "ى","ؤ": "و","ء": ""
  };
  const dots = /[ًٌٍَُِّْٰٕٔ.]/g;
  const cleaned = word.replace(dots, "");
  return cleaned.split("").map(ch => map[ch] || ch).join("");
}

class Game {
  constructor(words) {
    this.remainingWords = [...words];
    this.active = false;
  }
  getRandomWord() {
    if (this.remainingWords.length === 0) this.remainingWords = [...words];
    const index = Math.floor(Math.random() * this.remainingWords.length);
    return this.remainingWords.splice(index, 1)[0];
  }
}

class GameManager {
  constructor() { this.games = new Map(); }
  getGame(groupId) {
    if (!this.games.has(groupId)) this.games.set(groupId, new Game(words));
    return this.games.get(groupId);
  }
}

const gameManager = new GameManager();
const api = new WOLFBot();

api.on("ready", () => {
  console.log("✅ البوت شغال");
});

function startGame(groupId) {
  const gameData = gameManager.getGame(groupId);
  const word = gameData.getRandomWord();
  const noDots = removeDots(word);

  const newGame = {
    originalWord: word,
    wordWithoutDots: noDots,
    active: true,
    remainingWords: gameData.remainingWords
  };

  newGame.timeout = setTimeout(() => {
    if (newGame.active) {
      api.messaging().sendGroupMessage(groupId, `⏰ انتهت الجولة! \nالكلمة الصحيحة كانت: ${word}`);
      newGame.active = false;
      gameData.currentGame = null;
    }
  }, 30000);

  gameData.currentGame = newGame;

  api.messaging().sendGroupMessage(
    groupId,
    `🎮 لعبة جديدة!\nالكلمة بدون نقاط: ${noDots}\nأول واحد يكتبها صحيحة هو الفائز 🎉\n(لديك 30 ثانية)`
  );
}

api.on("groupMessage", async (msg) => {
  const groupId = msg.targetGroupId;
  const content = msg.body.trim();
  const gameData = gameManager.getGame(groupId);
  const game = gameData.currentGame;

  if (content === "!نقطة") {
    if (game && game.active) return api.messaging().sendGroupMessage(groupId, "⚠️ فيه لعبة شغالة بالفعل!");
    startGame(groupId);
  }

  if (content === "!نقطة التالي") {
    if (game && game.active) {
      clearTimeout(game.timeout);
      api.messaging().sendGroupMessage(groupId, `⏩ تم بدء جولة جديدة! الكلمة الصحيحة كانت: ${game.originalWord}`);
      game.active = false;
      setTimeout(() => startGame(groupId), 1000);
    }
  }

  if (game && game.active && content === game.originalWord) {
    clearTimeout(game.timeout);
    const winner = await api.subscriber().getById(msg.sourceSubscriberId);
    api.messaging().sendGroupMessage(groupId, `🏆 مبروك ${winner.nickname}! الإجابة صحيحة: ${game.originalWord}`);
    game.active = false;
    setTimeout(() => startGame(groupId), 1000);
  }

  if (content === "!نقطة مساعدة") {
    api.messaging().sendGroupMessage(
      groupId,
      `📜  أوامر لعبة نقطة:\n🎮 !نقطة - بدء جولة جديدة\n⏩ !نقطة التالي - تجاوز الجولة الحالية وبدء جديدة\n❓ !نقطة مساعدة - عرض قائمة الأوامر`
    );
  }
});

api.login(process.env.WOLF_EMAIL, process.env.WOLF_PASSWORD);

/////////////////////
// سيرفر ويب للتوافق مع Render
/////////////////////

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🤖 البوت شغال على Render ✅");
});

app.listen(PORT, () => {
  console.log(`🌐 السيرفر شغال على البورت: ${PORT}`);
});
