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
  if (!Array.isArray(items)) return [];
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
    if (rows.length < 5) {
      rows.push(new ActionRowBuilder().addComponents(confirmButton, cancelButton));
    }
  }

  return rows.slice(0, 5);
}

// チェック消去用のボタン作成用（現在のリスト用：高密度配置）
function buildCurrentListComponents(items) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const rows = [];
  let currentRow = new ActionRowBuilder();

  for (let index = 0; index < items.length; index++) {
    const itemName = items[index];
    const hasMultiple = itemName.includes('(x');
    const cleanName = itemName.replace(/\s*\(x.+?\)/, '').trim();

    if (rows.length >= 4 && currentRow.components.length >= 5) break;

    if (hasMultiple) {
      if (currentRow.components.length > 0) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }

      if (rows.length >= 4) break;

      const multiRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`dec_${index}_${itemName}`)
          .setLabel(`🔽 1つ: ${cleanName}`)
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`delete_${index}_${cleanName}`)
          .setLabel(`🧹 すべて`)
          .setStyle(ButtonStyle.Secondary)
      );
      rows.push(multiRow);

    } else {
      if (currentRow.components.length >= 5) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }

      if (rows.length >= 4) break;

      currentRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`delete_${index}_${cleanName}`)
          .setLabel(`✔️ ${cleanName}`)
          .setStyle(ButtonStyle.Success)
      );
    }
  }

  if (currentRow.components.length > 0 && rows.length < 4) {
    rows.push(currentRow);
  }

  if (rows.length < 5) {
    const clearAllButton = new ButtonBuilder()
      .setCustomId('clear_all_confirm')
      .setLabel('🗑️ リストを全削除')
      .setStyle(ButtonStyle.Danger);
    
    rows.push(new ActionRowBuilder().addComponents(clearAllButton));
  }

  return rows.slice(0, 5);
}

// メッセージ本文から「・」で始まる行のアイテム名をパースする関数
function parseItemsFromContent(content) {
  if (!content) return [];
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
        username: message.author.displayName || message.author.username
      })
    });

    const json = await response.json();

    // 【1】「全削除」テキスト入力時
    if (userText === "全削除" || userText === "全部買った" || userText.includes("すべてを消したい")) {
      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('clear_all_execute').setLabel('🔴 はい（全削除）').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('df_cancel').setLabel('✖️ キャンセル').setStyle(ButtonStyle.Secondary)
      );
      await message.reply({ content: '⚠️ **本当に買い物リストを全削除しますか？**', components: [confirmRow] });
      return;
    }

    // 【2】リスト表示
    if (json.isCurrentList) {
      const items = Array.isArray(json.items) ? json.items : [];
      const components = buildCurrentListComponents(items);
      let listContent = json.reply || "🛒 **現在の買い物リスト:**";
      
      if (items.length > 0) {
        const listText = items.map(i => `・**${i}**`).join('\n');
        listContent = `${listContent}\n\n${listText}`;
      }

      await message.reply({ content: listContent, components: components });
      return;
    }

    // 【3】追加候補表示
    if (json.items && json.items.length > 0 && json.isCurrentList === false) {
      const items = Array.isArray(json.items) ? json.items : [];
      const itemsListText = items.map(i => `・**${i}**`).join('\n');
      const contentText = `💡 **「${userText}」の追加候補:**\n不要なアイテムはタップして除外してください。\n\n${itemsListText}`;

      const components = buildDraftComponents(items);
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

  // 1. 全削除確認
  if (customId === 'clear_all_confirm' || customId === 'clear_all') {
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('clear_all_execute').setLabel('🔴 はい（全削除）').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('df_cancel').setLabel('✖️ キャンセル').setStyle(ButtonStyle.Secondary)
    );
    await interaction.update({
      content: '⚠️ **本当に買い物リストを全削除しますか？**',
      components: [confirmRow]
    });
    return;
  }

  // 2. 全削除実行
  if (customId === 'clear_all_execute') {
    await interaction.deferUpdate();
    try {
      const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: "全削除_実行", action: "clear_all_execute" })
      });
      const json = await response.json();
      await interaction.editReply({ content: json.reply || '🧹 **リストを全削除しました！**', components: [] });
    } catch (e) {
      await interaction.editReply({ content: '⚠️ 全削除処理に失敗しました。', components: [] });
    }
    return;
  }

  // 3. 追加ドラフト操作
  if (customId.startsWith('df_')) {
    if (customId === 'df_cancel') {
      await interaction.update({
        content: '✖️ キャンセルしました。',
        components: []
      });
      return;
    }

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

    if (customId === 'df_confirm') {
      const currentItems = parseItemsFromContent(interaction.message.content);

      if (currentItems.length === 0) {
        await interaction.update({ content: '⚠️ 追加するアイテムが見つかりませんでした。', components: [] });
        return;
      }

      await interaction.deferUpdate();

      try {
        // GASへ配列表記のまま直接送信（合体防止）
        const response = await fetch(GAS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: currentItems,
            action: "confirm_add",
            username: interaction.user.displayName || interaction.user.username
          })
        });

        const json = await response.json();
        const items = Array.isArray(json.items) ? json.items : [];
        const components = buildCurrentListComponents(items);

        let listContent = json.reply || "✅ **アイテムをリストに追加しました！**";
        if (items.length > 0) {
          const listText = items.map(i => `・**${i}**`).join('\n');
          listContent = `${listContent}\n\n${listText}`;
        }

        await interaction.editReply({ content: listContent, components: components });
      } catch (error) {
        console.error('確定保存エラー:', error);
        await interaction.editReply({ content: '⚠️ リストの更新中にエラーが発生しました。', components: [] });
      }
      return;
    }
  }

  // 4. リスト減算・削除（買った時の処理）
  if (customId.startsWith('dec_') || customId.startsWith('delete_')) {
    await interaction.update({
      content: interaction.message.content + '\n\n⏳ **購入処理中...**',
      components: []
    });

    let sendText = "";
    let actionType = "delete";

    if (customId.startsWith('dec_')) {
      sendText = customId.replace(/^dec_\d+_/, '').replace(/^dec_/, '');
      actionType = "decrement";
    } else {
      sendText = customId.replace(/^delete_\d+_/, '').replace(/^delete_/, '');
      actionType = "delete";
    }

    try {
      const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sendText,
          action: actionType,
          username: interaction.user.displayName || interaction.user.username
        })
      });

      const json = await response.json();
      const items = Array.isArray(json.items) ? json.items : [];
      const components = buildCurrentListComponents(items);

      let listContent = json.reply || "✅ **更新しました！**";
      if (items.length > 0) {
        const listText = items.map(i => `・**${i}**`).join('\n');
        listContent = `${listContent}\n\n${listText}`;
      }

      await interaction.followUp({ content: listContent, components: components });

    } catch (error) {
      console.error('ボタン処理エラー:', error);
      await interaction.followUp({ content: '⚠️ 処理に失敗しました。' });
    }
  }
});

client.login(DISCORD_TOKEN);
