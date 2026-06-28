const fs = require('fs');
const path = require('path');

const dirs = [
  'c:/Users/fpola/Documents/Code-Local/Platebound/supabase/seed/translations',
  'c:/Users/fpola/Documents/Code-Local/Platebound/i18n/locales'
];

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    if (!file.endsWith('.json') && !file.endsWith('.ts')) return;
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace overallShort placeholder with {{score}}
    content = content.replace(/("overallShort"\s*:\s*".*?)\{\{[^}]+\}\}(.*?")/, '$1{{score}}$2');
    content = content.replace(/('overallShort'\s*:\s*'.*?)\{\{[^}]+\}\}(.*?')/, '$1{{score}}$2');
    
    // Replace distanceAway placeholder with {{distance}}
    content = content.replace(/("distanceAway"\s*:\s*".*?)\{\{[^}]+\}\}(.*?")/, '$1{{distance}}$2');
    content = content.replace(/('distanceAway'\s*:\s*'.*?)\{\{[^}]+\}\}(.*?')/, '$1{{distance}}$2');
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${file}`);
  });
});
