require("dotenv").config();
const { Bot, InlineKeyboard } = require("grammy");

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("Не найден BOT_TOKEN. Добавь токен в переменные окружения или файл .env");
  process.exit(1);
}

const bot = new Bot(token);
const userSteps = new Map();
const offers = new Map();

function validGiftUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && (
      u.hostname === "t.me" ||
      u.hostname.endsWith(".t.me") ||
      u.hostname === "fragment.com" ||
      u.hostname.endsWith(".fragment.com")
    );
  } catch {
    return false;
  }
}

bot.command("start", async (ctx) => {
  await ctx.reply(
    "Привет! Я создаю демонстрационные предложения о покупке NFT-подарков.\n\n" +
    "Команда /offer — создать предложение.\n" +
    "Важно: кнопка «Принять» только фиксирует согласие в боте. Она не передаёт NFT и не списывает звёзды или TON."
  );
});

bot.command("offer", async (ctx) => {
  userSteps.set(ctx.from.id, { step: "gift" });
  await ctx.reply("Пришли HTTPS-ссылку на NFT-подарок (t.me или fragment.com).");
});

bot.on("message:text", async (ctx) => {
  const state = userSteps.get(ctx.from.id);
  if (!state || ctx.message.text.startsWith("/")) return;

  if (state.step === "gift") {
    if (!validGiftUrl(ctx.message.text.trim())) {
      return ctx.reply("Не похоже на подходящую ссылку. Пришли HTTPS-ссылку с t.me или fragment.com.");
    }
    state.giftUrl = ctx.message.text.trim();
    state.step = "amount";
    return ctx.reply("Какую сумму предложить? Введи число, например 3000.");
  }

  if (state.step === "amount") {
    const amount = Number(ctx.message.text.replace(",", ".").trim());
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) {
      return ctx.reply("Введи корректную сумму больше нуля.");
    }
    state.amount = amount;
    state.step = "currency";
    return ctx.reply("Выбери валюту:", {
      reply_markup: new InlineKeyboard()
        .text("⭐ Звёзды", "currency:stars")
        .text("TON", "currency:ton")
    });
  }
});

bot.callbackQuery(/^currency:(stars|ton)$/, async (ctx) => {
  const state = userSteps.get(ctx.from.id);
  if (!state || state.step !== "currency") {
    return ctx.answerCallbackQuery({ text: "Начни создание заново командой /offer." });
  }

  const currency = ctx.match[1];
  const id = Math.random().toString(36).slice(2, 10);
  const currencyLabel = currency === "stars" ? "⭐" : "TON";
  const formattedAmount = Number(state.amount.toFixed(2)).toLocaleString("ru-RU");

  offers.set(id, {
    ownerId: ctx.from.id,
    ownerName: ctx.from.username ? "@" + ctx.from.username : ctx.from.first_name,
    giftUrl: state.giftUrl,
    amount: state.amount,
    currency,
    status: "pending"
  });

  const keyboard = new InlineKeyboard()
    .text("✕ Отклонить", `offer:${id}:reject`)
    .text("✓ Принять", `offer:${id}:accept`);

  const message =
    "🎁 Предложение о покупке NFT-подарка\n\n" +
    "Привет! Могу купить твой NFT Gift за " + formattedAmount + " " + currencyLabel + ".\n" +
    "Тебя устраивает такое предложение?\n\n" +
    "🎁 Подарок: " + state.giftUrl + "\n\n" +
    "ℹ️ Демонстрационное предложение. Нажатие кнопки не переводит подарок и не отправляет оплату.";

  await ctx.reply(message, { reply_markup: keyboard, link_preview_options: { is_disabled: false } });
  await ctx.answerCallbackQuery({ text: "Предложение создано." });
  userSteps.delete(ctx.from.id);
});

bot.callbackQuery(/^offer:([a-z0-9]+):(accept|reject)$/, async (ctx) => {
  const [, id, action] = ctx.match;
  const offer = offers.get(id);

  if (!offer) {
    return ctx.answerCallbackQuery({ text: "Предложение не найдено. Возможно, бот перезапускался." });
  }
  if (offer.status !== "pending") {
    return ctx.answerCallbackQuery({ text: "На это предложение уже ответили." });
  }
  if (ctx.from.id === offer.ownerId) {
    return ctx.answerCallbackQuery({ text: "Это твоё предложение — отправь его продавцу." });
  }

  offer.status = action === "accept" ? "accepted" : "rejected";
  offer.respondedBy = ctx.from.username ? "@" + ctx.from.username : ctx.from.first_name;

  const decision = action === "accept" ? "согласился(ась) с предложением" : "отклонил(а) предложение";
  await ctx.answerCallbackQuery({ text: action === "accept" ? "Согласие записано." : "Отказ записан." });

  const updatedText =
    (ctx.callbackQuery.message?.text || "Предложение") +
    "\n\n" +
    (action === "accept" ? "✅ Продавец принял предложение." : "❌ Продавец отклонил предложение.") +
    "\nОтвет: " + offer.respondedBy +
    "\n\nℹ️ Это только отметка о согласии. Передача NFT и оплата здесь не выполняются.";

  try {
    await ctx.editMessageText(updatedText, { link_preview_options: { is_disabled: false } });
  } catch (_) {}

  try {
    await bot.api.sendMessage(
      offer.ownerId,
      "По твоему предложению на подарок получен ответ: " + decision + ".\n" +
      "Ответил: " + offer.respondedBy + "\n" +
      "Это не означает, что NFT или деньги были переданы."
    );
  } catch (_) {
    // Пользователь должен сначала открыть бота и нажать /start, чтобы получать уведомления.
  }
});

bot.catch((err) => console.error("Ошибка бота:", err));
bot.start();
console.log("Бот запущен.");
