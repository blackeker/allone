const fs = require("fs");
const path = require("path");

module.exports = {
    execute: async (sock, chatId) => {
        try {
            const commandFiles = fs.readdirSync(__dirname).filter(file => file.endsWith(".js"));
            const commandList = commandFiles.map(file => `!${path.basename(file, ".js")}`).join("\n");

            const message = `📜 *Mevcut Komutlar:*\n\n${commandList}`;
            await sock.sendMessage(chatId, { text: message });
        } catch (error) {
            console.error("Komutlar listesi alınırken hata oluştu:", error);
            await sock.sendMessage(chatId, { text: "Komutlar listesi alınırken bir hata oluştu." });
        }
    }
};
