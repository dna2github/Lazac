const i_readline = require('readline');
const i_fs = require('fs');

async function readTextFileLineByLine(filename, fn, isAsync) {
   return new Promise((r, e) => {
      const stream = i_fs.createReadStream(filename);
      const rl = i_readline.createInterface({ input: stream, output: null });
      const env = { busy: false, binary: false, queue: [], lineno: 0, closed: false };
      rl.on('line', (line) => {
         if (line.indexOf('\0') >= 0) {
            env.binary = true;
            env.queue = [];
            stream.close();
            rl.close();
            env.closed = true;
            return;
         }
         env.queue.push(line);
         processLine(env, fn, isAsync);
      });
      rl.on('close', () => {
         rl.close();
         env.closed = true;
         processLine(env, fn, isAsync, r);
      });
      rl.on('error', (err) => {
         e(err);
      });
   });
}

async function processLine(env, fn, isAsync, resolveFn) {
   if (!env.queue.length) {
      if (env.closed) resolveFn && resolveFn(env.binary);
      return;
   }
   if (env.binary) return;
   if (env.busy) return;
   env.busy = true;
   const line = env.queue.shift();
   env.lineno ++;
   if (isAsync) {
      fn && await fn(line, env.lineno);
   } else {
      fn && fn(line, env.lineno);
   }
   env.busy = false;
   processLine(env, fn, isAsync);
}

/*
usage example:

readTextFileLineByLine(process.argv[2], (line, no) => {
   return new Promise((r) => {
      setTimeout(() => {
         console.log(('0000' + no).slice(-4), line);
         r();
      }, ~~(Math.random()*200));
   });
}, true).then((isBinaryFile) => {
   if (isBinaryFile) console.log('[!] it is binary file');
}, (err) => {
   console.error(err);
});
*/

module.exports = {
   api: { readTextFileLineByLine, }
};
