const fs = require('fs');
let content = fs.readFileSync('src/components/dashboard/CapexGanttMonitor.tsx', 'utf8');

// The file currently has literal `\${` inside template literals. 
// Replace `\${` with `${`
content = content.replace(/\\\$\{/g, '${');

// Some `\}` might also exist. Let's catch them if any `\}` is out there.
content = content.replace(/\\\}/g, '}');

fs.writeFileSync('src/components/dashboard/CapexGanttMonitor.tsx', content);
console.log('Fixed ${ variables.');