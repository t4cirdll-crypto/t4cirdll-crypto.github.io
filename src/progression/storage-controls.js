/** Explicit local-file backup: localStorage is scoped to the browser AND server port. */
export function createSaveControls(game, sync) {
  const exportButton = document.getElementById('export-campaign');
  const input = document.getElementById('import-campaign');
  const status = document.getElementById('save-transfer-status');
  exportButton.addEventListener('click', () => {
    const blob = new Blob([game.campaign.snapshot()], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'night-watch-campaign.json';
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Файл сохранён. Его можно загрузить на другом адресе или в другом браузере.';
  });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    try {
      if (file.size > 64000) throw Error('size');
      const snapshot = JSON.parse(await file.text());
      if (!game.importCampaign(snapshot)) throw Error('invalid');
      sync();
      status.textContent = 'Кампания восстановлена из файла.';
    } catch {
      status.textContent = 'Не удалось загрузить сохранение. Нужен JSON-файл этой игры; текущий прогресс не изменён.';
    }
  });
}
