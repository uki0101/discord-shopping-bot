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
            action: "confirm_add",
            username: interaction.user.displayName || interaction.user.username // ユーザー名を送信
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
