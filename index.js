const { default: makeWASocket, useMultiFileAuthState, downloadContentFromMessage } = require("@whiskeysockets/baileys");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const dotenv = require("dotenv");
// Remove sqlite imports
dotenv.config();

const { GoogleGenerativeAI } = require("@google/generative-ai");
const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const functions = require("./fonksiyonlar.js")(downloadContentFromMessage);

const messageHistory = new Map();
let yapayZekaData = new Map();

const MESSAGES_FILE = path.join(__dirname, "data", "messages.json");

// Initialize messages storage
const initMessagesStorage = () => {
    try {
        if (!fs.existsSync(path.dirname(MESSAGES_FILE))) {
            fs.mkdirSync(path.dirname(MESSAGES_FILE), { recursive: true });
        }
        if (!fs.existsSync(MESSAGES_FILE)) {
            fs.writeFileSync(MESSAGES_FILE, JSON.stringify([]));
        }
        console.log("Messages storage initialized successfully");
    } catch (error) {
        console.error("Messages storage initialization error:", error);
        throw error;
    }
};

// JSON operations
const saveMessage = async (message) => {
    try {
        const messages = JSON.parse(fs.readFileSync(MESSAGES_FILE));
        messages.push(message);
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
    } catch (error) {
        console.error("Error saving message:", error);
        throw error;
    }
};

const getMessages = () => {
    try {
        return JSON.parse(fs.readFileSync(MESSAGES_FILE));
    } catch (error) {
        console.error("Error reading messages:", error);
        return [];
    }
};

// Modify sticker directory creation
const stickersDir = path.join(__dirname, "data", "stickers");
if (!fs.existsSync(stickersDir)){
    fs.mkdirSync(stickersDir, { recursive: true });
}

async function startBot() {
    try {
        // Initialize messages storage
        initMessagesStorage();
        
        const { state, saveCreds } = await useMultiFileAuthState("auth_info");
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: true
        });

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", (update) => {
            const { connection } = update;
            if (connection === "open") console.log("Bot aktif!");
            if (connection === "close") startBot();
        });

        // Komutları yükle
        const commands = {};
        const commandFiles = fs.readdirSync(path.join(__dirname, "commands")).filter(file => file.endsWith(".js"));
        for (const file of commandFiles) {
            const commandName = path.basename(file, ".js");
            commands[commandName] = require(`./commands/${file}`);
        }

        sock.ev.on("messages.upsert", async (msg) => {
            const message = msg.messages[0];
            if (!message.message) return;

            const chatId = message.key.remoteJid;
            let sender = message.key.participant || message.key.remoteJid;
            sender = sender.split('@')[0].replace(/^9/, '');

            // Check if message contains a sticker
            if (message.message.stickerMessage) {
                try {
                    await functions.downloadAndSaveSticker(message, sender, stickersDir);
                } catch (error) {
                    console.error("Error handling sticker:", error);
                }
                return; // Skip further processing for stickers
            }

            const text = message.message.conversation || message.message.extendedTextMessage?.text;
            if (!text) return;

            // Save message to JSON file
            await saveMessage({
                id: message.key.id,
                chatId,
                sender,
                content: text,
                timestamp: new Date().toISOString()
            });

            if (text === "!temizle") {
                try {
                    const messages = getMessages();
                    const oneHourAgo = new Date(Date.now() - 3600000);
                    const newMessages = messages.filter(msg => 
                        new Date(msg.timestamp) > oneHourAgo
                    );
                    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(newMessages, null, 2));
                    await sock.sendMessage(chatId, { 
                        text: `Son 1 saatin mesajları silindi. Toplam silinen mesaj: ${messages.length - newMessages.length}` 
                    });
                } catch (error) {
                    console.error("Error deleting messages:", error);
                    await sock.sendMessage(chatId, { text: "Mesajlar silinirken bir hata oluştu." });
                }
            } else if (text.startsWith('!mesajlar')) {
                try {
                    const phoneNumber = text.split(' ')[1];
                    const messages = getMessages();
                    if (phoneNumber) {
                        const userMessages = messages.filter(msg => msg.sender === phoneNumber);
                        if (userMessages.length > 0) {
                            const response = userMessages.map(msg => 
                                `Time: ${new Date(msg.timestamp).toLocaleString()}\nContent: ${msg.content}`
                            ).join('\n\n');
                            await sock.sendMessage(chatId, { text: response });
                        } else {
                            await sock.sendMessage(chatId, { text: 'No messages found for this number.' });
                        }
                    } else {
                        const response = messages.slice(-100).map(msg => 
                            `Sender: ${msg.sender}\nContent: ${msg.content}`
                        ).join('\n\n');
                        await sock.sendMessage(chatId, { text: response });
                    }
                } catch (error) {
                    console.error("Error retrieving messages:", error);
                    await sock.sendMessage(chatId, { text: "Error retrieving messages." });
                }
            } else if (text === "!kabaklıadres") {
                const addressMessage = `ÇAYDAÇIRA MAH. 4106 SK. AHMET KABAKLI\nERKEK ÖĞRENCİ YRD. SİTESİ AHMET\nKABAKLI ERKEK ÖĞRENCİ YRD. NO: 6/1  İÇ\nKAPI NO: 1 MERKEZ / ELAZIĞ`;
                await sock.sendMessage(chatId, { text: addressMessage });
            } else if (text.startsWith("!iletişim")) {
                try {
                    const searchTerm = text.split(" ")[1]?.toLowerCase();
                    const { departments } = require("./data/numaralar.json");
                    
                    if (searchTerm) {
                        const filteredData = departments.filter(item => 
                            item.name.toLowerCase().includes(searchTerm) || 
                            (item.type && item.type.toLowerCase().includes(searchTerm))
                        );
                        
                        const response = await sendMessageToGemini({
                            content: JSON.stringify(filteredData),
                            sender: sender,
                            previousMessages: [],
                            isContact: true
                        });
                        
                        await sock.sendMessage(chatId, { text: response });
                    } else {
                        const response = await sendMessageToGemini({
                            content: JSON.stringify(departments),
                            sender: sender,
                            previousMessages: [],
                            isContact: true
                        });
                        
                        await sock.sendMessage(chatId, { text: response });
                    }
                } catch (error) {
                    console.error("İletişim bilgileri getirilirken hata:", error);
                    await sock.sendMessage(chatId, { text: "İletişim bilgileri getirilirken bir hata oluştu." });
                }
            } else if (text.startsWith("!sor ") || text.includes("@mita")) {
                try {
                    const userMessage = text.replace(/!mita\s+|@mita/i, "").trim();
                    
                    // Get message history
                    const previousMessages = getUserMessageHistory(sender);
                    addMessageToHistory(sender, userMessage);

                    // Send to Gemini
                    const response = await sendMessageToGemini({
                        content: userMessage,
                        sender: sender,
                        previousMessages: getAllMessageHistory()
                    });

                    if (response) {
                        await sock.sendMessage(chatId, { text: response });
                        addMessageToHistory(sender, response, true);
                    }
                } catch (error) {
                    console.error("Gemini yanıtı oluşturulurken hata:", error);
                    await sock.sendMessage(chatId, { text: "Üzgünüm, bir hata oluştu." });
                }
            } else if (text === "!silinen") {
                try {
                    const deletedMessages = await functions.getDeletedMessages(db);
                    const last100Messages = await functions.getLast100MessagesFromDB(db);
                    const missingMessages = functions.compareMessages(last100Messages, deletedMessages);

                    if (missingMessages.length > 0) {
                        const response = missingMessages.map(msg => `Sender: ${msg.sender}, Content: ${msg.content}`).join("\n");
                        await sock.sendMessage(chatId, { text: response });
                    } else {
                        await sock.sendMessage(chatId, { text: "No missing messages found." });
                    }
                } catch (error) {
                    console.error("Error retrieving deleted messages:", error);
                    await sock.sendMessage(chatId, { text: "Error retrieving deleted messages." });
                }
            } else if (text.startsWith('!st')) {
                try {
                    const targetNumber = text.split(' ')[1];
                    if (!targetNumber) {
                        await sock.sendMessage(chatId, { text: 'Lütfen bir numara belirtin. Örnek: !st 905551234567' });
                        return;
                    }
            
                    const stickers = await functions.getStickersByPhoneNumber(stickersDir, targetNumber);
                    if (stickers.length === 0) {
                        await sock.sendMessage(chatId, { text: 'Bu numaraya ait sticker bulunamadı.' });
                        return;
                    }
            
                    // Get sender's DM chat ID
                    const senderDM = sender + '@s.whatsapp.net';
            
                    // Send notification
                    await sock.sendMessage(chatId, { 
                        text: `${stickers.length} adet sticker bulundu. DM'den gönderiliyor...` 
                    });
            
                    // Send stickers as images in DM
                    for (const stickerPath of stickers) {
                        await sock.sendMessage(senderDM, {
                            image: { url: stickerPath },
                            caption: `Sticker from: ${targetNumber}`
                        });
                    }
            
                } catch (error) {
                    console.error("Error sending stickers:", error);
                    await sock.sendMessage(chatId, { text: "Sticker'ları gönderirken bir hata oluştu." });
                }
            } else {
                const command = commands[text.slice(1)];
                if (command) {
                    try {
                        await command.execute(sock, chatId);
                    } catch (error) {
                        console.error(`Komut çalıştırılırken hata oluştu: ${text}`, error);
                        await sock.sendMessage(chatId, { text: "Komut çalıştırılırken bir hata oluştu." });
                    }
                }
            }
        });
    } catch (error) {
        console.error("Error starting bot:", error);
        process.exit(1);
    }
}

// Helper functions
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

// Replace database initialization with messages storage initialization
initMessagesStorage();
startBot();
