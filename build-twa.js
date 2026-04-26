/**
 * Генерирует Android TWA проект из twa-manifest.json через @bubblewrap/core API
 * Иконки конвертируются в data URL (base64) чтобы избежать проблем с HTTP fetch
 */
const path = require('path');
const fs = require('fs');

function fileToDataUrl(filepath, mimeType = 'image/png') {
  const buf = fs.readFileSync(filepath);
  return `data:${mimeType};base64,${buf.toString('base64')}`;
}

async function main() {
  const manifestPath = path.resolve(__dirname, 'twa-manifest.json');
  const projectDir = path.resolve(__dirname, 'android-project');
  const repoRoot = __dirname;

  console.log('=== TWA Build Script ===');
  console.log('Manifest path:', manifestPath);
  console.log('Project dir:', projectDir);
  console.log('Repo root:', repoRoot);

  if (!fs.existsSync(manifestPath)) {
    console.error('ERROR: twa-manifest.json не найден!');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  // === Конвертируем иконки в data URL ===
  const localIcon = path.join(repoRoot, 'icon-512.png');
  const localMaskable = path.join(repoRoot, 'icon-maskable.png');

  console.log('\n=== Local icon files ===');
  console.log('icon-512.png exists:', fs.existsSync(localIcon),
              'size:', fs.existsSync(localIcon) ? fs.statSync(localIcon).size : 0, 'bytes');
  console.log('icon-maskable.png exists:', fs.existsSync(localMaskable),
              'size:', fs.existsSync(localMaskable) ? fs.statSync(localMaskable).size : 0, 'bytes');

  if (!fs.existsSync(localIcon)) {
    console.error('ERROR: icon-512.png отсутствует в репо!');
    process.exit(1);
  }
  if (!fs.existsSync(localMaskable)) {
    console.error('ERROR: icon-maskable.png отсутствует в репо!');
    process.exit(1);
  }

  // Подменяем URL на data URL (содержит сам бинарный PNG в base64)
  data.iconUrl = fileToDataUrl(localIcon);
  data.maskableIconUrl = fileToDataUrl(localMaskable);

  console.log('\n=== Icons converted to data URLs ===');
  console.log('iconUrl size:', data.iconUrl.length, 'chars');
  console.log('maskableIconUrl size:', data.maskableIconUrl.length, 'chars');
  console.log('iconUrl prefix:', data.iconUrl.substring(0, 50));

  console.log('\nLoading @bubblewrap/core...');
  const core = require('@bubblewrap/core');
  const { TwaGenerator, TwaManifest } = core;
  console.log('@bubblewrap/core version:', require('@bubblewrap/core/package.json').version);

  console.log('\nCreating TwaManifest from data...');
  const twaManifest = new TwaManifest(data);
  console.log('TwaManifest created OK');

  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  console.log('\nGenerating TWA Android project...');
  const generator = new TwaGenerator();
  await generator.createTwaProject(projectDir, twaManifest);

  // Сохраняем оригинальный twa-manifest.json в проект (с URL а не data URL)
  fs.copyFileSync(manifestPath, path.join(projectDir, 'twa-manifest.json'));

  console.log('\nSUCCESS: TWA Android project generated!');
  console.log('Files in project root:');
  fs.readdirSync(projectDir).forEach((f) => {
    const fp = path.join(projectDir, f);
    const stat = fs.statSync(fp);
    console.log(`  ${stat.isDirectory() ? 'D' : 'F'} ${f}`);
  });
}

main().catch((err) => {
  console.error('\n=== FATAL ERROR ===');
  console.error(err);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
