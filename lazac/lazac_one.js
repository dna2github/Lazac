const i_fs = require('fs');
const i_path = require('path');
const i_tokenizer = require('../parser/tokenizer');

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

let filename = process.argv[2];
let tokens = tokenize(filename);
let line_no = 1;
tokens = tokens.map((token, token_index) => {
   line_no += token.token.split('\n').length-1;
   // if (token.tag !== i_utils.TAG_STRING) return;
   return {
      index: token_index,
      line_no: line_no,
      value: token.token,
      tag: token.tag,
   };
});
console.log(JSON.stringify(tokens, null, 3));