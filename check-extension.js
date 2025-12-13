// Script para verificar si la extensión se está activando correctamente
// Ejecutar con: node check-extension.js

const { exec } = require('child_process');
const path = require('path');

console.log('🔍 Verificando la extensión DBML...\n');

// Verificar si VS Code está ejecutándose
console.log('1. Verificando si VS Code está ejecutándose...');
exec('tasklist /FI "IMAGENAME eq Code.exe"', (error, stdout) => {
  if (stdout.includes('Code.exe')) {
    console.log('✅ VS Code está ejecutándose');
  } else {
    console.log('❌ VS Code no está ejecutándose');
  }

  // Verificar si la extensión está instalada
  console.log('\n2. Verificando instalación de la extensión...');
  exec('code --list-extensions', (error, stdout) => {
    if (stdout.includes('AndrsFelipeMurillo.noise-dbml')) {
      console.log('✅ Extensión DBML está instalada');
    } else {
      console.log('❌ Extensión DBML NO está instalada');
      console.log('   Instala la extensión desde: noise-dbml-0.0.5.vsix');
    }

    console.log('\n3. Instrucciones para debugging:');
    console.log('   a) Abre VS Code');
    console.log('   b) Presiona Ctrl+Shift+P para abrir la paleta de comandos');
    console.log('   c) Busca "Developer: Toggle Developer Tools"');
    console.log('   d) Ve a la pestaña "Console"');
    console.log('   e) Ejecuta el comando "DBML: Reverse Engineer from Database"');
    console.log('   f) Revisa los mensajes en la consola que empiecen con "DBML" o "Reverse"');

    console.log('\n4. Comandos disponibles:');
    console.log('   - DBML: Reverse Engineer from Database (noise-dbml.reverseEngineerDb)');
    console.log('   - DBML: Open Preview (noise-dbml.openPreview)');
    console.log('   - DBML: Generate SQL (noise-dbml.generateSql)');
    console.log('   - DBML: Detect Anti-Patterns (noise-dbml.detectAntiPatterns)');

    console.log('\n5. Si no ves ningún diálogo al ejecutar el comando:');
    console.log('   - La extensión no se está activando');
    console.log('   - Revisa que esté instalada correctamente');
    console.log('   - Intenta recargar VS Code (Ctrl+Shift+P > "Developer: Reload Window")');
  });
});