const { WOLFBot } = require("wolf.js");

let users = new Map();
let botApi = null;
let isBotRunning = false;

function cleanNickname(nickname) {
  if (!nickname) return "غير معروف";
  return nickname.replace(/[\x00-\x1F\x7F]/g, "").trim() || "غير معروف";
}

async function getNickname(api, subscriberId) {
  try {
    const subscriber = await api.subscriber.getById(subscriberId);
    if (subscriber?.nickname) return cleanNickname(subscriber.nickname);
  } catch (error) {
    console.error("❌ خطأ في جلب الاسم:", error.message);
  }
  return "غير معروف";
}

async function handleMessage(message, api) {
  if (!message?.sourceSubscriberId) return;
  
  try {
    const nickname = await getNickname(api, message.sourceSubscriberId);
    if (nickname.toLowerCase().includes("bot")) return;
    
    console.log(`📝 ${nickname} (${message.sourceSubscriberId}): ${message.body || "رسالة فارغة"}`);
    
    // تخزين البيانات
    users.set(message.sourceSubscriberId.toString(), {
      nickname,
      timestamp: new Date().toISOString(),
      lastMessage: message.body?.substring(0, 100) || "رسالة فارغة"
    });
  } catch (error) {
    console.error("❌ خطأ في معالجة الرسالة:", error.message);
  }
}

async function startBot(email, password, groupId, onReady, onError) {
  try {
    const api = new WOLFBot();
    botApi = api;
    isBotRunning = true;

    // إعداد event listeners
    api.on("ready", async () => {
      console.log(`✅ البوت ${api.currentSubscriber?.nickname} يعمل الآن`);
      
      try {
        // الانضمام إلى المجموعة المحددة
        if (groupId) {
          await api.group.join(parseInt(groupId));
          console.log(`✅ انضم إلى المجموعة: ${groupId}`);
        }
      } catch (error) {
        console.log("⚠️  يمكن تجاهل خطأ الانضمام للمجموعة");
      }
      
      onReady?.(api.currentSubscriber?.nickname || "البوت");
    });

    api.on("error", (error) => {
      console.error("❌ خطأ في البوت:", error.message);
      isBotRunning = false;
      onError?.(error.message);
    });

    api.on("message", (msg) => handleMessage(msg, api));
    api.on("groupMessage", (msg) => handleMessage(msg, api));
    api.on("privateMessage", (msg) => handleMessage(msg, api));

    // تسجيل الدخول
    api.login(email, password);
    return api;
  } catch (err) {
    console.error("❌ خطأ في تشغيل البوت:", err.message);
    isBotRunning = false;
    onError?.(err.message);
    return null;
  }
}

function stopBot() {
  if (botApi) {
    try {
      botApi.logout();
      console.log("⏹️  تم إيقاف البوت");
    } catch (error) {
      console.error("❌ خطأ في إيقاف البوت:", error.message);
    }
    botApi = null;
  }
  isBotRunning = false;
}

function getUsersAPI() {
  return Array.from(users.entries()).map(([id, data]) => ({
    subscriberId: id,
    nickname: data.nickname,
    timestamp: data.timestamp,
    lastMessage: data.lastMessage
  }));
}

function getBotStatus() {
  return {
    isRunning: isBotRunning,
    userCount: users.size,
    botName: botApi?.currentSubscriber?.nickname || "غير متصل",
    groupId: process.env.GROUP_ID
  };
}

function clearUsers() {
  users.clear();
  console.log("🧹 تم مسح جميع المستخدمين");
}

module.exports = { 
  startBot, 
  stopBot, 
  getUsersAPI, 
  getBotStatus, 
  clearUsers,
  isBotRunning: () => isBotRunning 
};