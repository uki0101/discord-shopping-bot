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
        
        // タイムアウト設定を無効化（GASの応答をしっかり待つ）
        const response = await fetch(GAS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: finalItemsText,
            action: "confirm_add",
            username: interaction.user.displayName || interaction.user.username
          })
        });

        const json = await response.json();
        const components = buildCurrentListComponents(json.items);

        let listContent = json.reply || "✅ **アイテムをリストに追加しました！**";
        if (json.items && json.items.length > 0) {
          const listText = json.items.map(i => `・**${i}**`).join('\n');
          listContent = `${listContent}\n\n${listText}`;
        }

        await interaction.followUp({
          content: listContent,
          components: components
        });
      } catch (error) {
        console.error('確定保存時の通信エラー:', error);
        
        // 通信がタイムアウトしてもGAS側で保存できている可能性が高いため、最新リストの取得を試みる
        try {
          const retryRes = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: "リスト", action: undefined })
          });
          const retryJson = await retryRes.json();
          const components = buildCurrentListComponents(retryJson.items);
          
          let listContent = "✅ **アイテムをリストに追加しました！**";
          if (retryJson.items && retryJson.items.length > 0) {
            const listText = retryJson.items.map(i => `・**${i}**`).join('\n');
            listContent = `${listContent}\n\n${listText}`;
          }
          await interaction.followUp({ content: listContent, components: components });
        } catch (retryError) {
          await interaction.followUp({ content: '⚠️ 処理に少し時間がかかりました。最新のリストは「リスト」と送信して確認してください。' });
        }
      }
      return;
    }
