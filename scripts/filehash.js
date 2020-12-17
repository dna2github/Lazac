const i_fs = require('fs');
const i_crypto = require('crypto');

const filename = process.argv[2];
const algorithm = process.argv[3] || 'sha256';

function main() {
   if (!i_fs.existsSync(filename)) {
      console.error('filehash#noSuchFile', filename);
      process.exit(-1);
      return;
   }
   const hash = i_crypto.createHash(algorithm);
   const stream = i_fs.createReadStream(filename);

   stream.on('readable', () => {
      const chunk = stream.read();
      if (chunk) {
         hash.update(chunk);
      } else {
         stream.close();
         const hex = hash.digest('hex');
         console.log(hex);
         process.exit(0);
      }
   });
}

main();
