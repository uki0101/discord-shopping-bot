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

// チェック消去用のボタン作成用（現在のリスト用：案1対応版）
function buildCurrentListComponents(items) {
  if (!items || items.length === 0) return [];

  const rows = [];

  // Discordの制限（1メッセージ最大5行まで）に対応するため最大アイテム数を調整
  const displayItems = items.slice(0, 15);

  displayItems.forEach((itemName) => {
    const hasMultiple = itemName.includes('(x'); // 個数が複数あるかチェック
    const cleanName = itemName.replace(/\s*\(x.+?\)/, '').trim();

    if (hasMultiple) {
      // 複数個ある場合は「1つ買ってみる」と「全消去」の2つのボタンを同じ行に配置
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`dec_${itemName}`)
          .setLabel(`🔽 1つ買った: ${itemName}`)
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`delete_${cleanName}`)
          .setLabel(`🧹 すべて買った`)
          .setStyle(ButtonStyle.Secondary)
      );
      rows.push(row);
    } else {
      // 単品の場合はそのまま消化ボタンを表示
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`delete_${cleanName}`)
          .setLabel(`✔️ ${cleanName}`)
          .setStyle(ButtonStyle.Success)
      );
      rows.push(row);
    }
  });

  // 全削除ボタンの追加（行数に余裕があれば配置）
  if (rows.length < 5) {
    const clearAllButton = new ButtonBuilder()
      .setCustomId('clear_all')
      .setLabel('🗑️ リストを全削除')
      .setStyle(ButtonStyle.Danger);
    
    rows.push(new ActionRowBuilder().addComponents(clearAllButton));
  }

  return rows;
}

// メッセージ本文から「・」で始まる行のアイテム名をパースする関数
function parseItemsFromContent(content) {
  const lines = content.split('\n');
  const items = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('・')) {
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

    // 【2】GASから「現在のリスト（isCurrentList: true）」が返ってきた場合
    if (json.isCurrentList) {
      const components = buildCurrentListComponents(json.items);
      let listContent = json.reply;
      
      if (json.items && json.items.length > 0) {
        const listText = json.items.map(i => `・**${i}**`).join('\n');
        listContent = `${json.reply}\n\n${listText}`;
      }

      await message.reply({ content: listContent, components: components });
      return;
    }

    // 【3】AI候補プレビュー表示（isCurrentList: false）
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
    
    // A-1. キャンセル
    if (customId === 'df_cancel') {
      await interaction.update({
        content: '✖️ 追加をキャンセルしました。',
        components: []
      });
      return;
    }

    // A-2. 個別除外
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

    // A-3. 決定して一括追加
    if (customId === 'df_confirm') {
      await interaction.update({
        content: interaction.message.content + '\n\n⏳ **スプレッドシートに追加中...**',
        components: []
      });

      const currentItems = parseItemsFromContent(interaction.message.content);

      if (currentItems.length === 0) {
        await interaction.followUp({ content: '⚠️ 追加するアイテムが見つかりませんでした。' });
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

        let listContent = json.reply;
        if (json.items && json.items.length > 0) {
          const listText = json.items.map(i => `・**${i}**`).join('\n');
          listContent = `${json.reply}\n\n${listText}`;
        }

        await interaction.followUp({
          content: listContent,
          components: components
        });
      } catch (error) {
        console.error('確定保存エラー:', error);
        await interaction.followUp({ content: '⚠️ リストへの追加に失敗しました。' });
      }
      return;
    }
  }

  // B. リスト個数減算 / 個別完全削除 / 全削除
  if (customId.startsWith('dec_') || customId.startsWith('delete_') || customId === 'clear_all') {
    await interaction.update({
      content: interaction.message.content + '\n⏳ **更新中...**',
      components: []
    });

    let sendText = "";
    let actionType = "delete";

    if (customId === 'clear_all') {
      sendText = "全削除";
      actionType = undefined;
    } else if (customId.startsWith('dec_')) {
      sendText = customId.replace('dec_', '');
      actionType = "decrement"; // 1つ減らすアクション
    } else {
      sendText = customId.replace('delete_', '');
      actionType = "delete"; // 完全削除アクション
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
        let listContent = json.reply;
        if (json.items.length > 0) {
          const listText = json.items.map(i => `・**${i}**`).join('\n');
          listContent = `${json.reply}\n\n${listText}`;
        }
        await interaction.followUp({ content: listContent, components: components });
      } else {
        await interaction.followUp({ content: json.reply });
      }

    } catch (error) {
      console.error('ボタン処理エラー:', error);
      await interaction.followUp({ content: '⚠️ 処理に失敗しました。' });
    }
  }
});

client.login(DISCORD_TOKEN);
