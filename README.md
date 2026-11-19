# 
const API = (token, method) =>
  `https://api.telegram.org/bot${token}/${method}`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/setup" && request.method === "GET") {
      const r = await fetch(
        API(env.BOT_TOKEN, "setWebhook") +
        `?url=${encodeURIComponent(url.origin + "/webhook")}`
      );
      return new Response(await r.text());
    }

    if (url.pathname !== "/webhook" || request.method !== "POST") {
      return new Response("Gift Offer Bot is running!");
    }

    const update = await request.json();

    async function call(method, data) {
      return fetch(API(env.BOT_TOKEN, method), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
    }

    if (update.message?.text) {
      const chatId = update.message.chat.id;
      const parts = update.message.text.trim().split(/\s+/);
      const giftLink = parts.find(x => /^https?:\/\//i.test(x));
      const price = parts.find(x => /^\d+([.,]\d+)?$/.test(x));

      if (!giftLink || !price) {
        await call("sendMessage", {
          chat_id: chatId,
          text: "Отправь ссылку на подарок и цену одним сообщением.\n\nПример:\nhttps://t.me/nft/example 100 Stars"
        });
      } else {
        const currency = parts.slice(parts.indexOf(price) + 1).join(" ") || "Stars";
        await call("sendMessage", {
          chat_id: chatId,
          text: `🎁 Предложение на подарок\n\n🔗 ${giftLink}\n💰 Цена: ${price} ${currency}\n\nЭто демонстрация предложения. Реальной передачи подарка или оплаты нет.`,
          reply_markup: {
            inline_keyboard: [[
              { text: "❌ Отклонить", callback_data: "reject" },
              { text: "✅ Принять", callback_data: "accept" }
            ]]
          }
        });
      }
    }

    if (update.callback_query) {
      const q = update.callback_query;
      const accepted = q.data === "accept";

      await call("answerCallbackQuery", {
        callback_query_id: q.id,
        text: accepted ? "Предложение принято" : "Предложение отклонено"
      });

      await call("editMessageText", {
        chat_id: q.message.chat.id,
        message_id: q.message.message_id,
        text: q.message.text + (accepted
          ? "\n\n✅ Предложение принято (демо)"
          : "\n\n❌ Предложение отклонено (демо)")
      });
    }

    return new Response("OK");
  }
};
