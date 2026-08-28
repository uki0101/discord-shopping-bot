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

// ボタンコンポーネントを構築するヘルパー関数（CustomIDに品目リストを直接保持）
function buildDraftComponents(items) {
  const rows = [];
  let currentRow = new ActionRowBuilder();

  // アイテム文字列（カンマ区切り）
  const itemsStr = items.join(',');

  // ① 各アイテムの削除ボタン（最大20個）
  items.slice(0, 20).forEach((itemName, index) => {
    // CustomID形式: draft_remove_[インデックス]_[カンマ区切りのリスト]
    const customId = `df_rm_${index}_${itemsStr}`;

    const button = new ButtonBuilder()
      .setCustomId(customId.substring(0, 100)) // DiscordのID長制限(100文字)対策
      .setLabel(`❌ ${itemName}`)
      .setStyle(ButtonStyle.Secondary);

    currentRow.addComponents(button);

    if (currentRow.components.length === 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
  });

  // ② 確定・キャンセルボタン
  const confirmCustomId = `df_cfm_${itemsStr}`.substring(0, 100);
  const confirmButton = new ButtonBuilder()
    .setCustomId(confirmCustomId)
    .setLabel('✅ 決定してリストに追加')
    .setStyle(ButtonStyle.Success);

  const cancelButton = new ButtonBuilder()
    .setCustomId('df_cancel')
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

    // 【1】「リスト」取得時
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

    // 【2】「全削除」などのコマンド時
    if (userText === "全削除" || userText === "全部買った" || userText.includes("すべてを消したい")) {
      if (json.reply) {
        await message.reply(json.reply);
      }
      return;
    }

    // 【3】AI候補プレビュー表示
    if (json.items && json.items.length > 0) {
      const itemsListText = json.items.map(i => `・**${i}**`).join('\n');
      const contentText = `💡 **「${userText}」の追加候補:**\n不要なアイテムはタップして除外してください。\n\n${itemsListText}`;

      const components = buildDraftComponents(json.items);
      await message.reply({ content: contentText, components: components });
    }

  } catch (error) {
    console.error('GAS呼び出しエラー:', error);
    await message.reply('⚠️ 処理中にエラーが発生しました。');
  }
});

// ボタンクリックの処理
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const customId = interaction.customId;

  // A. 候補編集のボタン処理
  if (customId.startsWith('df_')) {
    
    // キャンセル
    if (customId === 'df_cancel') {
      await interaction.update({
        content: '✖️ 追加をキャンセルしました。',
        components: []
      });
      return;
    }

    // 個別除外 (df_rm_[index]_[items])
    if (customId.startsWith('df_rm_')) {
      const parts = customId.split('_');
      const removeIndex = parseInt(parts[2], 10);
      const itemsStr = parts.slice(3).join('_');
      let items = itemsStr ? itemsStr.split(',') : [];

      // 対象アイテムを除外
      items.splice(removeIndex, 1);

      if (items.length === 0) {
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

    // 決定して一括追加 (df_cfm_[items])
    if (customId.startsWith('df_cfm_')) {
      await interaction.deferUpdate();

      const itemsStr = customId.replace('df_cfm_', '');
      const items = itemsStr ? itemsStr.split(',') : [];

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
