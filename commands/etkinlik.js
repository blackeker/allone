const axios = require("axios");

module.exports = {
    execute: async (sock, chatId) => {
        const disallowedChats = ["120363295081035117@g.us"];
        if (disallowedChats.includes(chatId)) return;

        try {
            const response = await axios.get("http://fatihgulcu.com.tr/api/etkinlik.php");
            const events = response.data.reply;

            if (events && events.length > 0) {
                events.sort((a, b) => new Date(a.Tarih) - new Date(b.Tarih));
                const closestEvents = events.slice(0, 5);

                for (const event of closestEvents) {
                    const eventMessage = `🎉 *Etkinlik*: ${event.Etkinlik}\n📍 *Mekan*: ${event.Mekan}\n📅 *Tarih*: ${event.Tarih}\n⏳ *Kalan Zaman*: ${event.KalanZaman}`;
                    await sock.sendMessage(chatId, { text: eventMessage });
                }
            } else {
                await sock.sendMessage(chatId, { text: "Etkinlik bilgisi bulunamadı." });
            }
        } catch (error) {
            console.error("Hata:", error);
            const errorMessage = error.response
                ? `Etkinlik bilgisi alınamadı. Sunucu hatası: ${error.response.status} ${error.response.statusText}`
                : "Etkinlik bilgisi alınamadı, lütfen daha sonra tekrar deneyin.";
            await sock.sendMessage(chatId, { text: errorMessage });
        }
    }
};
