// チェック消去用のボタン作成用（ボタン溢れ対策・最適化版）
function buildCurrentListComponents(items) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const rows = [];
  let currentRow = new ActionRowBuilder();

  for (let index = 0; index < items.length; index++) {
    const itemName = items[index];
    const hasMultiple = itemName.includes('(x');
    const cleanName = itemName.replace(/\s*\(x.+?\)/, '').trim();

    // 既に5行満タンの場合はこれ以上追加しない（エラー防止）
    if (rows.length >= 5) break;

    if (hasMultiple) {
      // 複数個の場合は、もし現在作成中の行があれば一度パッシュして新しい独立行を作る
      if (currentRow.components.length > 0) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }

      if (rows.length >= 5) break;

      // 1行に「1つ買った」と「すべて買った」の2つを並べる
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
      // 単品の場合は1行に最大5個まで詰め込む（省スペース化）
      if (currentRow.components.length >= 5) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }

      if (rows.length >= 5) break;

      currentRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`delete_${index}_${cleanName}`)
          .setLabel(`✔️ ${cleanName}`)
          .setStyle(ButtonStyle.Success)
      );
    }
  }

  // 残っているボタン行があれば追加
  if (currentRow.components.length > 0 && rows.length < 5) {
    rows.push(currentRow);
  }

  // 最後の行に全削除ボタンを配置するスペースがあれば追加（最大5行まで）
  if (rows.length < 5) {
    const clearAllButton = new ButtonBuilder()
      .setCustomId('clear_all_confirm')
      .setLabel('🗑️ リストを全削除')
      .setStyle(ButtonStyle.Danger);
    
    rows.push(new ActionRowBuilder().addComponents(clearAllButton));
  }

  return rows;
}
