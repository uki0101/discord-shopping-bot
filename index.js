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
}).listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

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

      // 各アイテムの緑色削除ボタン（最大24個）
      const displayItems = json.items.slice(0, 24);
      displayItems.forEach((itemName, index) => {
        const button = new ButtonBuilder()
          .setCustomId(`delete_${itemName}`)
          .setLabel(`✔️ ${itemName}`)
          .setStyle(ButtonStyle.Success);

        currentRow.addComponents(button);

        if (currentRow.components.length === 5) {
          rows.push(currentRow);
          currentRow = new ActionRowBuilder();
        }
      });

      // 最後に赤色の「全削除」ボタンを追加
      const clearAllButton = new ButtonBuilder()
        .setCustomId('clear_all')
        .setLabel('🗑️ 全削除')
        .setStyle(ButtonStyle.Danger);

      if (currentRow.components.length < 5) {
        currentRow.addComponents(clearAllButton);
        rows.push(currentRow);
      } else {
        const lastRow = new ActionRowBuilder().addComponents(clearAllButton);
        rows.push(lastRow);
      }

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

  await interaction.deferUpdate(); // 処理中アニメーション

  let sendText = "";
  let actionType = "delete";

  if (interaction.customId === 'clear_all') {
    sendText = "全削除";
    actionType = undefined;
  } else if (interaction.customId.startsWith('delete_')) {
    sendText = interaction.customId.replace('delete_', '');
  } else {
    return;
  }

  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: sendText,
        action: actionType
      })
    });

    const json = await response.json();
    await interaction.followUp({ content: json.reply });
  } catch (error) {
    console.error('ボタン処理エラー:', error);
    await interaction.followUp({ content: '⚠️ 処理に失敗しました。', ephemeral: true });
  }
});

client.login(DISCORD_TOKEN);
