const i_s = require('stream');
const i_fs = require('fs');

const MAX_GRAM_NUM = 1000000;

function buildIndexer(I, maxGram) {
   // I = { indexStat: { cur: 0, gram: [] }, index: { gram2: {}, gram3: {} }, audit: { gram2: 0, gram3: 0 } }
   return i_s.Transform({
      transform: (chunk, _encoding, next) => {
         // _encoding should be 'utf8'
         const N = chunk.length;
         for (let i = 0; i < N; i++) {
            const ch = chunk[i];
            if (ch === '\0') {
               if (I.external) {
                  I.external.binary = true;
                  I.external.fn && I.external.fn();
               }
               next();
               return;
            }
            const len = Buffer.from(ch).length;
            I.indexStat.cur += len;
            I.indexStat.gram.push(ch);
            let gn = I.indexStat.gram.length;
            if (gn > 3) {
               I.indexStat.gram.shift();
               gn --;
            }
            /* NB: actually we can use gram3 to get gram2
            if (gn >= 2 && I.audit.gram2 < maxGram) {
               const g2 = `${I.indexStat.gram[gn-2]}${I.indexStat.gram[gn-1]}`;
               if (!I.index.gram2[g2]) {
                  I.index.gram2[g2] = [];
                  I.audit.gram2 ++;
               }
               I.index.gram2[g2].push(I.indexStat.cur - Buffer.from(g2).length);
            }
            */
            if (gn >= 3 && I.audit.gram3 < maxGram) {
               const g3 = `${I.indexStat.gram[gn-3]}${I.indexStat.gram[gn-2]}${I.indexStat.gram[gn-1]}`;
               if (!I.index.gram3[g3]) {
                  I.index.gram3[g3] = [];
                  I.audit.gram3 ++;
               }
               I.index.gram3[g3].push(I.indexStat.cur - Buffer.from(g3).length);
            }
         }
         next();
      },
      decodeStrings: false,
      encoding: 'utf8',
   });
}

async function buildTextFileTriGramIndex(filenameOrStream, maxGram) {
   return new Promise((r, e) => {
      const externalStream = !(
         typeof filenameOrStream === 'string' ||
         filenameOrStream instanceof String
      );
      const S = (
         externalStream?
         filenameOrStream:
         i_fs.createReadStream(filenameOrStream).setEncoding('utf-8')
      );
      const I = {
         indexStat: { cur: 0, gram: [] },
         index: { gram2: {}, gram3: {} },
         audit: { gram2: 0, gram3: 0 },
         external: {
            binary: false,
            fn: () => {
               if (!externalStream) S.close();
               T.end();
               e('binary');
            }
         }
      }
      const T = buildIndexer(I, maxGram || MAX_GRAM_NUM);
      S.pipe(T);
      S.on('error', (err) => e(err) );
      T.on('error', (err) => e(err) );
      if (!externalStream) S.on('finish', () => S.close());
      T.on('finish', () => I.external.binary || r(I));
   });
}

if (require.main === module) {
   // usage example
   buildTextFileTriGramIndex(process.argv[2], process.argv[3]).then((I) => {
      console.log(JSON.stringify(I.index), I.audit);
   }, (err) => {
      if (err === 'binary') console.error('[!] binary file');
      else console.error(err);
   });
}


module.exports = {
   api: { buildTextFileTriGramIndex, }
}
