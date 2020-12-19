const i_spawn = require('child_process').spawn;

const i_filehash = require('./filehash').api;
const i_fileindexer = require('./fileindexer').api;

async function exec(cmd, args) {
   return new Promise((r, e) => {
      const p = i_spawn(cmd, args);
      r(p);
   });
}

// print contents
// node exec.js -- git -C /path/to/file show main:README.md
// print 3-gram indexes
// node exec.js index -- git -C /path/to/file show main:README.md
// print hash
// node exec.js hash -- git -C /path/to/file show main:README.md

const i = process.argv.indexOf('--');
if (i > 0) {
   const action = process.argv[2];
   const cmd = process.argv[i+1];
   const args = process.argv.slice(i+2);
   exec(cmd, args).then((p) => {
      switch(action) {
      case 'hash':
         i_filehash.getHash(p.stdout).then((hash) => {
            console.log(hash);
         });
         break;
      case 'index':
         p.stdout.setEncoding('utf-8');
         i_fileindexer.buildTextFileTriGramIndex(p.stdout).then(
            (meta) => {
               console.log(JSON.stringify({
                  index: meta.index.gram3,
                  count: meta.audit.gram3,
               }));
            },
            (err) => {
               if (err === 'binary') console.log('{"error": "binary"}');
            }
         );
      default:
         p.stdout.pipe(process.stdout);
         p.stderr.pipe(process.stderr);
      }
   });
}
