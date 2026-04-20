const fs = require('fs');
const path = require('path');

function fixHtmlPaths(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  Archivo no encontrado: ${filePath}`);
    return;
  }

  let html = fs.readFileSync(filePath, 'utf8');
  const originalHtml = html;

  // Reemplazar todas las rutas absolutas por relativas
  html = html.replace(/href="\/_astro\//g, 'href="./_astro/');
  html = html.replace(/src="\/_astro\//g, 'src="./_astro/');
  html = html.replace(/href="\/assets\//g, 'href="./assets/');
  html = html.replace(/src="\/assets\//g, 'src="./assets/');
  
  // También manejar rutas sin barra inicial
  html = html.replace(/href="_astro\//g, 'href="./_astro/');
  html = html.replace(/src="_astro\//g, 'src="./_astro/');

  if (html !== originalHtml) {
    fs.writeFileSync(filePath, html);
    console.log(`✅ Rutas corregidas en: ${path.basename(filePath)}`);
  } else {
    console.log(`ℹ️  No se encontraron rutas que corregir en: ${path.basename(filePath)}`);
  }
}

// Procesar todos los archivos HTML en dist
const distPath = path.join(__dirname, 'dist');

if (!fs.existsSync(distPath)) {
  console.error('❌ La carpeta dist no existe. Ejecuta "npm run build" primero.');
  process.exit(1);
}

// Buscar todos los archivos .html en dist
const htmlFiles = fs.readdirSync(distPath).filter(file => file.endsWith('.html'));

if (htmlFiles.length === 0) {
  console.error('❌ No se encontraron archivos HTML en dist/');
  process.exit(1);
}

console.log(`\n🔧 Corrigiendo rutas en ${htmlFiles.length} archivo(s)...\n`);

htmlFiles.forEach(file => {
  const filePath = path.join(distPath, file);
  fixHtmlPaths(filePath);
});

console.log('\n✨ Proceso completado\n');