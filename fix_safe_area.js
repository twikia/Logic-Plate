const fs = require('fs');
const path = require('path');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.tsx') || file.endsWith('.ts')) results.push(file);
    }
  });
  return results;
}
const files = walk('app');
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('SafeAreaView') && content.includes('react-native')) {
    if (content.match(/import\s+\{[^}]*SafeAreaView[^}]*\}\s+from\s+['"]react-native['"]/)) {
      content = content.replace(/import\s+\{([^}]*?)SafeAreaView,?\s*([^}]*?)\}\s+from\s+['"]react-native['"]/, 'import { $1$2 } from "react-native"');
      content = content.replace(/import\s+\{\s*\}\s+from\s+['"]react-native['"];?\n?/, '');
      content = "import { SafeAreaView } from 'react-native-safe-area-context';\n" + content;
      fs.writeFileSync(file, content, 'utf8');
      console.log('Fixed SafeAreaView in', file);
    }
  }
});
