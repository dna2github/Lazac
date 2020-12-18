const i_fs = require('fs');
const i_crypto = require('crypto');

async function getHash(filenameOrStream, hashType) {
   return new Promise((r, e) => {
      const externalStream = !(
         typeof filenameOrStream === 'string' ||
         filenameOrStream instanceof String
      );
      const stream = (
         externalStream?
         filenameOrStream:
         i_fs.createReadStream(filenameOrStream)
      );
      const hash = i_crypto.createHash(hashType || 'sha256');
      stream.on('readable', () => {
         const chunk = stream.read();
         if (chunk) {
            hash.update(chunk);
         } else {
            if (!externalStream) stream.close();
            const hex = hash.digest('hex');
            r(hex);
         }
      });
   });
}

async function main() {
   const filename = process.argv[2];
   if (!i_fs.existsSync(filename)) {
      console.error('filehash#noSuchFile', filename);
      process.exit(-1);
      return;
   }
   const hash = await getHash(filename);
   console.log(hash);
   process.exit(0);
}

if (require.main === module) main();

module.exports = {
   api: { getHash, }
};
