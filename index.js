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

// 追加候補（ドラフト）ボタン作成用
function buildDraftComponents(items) {
  const rows = [];
  let currentRow = new ActionRowBuilder();

  items.slice(0, 20).forEach((itemName, index) => {
    const button = new ButtonBuilder()
      .setCustomId(`df_rm_${index}`)
      .setLabel(`❌ ${itemName}`)
      .setStyle(ButtonStyle.Secondary);

    currentRow.addComponents(button);

    if (currentRow.components.length === 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
  });

  const confirmButton = new ButtonBuilder()
    .setCustomId('df_confirm')
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

// チェック消去用のボタン作成用（現在のリスト用）
function buildCurrentListComponents(items) {
  if (!items || items.length === 0) return [];

  const rows = [];
  let currentRow = new ActionRowBuilder();

  const displayItems = items.slice(0, 24);
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

  return rows;
}

// メッセージ本文から「・」で始まる行のアイテム名を確実にパースする関数
function parseItemsFromContent(content) {
  const lines = content.split('\n');
  const items = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('・')) {
      // 「・」を除去し、太字装飾（**）も除去
      const cleanName = trimmed.replace(/^・\s*/, '').replace(/\*\*/g, '').trim();
      if (cleanName) {
        items.push(cleanName);
      }
    }
  }
  return items;
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

    // 【1】「全削除」コマンド実行時
    if (userText === "全削除" || userText === "全部買った" || userText.includes("すべてを消したい")) {
      if (json.reply) {
        await message.reply(json.reply);
      }
      return;
    }

    // 【2】「リスト」直接呼び出し
    if (userText === "リスト") {
      const components = buildCurrentListComponents(json.items);
      await message.reply({ content: json.reply, components: components });
      return;
    }

    // 【3】AI候補プレビュー表示
    if (json.items && json.items.length > 0 && json.isCurrentList === false) {
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

  // A. 候補編集・確定のボタン処理
  if (customId.startsWith('df_')) {
    
    // キャンセル
    if (customId === 'df_cancel') {
      await interaction.update({
        content: '✖️ 追加をキャンセルしました。',
        components: []
      });
      return;
    }

    // 個別除外
    if (customId.startsWith('df_rm_')) {
      const removeIndex = parseInt(customId.replace('df_rm_', ''), 10);
      
      let currentItems = parseItemsFromContent(interaction.message.content);
      currentItems.splice(removeIndex, 1);

      if (currentItems.length === 0) {
        await interaction.update({
          content: '❌ 追加候補がすべて除外されたため、追加をキャンセルしました。',
          components: []
        });
        return;
      }

      const itemsListText = currentItems.map(i => `・**${i}**`).join('\n');
      const contentText = `💡 **追加候補:**\n不要なアイテムはタップして除外してください。\n\n${itemsListText}`;
      const components = buildDraftComponents(currentItems);

      await interaction.update({ content: contentText, components: components });
      return;
    }

    // 決定して一括追加
    if (customId === 'df_confirm') {
      await interaction.deferUpdate();

      const currentItems = parseItemsFromContent(interaction.message.content);

      if (currentItems.length === 0) {
        await interaction.followUp({ content: '⚠️ 追加するアイテムが見つかりませんでした。', ephemeral: true });
        return;
      }

      try {
        const finalItemsText = currentItems.join(', ');
        
        const response = await fetch(GAS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: finalItemsText,
            action: "confirm_add"
          })
        });

        const json = await response.json();
        const components = buildCurrentListComponents(json.items);

        await interaction.editReply({
          content: json.reply,
          components: components
        });
      } catch (error) {
        console.error('確定保存エラー:', error);
        await interaction.followUp({ content: '⚠️ リストへの追加に失敗しました。', ephemeral: true });
      }
      return;
    }
  }

  // B. リスト個別チェック削除 / 全削除
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

    if (json.items) {
      const components = buildCurrentListComponents(json.items);
      await interaction.followUp({ content: json.reply, components: components });
    } else {
      await interaction.followUp({ content: json.reply });
    }

  } catch (error) {
    console.error('ボタン処理エラー:', error);
    await interaction.followUp({ content: '⚠️ 処理に失敗しました。', ephemeral: true });
  }
});

client.login(DISCORD_TOKEN);
