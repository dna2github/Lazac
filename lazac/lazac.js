const i_fs = require('fs');
const i_path = require('path');
const i_storage = require('../storage');
const i_tokenizer = require('../parser/tokenizer');
const i_string_index = require('../indexer/string_index');
const i_utils = require('../utils');

function tokenize(filename) {
   let tokens;
   let ext = i_path.extname(filename);
   let text = i_fs.readFileSync(filename).toString();
   switch (ext) {
      case '.c':
      case '.cc':
      case '.cpp':
      case '.h':
      case '.hh':
      case '.hpp': tokens = new i_tokenizer.CTokenizer().process(text); break;
      case '.m':
      case '.mm': tokens = new i_tokenizer.ObjectiveCTokenizer().process(text); break;
      case '.java': tokens = new i_tokenizer.JavaTokenizer().process(text); break;
      case '.cs': tokens = new i_tokenizer.CsharpTokenizer().process(text); break;
      case '.go': tokens = new i_tokenizer.GoTokenizer().process(text); break;
      case '.js': tokens = new i_tokenizer.JavaScriptTokenizer().process(text); break;
      case '.py': tokens = new i_tokenizer.PythonTokenizer().process(text); break;
      case '.rb': tokens = new i_tokenizer.RubyTokenizer().process(text); break;
      // default: tokens = new tokenizer.WordTokenizer().process(text);
      default: tokens = null;
   }
   return tokens;
}

function generate_token_filename(lazac_dir, id) {
   let d = id % 100, c = ~~(id / 100), b = ~~(c / 100), a = ~~(b / 100);
   c %= 100;
   b %= 100;
   a %= 100;
   return i_path.join(lazac_dir, `${a}`, `${b}`, `${c}`, `${d}.json`);
}

const lazac_ignore = ['.lazac', '.git', 'node_modules', '.env', 'gems'];
const base_dir = i_path.resolve(process.argv[2]);
const lazac_dir = i_path.join(base_dir, '.lazac');
i_storage.make_directory(i_path.join(base_dir, '.lazac'));
const files = i_storage.list_files(base_dir, (name) => {
   if (lazac_ignore.indexOf(name) >= 0) return false;
   return true;
}).filter((filename) => filename.endsWith('.rb'));

let filename_map = {};
let map_filename = i_path.join(lazac_dir, 'map.json');
if (i_fs.existsSync(map_filename)) {
   filename_map = JSON.parse(i_fs.readFileSync(map_filename));
}
let file_index = 1;
if (Object.values(filename_map).length > 0) {
   file_index = Object.values(filename_map).map((filename) => {
      let d = i_path.basename(filename), c = i_path.dirname(filename);
      let b = i_path.dirname(c), a = i_path.dirname(b);
      c = i_path.basename(c);
      b = i_path.basename(b);
      a = i_path.basename(a);
      d = d.split('.')[0];
      return parseInt(a)*1000000 + parseInt(b) * 10000 + parseInt(c)*100 + parseInt(d);
   }).reduce((x,y) => x>y?x:y)+1;
}

let index_dir = i_path.join(lazac_dir, 'string_index');
i_storage.make_directory(index_dir);
let engine = i_string_index.createEngine();

console.log('Find ' + files.length + ' files ...');
files.forEach((filename) => {
   let repo_filename = filename.substring(base_dir.length);
   let token_real_filename;
   if (filename_map[repo_filename]) {
      token_real_filename = i_path.join(base_dir, filename_map[repo_filename].substring(1));
   } else {
      token_real_filename = generate_token_filename(lazac_dir, file_index++);
   }
   console.log('  - processing "' + filename + '"');
   i_storage.make_directory(i_path.dirname(token_real_filename));
   let token_filename = token_real_filename.substring(base_dir.length);
   filename_map[repo_filename] = token_filename;
   let tokens = tokenize(filename);
   let line_no = 1;
   tokens.forEach((token, token_index) => {
      line_no += token.token.split('\n').length-1;
      if (token.tag !== i_utils.TAG_STRING) return;
      i_string_index.addDocument(engine, {
         index: token_index,
         filename: repo_filename,
         line_no: line_no,
         value: token.token
      }, i_string_index.tokenize(token.token));
   });
   i_fs.writeFileSync(token_real_filename, JSON.stringify(tokens));
});

i_string_index.writeEngine(index_dir, engine);
i_fs.writeFileSync(i_path.join(lazac_dir, 'map.json'), JSON.stringify(filename_map));
console.log('Done.');
