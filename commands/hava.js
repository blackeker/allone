const axios = require("axios");

module.exports = {
    execute: async (sock, chatId) => {
        const disallowedChats = ["120363295081035117@g.us"];
        if (disallowedChats.includes(chatId)) return;

        try {
            const response = await axios.get("https://fatihgulcu.com.tr/api/hava.php");
            const weatherInfo = response.data.reply || "Hava durumu bilgisi alınamadı.";
            await sock.sendMessage(chatId, { text: weatherInfo });
        } catch (error) {
            console.error("Hata:", error);
            const errorMessage = error.response
                ? `Hava durumu bilgisi alınamadı. Sunucu hatası: ${error.response.status} ${error.response.statusText}`
                : "Hava durumu bilgisi alınamadı, lütfen daha sonra tekrar deneyin.";
            await sock.sendMessage(chatId, { text: errorMessage });
        }
    }
};
