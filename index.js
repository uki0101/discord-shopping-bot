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

// 未確定の追加候補セッションを保持するメモリマップ
const draftSessions = new Map();

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// ボタンコンポーネントを生成するヘルパー関数
function buildDraftComponents(items) {
  const rows = [];
  let currentRow = new ActionRowBuilder();

  // ① 削除用ボタン
  items.slice(0, 20).forEach((itemName, index) => {
    const button = new ButtonBuilder()
      .setCustomId(`draft_remove_${index}`)
      .setLabel(`❌ ${itemName}`)
      .setStyle(ButtonStyle.Secondary);

    currentRow.addComponents(button);

    if (currentRow.components.length === 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
  });

  // ② 確定・キャンセルボタン
  const confirmButton = new ButtonBuilder()
    .setCustomId('draft_confirm')
    .setLabel('✅ 決定してリストに追加')
    .setStyle(ButtonStyle.Success);

  const cancelButton = new ButtonBuilder()
    .setCustomId('draft_cancel')
    .setLabel('✖️ キャンセル')
    .setStyle(ButtonStyle.Danger);

  if (currentRow.components.length <= 3) {
    currentRow.addComponents(confirmButton, cancelButton);
    rows.push(currentRow);
  } else {
    if (currentRow.components.length > 0) rows.push(currentRow);
    const actionRow = new ActionRowBuilder().addComponents(confirmButton, cancelButton);
    rows.push(actionRow);
  }

  return rows;
}

// チャットメッセージの処理
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

    // 【1】「リスト」取得時のレスポンス（チェック削除 & 全削除ボタン）
    if (userText === "リスト" && json.items) {
      if (json.items.length === 0) {
        await message.reply(json.reply);
        return;
      }

      const rows = [];
      let currentRow = new ActionRowBuilder();

      const displayItems = json.items.slice(0, 24);
      displayItems.forEach((itemName) => {
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

      const clearAllButton = new ButtonBuilder()
        .setCustomId('clear_all')
        .setLabel('🗑️ 全削除')
        .setStyle(ButtonStyle.Danger);

      if (currentRow.components.length < 5) {
        currentRow.addComponents(clearAllButton);
        rows.push(currentRow);
      } else {
        if (currentRow.components.length > 0) rows.push(currentRow);
        rows.push(new ActionRowBuilder().addComponents(clearAllButton));
      }

      await message.reply({ content: json.reply, components: rows });
      return;
    }

    // 【2】「全削除」などのコマンド実行時
    if (userText === "全削除" || userText === "全部買った" || userText.includes("すべてを消したい")) {
      if (json.reply) {
        await message.reply(json.reply);
      }
      return;
    }

    // 【3】AIによる追加候補プレビュー（ボタン付き）
    if (json.items && json.items.length > 0) {
      const itemsListText = json.items.map(i => `・**${i}**`).join('\n');
      const contentText = `💡 **「${userText}」の追加候補:**\n不要なアイテムはタップして除外してください。\n\n${itemsListText}`;

      const components = buildDraftComponents(json.items);
      const sentMessage = await message.reply({ content: contentText, components: components });

      draftSessions.set(sentMessage.id, json.items);
    }

  } catch (error) {
    console.error('GAS呼び出しエラー:', error);
    await message.reply('⚠️ 処理中にエラーが発生しました。');
  }
});

// ボタンがクリックされたときの処理
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const customId = interaction.customId;
  const messageId = interaction.message.id;

  // A. 候補編集のボタン処理
  if (customId.startsWith('draft_')) {
    const items = draftSessions.get(messageId);

    if (!items) {
      await interaction.reply({ content: '⚠️ セッションの有効期限が切れているか、すでに処理済みです。', ephemeral: true });
      return;
    }

    // 個別除外
    if (customId.startsWith('draft_remove_')) {
      const removeIndex = parseInt(customId.replace('draft_remove_', ''), 10);
      items.splice(removeIndex, 1);
      draftSessions.set(messageId, items);

      if (items.length === 0) {
        draftSessions.delete(messageId);
        await interaction.update({
          content: '❌ 追加候補がすべて除外されたため、追加をキャンセルしました。',
          components: []
        });
        return;
      }

      const itemsListText = items.map(i => `・**${i}**`).join('\n');
      const contentText = `💡 **追加候補:**\n不要なアイテムはタップして除外してください。\n\n${itemsListText}`;
      const components = buildDraftComponents(items);

      await interaction.update({ content: contentText, components: components });
      return;
    }

    // キャンセル
    if (customId === 'draft_cancel') {
      draftSessions.delete(messageId);
      await interaction.update({
        content: '✖️ 追加をキャンセルしました。',
        components: []
      });
      return;
    }

    // 決定して一括追加
    if (customId === 'draft_confirm') {
      await interaction.deferUpdate();

      try {
        const finalItemsText = items.join(', ');
        
        await fetch(GAS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: finalItemsText,
            action: "confirm_add"
          })
        });

        draftSessions.delete(messageId);

        const addedListText = items.map(i => `・**${i}**`).join('\n');
        await interaction.editReply({
          content: `✅ **以下のアイテムをリストに追加しました！**\n\n${addedListText}`,
          components: []
        });
      } catch (error) {
        console.error('確定保存エラー:', error);
        await interaction.followUp({ content: '⚠️ リストへの追加に失敗しました。', ephemeral: true });
      }
      return;
    }
  }

  // B. リスト個別削除 / 全削除
  await interaction.deferUpdate();

  let sendText = "";
  let actionType = "delete";

  if (customId === 'clear_all') {
    sendText = "全削除";
    actionType = undefined;
  } else if (customId.startsWith('delete_')) {
    sendText = customId.replace('delete_', '');
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
