require("dotenv").config();
const { WOLFBot } = require("wolf.js");
const express = require("express");
const { addPoints, getPoints, getLeaderboard, getGlobalLeaderboard } = require("./db");
const words = require("./words");

// دالة تحويل الأرقام العربية
function arabicToEnglishNums(str) {
  return str.replace(/[٠-٩]/g, d => "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)]);
}

function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

class Game{constructor(words){this.remainingWords=[...words];this.active=false;} getRandomWord(){if(this.remainingWords.length===0)this.remainingWords=[...words]; const i=Math.floor(Math.random()*this.remainingWords.length); return this.remainingWords.splice(i,1)[0];}}
class GameManager{constructor(){this.games=new Map();} getGame(groupId){if(!this.games.has(groupId))this.games.set(groupId,new Game(words)); return this.games.get(groupId);}}
const gameManager=new GameManager();

const api=new WOLFBot();
api.on("ready",()=>console.log("✅ Noqta Bot جاهز"));

function startGame(groupId){
  const gameData=gameManager.getGame(groupId);
  const word=gameData.getRandomWord();
  gameData.currentGame={word,active:true};
  gameData.currentGame.timeout=setTimeout(()=>{
    gameData.currentGame.active=false;
    api.messaging().sendGroupMessage(groupId,`⏰ انتهت الجولة! الكلمة: ${word}`);
  },10000);
  api.messaging().sendGroupMessage(groupId,`🎮 كلمة جديدة: ${word} (لديك 10 ثواني)`);
}

api.on("groupMessage", async(msg)=>{
  const groupId=msg.targetGroupId;
  const content=(msg.body||"").trim();
  const gameData=gameManager.getGame(groupId);
  const game=gameData.currentGame;

  if(content==="!نقطة") startGame(groupId);
  if(content==="!نقطة مجموعي"){const pts=await getPoints("نقطة", msg.sourceSubscriberId, groupId); return api.messaging().sendGroupMessage(groupId,`📊 نقاطك في نقطة: ${pts}`);}
  if(content==="!توب"){const leaders=await getLeaderboard("نقطة", groupId); let txt="🏅 التوب في نقطة:\n"; leaders.forEach((l,i)=>txt+=`${i+1}. ${l.user_id} — ${l.points} نقطة\n`); return api.messaging().sendGroupMessage(groupId,txt);}
  if(content==="!توب عام"){const leaders=await getGlobalLeaderboard(groupId); let txt="🌍 التوب في كل الألعاب:\n"; leaders.forEach((l,i)=>txt+=`${i+1}. ${l.user_id} — ${l.total} نقطة\n`); return api.messaging().sendGroupMessage(groupId,txt);}

  if(game && game.active){
    const normalized = arabicToEnglishNums(content);
    if(normalized === game.word){
      clearTimeout(game.timeout);
      await addPoints("نقطة", msg.sourceSubscriberId, groupId,1);
      const winner = await api.subscriber().getById(msg.sourceSubscriberId);
      const winnerName=winner?.nickname||"مشارك";
      api.messaging().sendGroupMessage(groupId,`🏆 مبروك ${winnerName}! الإجابة صحيحة: ${game.word}`);
      game.active=false;
    }
  }
});

const app=express();
app.get("/",(req,res)=>res.send("✅ Noqta Bot يعمل"));
app.listen(process.env.PORT||3000);
api.login(process.env.WOLF_EMAIL, process.env.WOLF_PASSWORD);
