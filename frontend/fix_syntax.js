const fs = require('fs');
const path = '/Users/ilanziv/Code/HaydeBot/frontend/components/LeadsDashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/\('date'\)/g, "'date')");
content = content.replace(/\('location'\)/g, "'location')");
content = content.replace(/\('status'\)/g, "'status')");
content = content.replace(/\('service'\)/g, "'service')");
content = content.replace(/\('commission_status'\)/g, "'commission_status')");

// Also toggleLocalSort('referred', 'status') was replaced, so it became toggleLocalSort('referred', 'commission_status')
// Wait, the regex was:
// content.replace(/toggleLocalSort\('referred', 'status'\)/g, "toggleLocalSort('referred', 'commission_status')");
// Let's just fix the double parentheses directly:
content = content.replace(/toggleLocalSort\('referred', \('date'\)\)/g, "toggleLocalSort('referred', 'date')");
content = content.replace(/toggleLocalSort\('referred', \('location'\)\)/g, "toggleLocalSort('referred', 'location')");
content = content.replace(/toggleLocalSort\('referred', \('commission_status'\)\)/g, "toggleLocalSort('referred', 'commission_status')");
content = content.replace(/toggleLocalSort\('referred', \('status'\)\)/g, "toggleLocalSort('referred', 'commission_status')");

// Let's do a more robust fix for the '(' bug:
content = content.replace(/toggleLocalSort\('referred', \('/g, "toggleLocalSort('referred', '");

fs.writeFileSync(path, content, 'utf8');
