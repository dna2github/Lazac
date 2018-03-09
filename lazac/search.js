const i_path = require('path');
const i_string_index = require('../indexer/string_index.js');

let base_dir = process.argv[2];
let line = process.argv[3];
let index_dir = i_path.join(base_dir, '.lazac', 'string_index');

let engine = i_string_index.readEngine(index_dir);
let tokens = i_string_index.tokenize(line);
let doc_set = i_string_index.search(engine, tokens);
i_string_index.score(engine, tokens, doc_set);
doc_set = Object.keys(doc_set).map((doc_id) => {
   return {
      score: doc_set[doc_id],
      document: engine.document[doc_id].meta
   };
}).sort((x, y) => y.score - x.score).slice(0, 10);
console.log(JSON.stringify(doc_set, null, 3));