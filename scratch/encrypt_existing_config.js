const fs = require('fs');
const path = require('path');
const sm2 = require('sm-crypto').sm2;

const SM2_PUBLIC_KEY = '048d844937029faa8b8f3e0a0672a0104130e8bf291c60f189864cb3915e62d43c0c5749ec8f5ee15accf373d78da2480b9ecc1580322adb8f4b95facba57e491e';

const filePath = path.join(__dirname, '../data/semantic_config.json');
if (fs.existsSync(filePath)) {
  const content = fs.readFileSync(filePath, 'utf8');
  const config = JSON.parse(content);
  if (config.datasources) {
    config.datasources.forEach(ds => {
      if (ds.properties && ds.properties['connection-password']) {
        const pwd = ds.properties['connection-password'];
        if (!pwd.startsWith('sm2:')) {
          const cipherText = sm2.doEncrypt(pwd, SM2_PUBLIC_KEY, 1);
          ds.properties['connection-password'] = 'sm2:' + cipherText;
          console.log(`Encrypted password for ${ds.name}`);
        }
      }
    });
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
    console.log("Configuration updated successfully with encrypted passwords!");
  }
} else {
  console.log("No config file found to encrypt.");
}
