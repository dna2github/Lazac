const fs = require('fs');
const path = require('path');
const tokenizer = require('./parser/tokenizer');
const log_tokenizer = require('./parser/log');

const walker = require('./indexer/walker');
const client = require('./indexer/client');

let filename = process.argv[2] || 'test.js' && 'samples/test.c';
let ext = process.argv[3];
let tokens = null;

let text = fs.readFileSync(filename).toString();
if (ext) {
   switch(ext) {
      case 'log': tokens = new log_tokenizer.BuildLogTokenizer().process(text); break;
   }
} else {
   ext = path.extname(filename);
   switch (ext) {
      case '.c':
      case '.cc':
      case '.cpp':
      case '.h':
      case '.hh':
      case '.hpp': tokens = new tokenizer.CTokenizer().process(text); break;
      case '.m':
      case '.mm': tokens = new tokenizer.ObjectiveCTokenizer().process(text); break;
      case '.java': tokens = new tokenizer.JavaTokenizer().process(text); break;
      case '.cs': tokens = new tokenizer.CsharpTokenizer().process(text); break;
      case '.go': tokens = new tokenizer.GoTokenizer().process(text); break;
      case '.js': tokens = new tokenizer.JavaScriptTokenizer().process(text); break;
      case '.py': tokens = new tokenizer.PythonTokenizer().process(text); break;
      case '.rb': tokens = new tokenizer.RubyTokenizer().process(text); break;
      default: tokens = new tokenizer.WordTokenizer().process(text);
   }
}

// test for common comment and string tokenizer
/* define c style (multiple)' line comment */
console.log(JSON.stringify(tokens, null, 3));
