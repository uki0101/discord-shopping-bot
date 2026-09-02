if (customId === 'df_confirm') {
      const currentItems = parseItemsFromContent(interaction.message.content);

      if (currentItems.length === 0) {
        await interaction.update({ content: '⚠️ 追加するアイテムが見つかりませんでした。', components: [] });
        return;
      }

      await interaction.deferUpdate();

      try {
        // ★修正点: finalItemsText（文字列join）ではなく、配列 currentItems をそのまま送信
        const response = await fetch(GAS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: currentItems, // 配列データとして送信
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
