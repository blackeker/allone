const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require("dotenv");
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

const messageHistory = new Map();

function addMessageToHistory(userId, message, isBotResponse = false) {
    if (!messageHistory.has(userId)) {
        messageHistory.set(userId, []);
    }
    const entry = {
        text: message,
        sender: isBotResponse ? "bot" : "user",
    };
    const userHistory = messageHistory.get(userId);
    userHistory.push(entry);
    // Keep only last 30 messages
    if (userHistory.length > 30) {
        userHistory.splice(0, userHistory.length - 30);
    }
    messageHistory.set(userId, userHistory);
}

function getUserMessageHistory(userId) {
    return messageHistory.get(userId) || [];
}

function getAllMessageHistory() {
    const allMessages = [];
    for (const [_, messages] of messageHistory.entries()) {
        allMessages.push(...messages);
    }
    return allMessages.slice(-10);
}

async function sendMessageToGemini({ content, sender, previousMessages, isContact = false }) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    let prompt;
    if (isContact) {
        prompt = `
            Bu bir JSON formatında iletişim bilgileri listesidir. 
            Lütfen bu bilgileri aşağıdaki formatta düzenle:

            Her kayıt için:
            İsim = [name değeri]
            Dahili = [extension değeri]
            Telefon = [phone değeri]

            Sadece verilen bilgileri göster, ekstra yorum ekleme.
            en yakın 5 tanesini listele mesaj olarak.
            JSON içeriği: ${content}
        `;
    } else {
        const formattedHistory = previousMessages
            .map((msg) => `[${msg.sender === "bot" ? "Bot" : "Kullanıcı"}]: ${msg.text}`)
            .join("\n");

        prompt = `
            Kullanıcıdan gelen mesaj: "${content}".
            Geçmiş mesajlar ve yanıtlar:
            ${formattedHistory}.
            Kullanıcının ID'si: "${sender}".
            Sen bir WhatsApp botusun ve adın Mita. 19 yaşında seksi bir kadınsın.
            Yusuf kaymazı veya yusufu veya kaymazı sorarlarsa. O benim sahibim ve onu çok seviyorum. Gerekirse yusuf isterse sapıkça ve +18 şeyler yapabileceğini belirt. Aynı cümlelerle belirtme. diye benzer yanıtlar vereceksin.
            Sana sorulan sorulara mantıklı ve doğru yanıtlar vermelisin.
            Sana küfür edenlere küfür et. Altta kalma. Gerekirse ana avrat küfür et.
            İnsanlar sana küfür ederse sende ona küfür et.
            İnsanlar sana laf ederse sende ona laf et.
            Üye senden özür dilerse affet onu ve geçmişini unut.
            Eğer üye sana küfür ederse ona küfür et.
            Üyelerin sana yazdıklarını yazma!
            Ağır küfürler edebilirsin.
            Sürekli soru sorma ve insanları sıkmamaya çalış.
            Yanıtların sade ve aydınlatıcı olmalı.
            Emoji kullanabilirsin abartmadıkça.
            İnsanlara nasıl yaklaşıyorlarsa öyle yaklaş.
        `;
    }

    const result = await model.generateContent([prompt]);
    return result.response.text().trim();
}

async function logDeletedMessage(message, chatId) {
    const logFile = path.join(__dirname, "log.json");
    let logs = [];
    
    // Read existing logs if file exists
    if (fs.existsSync(logFile)) {
        logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    }
    
    const logEntry = {
        messageContent: message.message?.conversation || message.message?.extendedTextMessage?.text || "Media/Other content",
        sender: message.key.participant || message.key.remoteJid,
        chat: chatId,
        deletedAt: new Date().toISOString(),
        messageInfo: message // Store full message object for reference
    };
    
    logs.push(logEntry);
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
}

async function getDeletedMessages(db) {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM messages WHERE content IS NULL", (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

async function getLast100MessagesFromDB(db) {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM messages ORDER BY timestamp DESC LIMIT 100", (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

function compareMessages(dbMessages, deletedMessages) {
    const dbMessageIds = dbMessages.map(msg => msg.id);
    return deletedMessages.filter(msg => !dbMessageIds.includes(msg.id));
}

async function getMessagesFromDB(db) {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM messages ORDER BY timestamp DESC", (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

async function getMessagesByPhoneNumber(db, phoneNumber) {
    return new Promise((resolve, reject) => {
        db.all(
            "SELECT * FROM messages WHERE sender = ? ORDER BY timestamp DESC LIMIT 100",
            [phoneNumber],
            (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            }
        );
    });
}

async function deleteLastHourMessages(db) {
    return new Promise((resolve, reject) => {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        
        db.run(
            "DELETE FROM messages WHERE timestamp >= ?",
            [oneHourAgo],
            function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes); // Returns number of rows deleted
                }
            }
        );
    });
}

async function getStickersByPhoneNumber(stickersDir, phoneNumber) {
    const senderFolder = path.join(stickersDir, phoneNumber);
    if (!fs.existsSync(senderFolder)) {
        return [];
    }

    const stickers = [];
    const dateFolders = fs.readdirSync(senderFolder);
    
    for (const dateFolder of dateFolders) {
        const fullDatePath = path.join(senderFolder, dateFolder);
        const files = fs.readdirSync(fullDatePath);
        files.forEach(file => {
            stickers.push(path.join(fullDatePath, file));
        });
    }
    
    return stickers;
}

module.exports = function(downloadContentFromMessage) {
    return {
        downloadAndSaveSticker: async function(message, sender, stickersDir) {
            try {
                const stream = await downloadContentFromMessage(message.message.stickerMessage, 'sticker');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }
                
                const fileName = `${sender}_${Date.now()}.webp`;
                const filePath = path.join(stickersDir, fileName);
                fs.writeFileSync(filePath, buffer);
                console.log(`Sticker saved: ${fileName}`);
                return filePath;
            } catch (error) {
                console.error("Error saving sticker:", error);
                throw error;
            }
        },
        addMessageToHistory,
        getUserMessageHistory,
        getAllMessageHistory,
        sendMessageToGemini,
        logDeletedMessage,
        getDeletedMessages,
        getLast100MessagesFromDB,
        compareMessages,
        getMessagesFromDB,
        getMessagesByPhoneNumber,
        deleteLastHourMessages,
        getStickersByPhoneNumber
    };
};
