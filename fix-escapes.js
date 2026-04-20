const fs = require('fs');
let content = fs.readFileSync('src/components/dashboard/CapexGanttMonitor.tsx', 'utf8');

// Replace injected backslashes used to quote template literals
// I injected \` and \$\{ everywhere.

// Unescape backtick
content = content.replace(/\\`/g, '`');

// Unescape ${
content = content.replace(/\\\$\{/g, '${');

fs.writeFileSync('src/components/dashboard/CapexGanttMonitor.tsx', content);
console.log('Fixed');