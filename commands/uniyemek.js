const axios = require("axios");

module.exports = {
    execute: async (sock, chatId) => {
        const disallowedChats = ["120363295081035117@g.us"];
        if (disallowedChats.includes(chatId)) return;

        try {
            const response = await axios.get("http://fatihgulcu.com.tr/api/uniyemek.php");
            let replyText = response.data.reply || "Üniversite yemek bilgisi alınamadı.";

            // "%90" gibi yüzde ifadelerini kaldır
            replyText = replyText.replace(/%\d{1,3}/g, "");

            await sock.sendMessage(chatId, { text: replyText });
        } catch (error) {
            await sock.sendMessage(chatId, { text: "API'ye ulaşılamıyor, sonra tekrar dene." });
        }
    }
};
