const fs = require('fs');
const path = require('path');

const parser = {
   c: require('./parser/lang/c'),
   cpp: require('./parser/lang/cpp'),
   java: require('./parser/lang/java'),
   csharp: require('./parser/lang/csharp'),
   go: require('./parser/lang/go'),
   javascript: require('./parser/lang/javascript'),
   python: require('./parser/lang/python'),
   ruby: require('./parser/lang/ruby'),
};

let filename = process.argv[2];
let ext = process.argv[3];
let tokens = null;

let text = fs.readFileSync(filename).toString();
if (!ext) {
   ext = path.extname(filename);
}
try {
   switch (ext) {
      case '.c':
      case '.h': tokens = parser.c.parse(text); break;
      case '.cc':
      case '.hh':
      case '.cpp':
      case '.hpp': tokens = parser.cpp.parse(text); break;
      case '.java': tokens = parser.java.parse(text); break;
      case '.cs': tokens = parser.csharp.parse(text); break;
      case '.go': tokens = parser.go.parse(text); break;
      case '.js': tokens = parser.javascript.parse(text); break;
      case '.py': tokens = parser.python.parse(text); break;
      case '.rb': tokens = parser.ruby.parse(text); break;
      default: tokens = [];
   }
   console.log(JSON.stringify(tokens,null, 3));
} catch(e) {
   console.error('>>>>>', filename, e);
}
