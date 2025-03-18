const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const fs = require("fs");
const path = require("path");
const axios = require("axios"); // Add axios for HTTP requests

async function startBot() {
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
        const senderId = message.key.participant || message.key.remoteJid; // Get sender ID
        const text = message.message.conversation || message.message.extendedTextMessage?.text;

        if (!text) return; // Ensure text is defined

        // Komutları çalıştır
        const command = commands[text.slice(1)];
        if (command) {
            try {
                await command.execute(sock, chatId, senderId); // Pass senderId to command
            } catch (error) {
                console.error(`Komut çalıştırılırken hata oluştu: ${text}`, error);
                await sock.sendMessage(chatId, { text: "Komut çalıştırılırken bir hata oluştu." });
            }
        } 
    });
}

startBot();
