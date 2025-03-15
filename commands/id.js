module.exports = {
    execute: async (sock, chatId) => {
        const disallowedChats = ["120363295081035117@g.us"];
        if (disallowedChats.includes(chatId)) return;

        await sock.sendMessage(chatId, { text: `Bu grubun ID'si: ${chatId}` });
    }
};
