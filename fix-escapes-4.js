const fs = require('fs');
let text = fs.readFileSync('src/components/dashboard/CapexGanttMonitor.tsx', 'utf8');

// The issue was `$\{currentMonth}`.
// Let's just fix all of them with a clean string replace
text = text.replace(/\$\\\{/g, '${');

fs.writeFileSync('src/components/dashboard/CapexGanttMonitor.tsx', text);
console.log('replaced $\\{ with ${');