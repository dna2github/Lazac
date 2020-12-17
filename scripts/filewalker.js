const i_fs = require('fs');
const i_path = require('path');

const fn = process.argv[2] === '-'?null:require(process.argv[2]);
const srcdir = process.argv[3]?i_path.resolve(process.argv[3]):null;
const ignore = process.argv.slice(4);
if(!ignore.includes('.lazac')) ignore.push('.lazac');

function printFile(path, out) {
   try {
      // do not list files in symlinked folder
      const stat = i_fs.lstatSync(path);
      const basename = i_path.basename(path);
      if (ignore.includes(basename)) return;
      if (stat.isDirectory()) {
         out.push(path);
      } else {
         const showname = path.substring(srcdir.length);
         const flag = stat.isFile()?'F':'D';
         if (fn && fn.one) {
            fn.one(Math.floor(stat.mtimeMs), flag, stat.size, showname, srcdir);
         } else {
            console.log(Math.floor(stat.mtimeMs), flag, stat.size, showname);
         }
      }
   } catch (err) {
      console.error(`filewalker#printFile@${path}`, err);
   }
}

function printFolder(path) {
   let r = [];
   try {
      const files = i_fs.readdirSync(path);
      if (files.length) files.sort((a, b) => a>b?1:-1);
      files.forEach((name) => {
         printFile(i_path.join(path, name), r);
      });
   } catch (err) {
      console.error(`filewalker#printFolder@${path}`, err);
   }
   return r;
}

function main() {
   if (!srcdir) {
      console.log('node filewalker.js <srcdir> <ignore>...');
      process.exit(1);
      return;
   }

   if (!i_fs.existsSync(srcdir)) {
      console.log('invalid source path');
      process.exit(-1);
      return;
   }

   const todo = [srcdir];
   while(todo.length) {
      const onedir = todo.shift();
      const next = printFolder(onedir);
      next.forEach((dir) => todo.push(dir));
   }
   if (fn && fn.done) fn.done();
}

main();
