const fs = require('fs');
let content = fs.readFileSync('src/components/dashboard/CapexGanttMonitor.tsx', 'utf8');

// The string literal has backslash followed by dollar sign followed by open brace.
content = content.split('\\${').join('${');

fs.writeFileSync('src/components/dashboard/CapexGanttMonitor.tsx', content);
console.log('Done splitting and joining \\${');