const fs = require('fs');
const https = require('https');
const path = require('path');

const categories = [
  { name: 'italian', tags: 'italian,food' },
  { name: 'mexican', tags: 'mexican,food' },
  { name: 'japanese', tags: 'japanese,food' },
  { name: 'chinese', tags: 'chinese,food' },
  { name: 'american', tags: 'burger,food' },
  { name: 'indian', tags: 'indian,food' },
  { name: 'thai', tags: 'thai,food' },
  { name: 'mediterranean', tags: 'mediterranean,food' },
  { name: 'cafe', tags: 'cafe,coffee' },
  { name: 'bars', tags: 'cocktail,bar' },
  { name: 'smoothies', tags: 'smoothie,drink' },
  { name: 'seafood', tags: 'seafood,food' },
  { name: 'steakhouse', tags: 'steak,food' },
  { name: 'vegan', tags: 'vegan,food' },
  { name: 'pizza', tags: 'pizza,food' },
  { name: 'other', tags: 'restaurant,food' }
];

const dir = path.join(__dirname, 'assets', 'feeling');
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

async function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        let loc = res.headers.location;
        if (!loc.startsWith('http')) {
          const u = new URL(url);
          loc = `${u.protocol}//${u.host}${loc}`;
        }
        return downloadImage(loc, filepath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (${res.statusCode})`));
        return;
      }
      const file = fs.createWriteStream(filepath);
      res.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', err => {
      fs.unlink(filepath, () => reject(err));
    });
  });
}

async function main() {
  console.log('Downloading 48 images...');
  for (const cat of categories) {
    for (let i = 1; i <= 3; i++) {
      const url = `https://loremflickr.com/400/400/${cat.tags}/all?lock=${i}`;
      const filepath = path.join(dir, `${cat.name}_${i}.jpg`);
      if (!fs.existsSync(filepath)) {
        try {
          await downloadImage(url, filepath);
          console.log(`Downloaded ${cat.name}_${i}.jpg`);
        } catch (e) {
          console.error(`Error downloading ${cat.name}_${i}.jpg:`, e.message);
        }
      }
    }
  }
  console.log('Done!');
}

main();
