const { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require('discord.js');
const fetch = require('node-fetch');
const http = require('http');

// Renderのタイムアウト防止用ダミーサーバー
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running!');
}).listen(PORT);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GAS_URL = process.env.GAS_URL;
const ALLOWED_CHANNEL_ID = process.env.ALLOWED_CHANNEL_ID;

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// ① チャットメッセージの処理
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (ALLOWED_CHANNEL_ID && message.channel.id !== ALLOWED_CHANNEL_ID) return;

  const userText = message.content.trim();
  if (!userText) return;

  await message.channel.sendTyping();

  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: userText,
        username: message.author.username
      })
    });

    const json = await response.json();

    // アイテム配列（items）がある場合はボタンを作成
    if (json.items && json.items.length > 0) {
      const rows = [];
      let currentRow = new ActionRowBuilder();

      // Discordのボタン上限：1行5個まで、全体で最大25個（5行）
      json.items.slice(0, 25).forEach((itemName, index) => {
        const button = new ButtonBuilder()
          .setCustomId(`delete_${itemName}`) // ボタンにアイテム名を埋め込む
          .setLabel(`✔️ ${itemName}`)
          .setStyle(ButtonStyle.Success);

        currentRow.addComponents(button);

        if (currentRow.components.length === 5 || index === json.items.length - 1) {
          rows.push(currentRow);
          currentRow = new ActionRowBuilder();
        }
      });

      await message.reply({ content: json.reply, components: rows });
    } else if (json.reply) {
      await message.reply(json.reply);
    }
  } catch (error) {
    console.error('GAS呼び出しエラー:', error);
    await message.reply('⚠️ 処理中にエラーが発生しました。');
  }
});

// ② ボタンがクリックされたときの処理
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  // ボタンIDから削除対象の品名を取得 (`delete_牛乳` -> `牛乳`)
  if (interaction.customId.startsWith('delete_')) {
    const targetItem = interaction.customId.replace('delete_', '');

    await interaction.deferUpdate(); // 処理中アニメーション

    try {
      const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: targetItem,
          action: "delete"
        })
      });

      const json = await response.json();

      // ボタンを押したメッセージに完了の返信を送る
      await interaction.followUp({ content: json.reply });
    } catch (error) {
      console.error('ボタン処理エラー:', error);
      await interaction.followUp({ content: '⚠️ 削除処理に失敗しました。', ephemeral: true });
    }
  }
});

client.login(DISCORD_TOKEN);
