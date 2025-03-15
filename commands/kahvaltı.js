const axios = require("axios");

module.exports = {
    execute: async (sock, chatId) => {
        const disallowedChats = ["120363295081035117@g.us"];
        if (disallowedChats.includes(chatId)) return;

        try {
            const response = await axios.get("http://fatihgulcu.com.tr/api/kykkahvaltı.php");
            let replyText = response.data.reply || "Kahvaltı bilgisi alınamadı.";

            // Handle case where replyText is an array
            if (Array.isArray(replyText)) {
                replyText = replyText
                    .map(item => item.replace(/[*_]/g, "").trim()) // Remove asterisks/underscores and trim
                    .join("\n"); // Join items with newlines
            } else if (typeof replyText === "string") {
                // "%90" gibi yüzde ifadelerini ve gereksiz karakterleri kaldır
                replyText = replyText
                    .replace(/%\d{1,3}/g, "") // Remove percentage expressions
                    .replace(/[*_]/g, "") // Remove asterisks and underscores
                    .replace(/\\/g, ""); // Remove backslashes

                // Her öğeyi yeni satıra koyarak daha düzgün bir görünüm sağla
                replyText = replyText.split(",").map(item => item.trim()).join("\n");
            } else {
                console.error("Beklenmeyen veri türü:", typeof replyText, replyText);
                replyText = "Kahvaltı bilgisi alınamadı.";
            }

            await sock.sendMessage(chatId, { text: replyText });
        } catch (error) {
            console.error("Hata oluştu:", error.message); // Log the error message
            if (error.response) {
                console.error("API Yanıtı:", error.response.data); // Log the API response if available
            }
            await sock.sendMessage(chatId, { text: "API'ye ulaşılamıyor, sonra tekrar dene." });
        }
    }
};
