const i_path = require('path');
const i_fs = require('fs');
const i_string_index = require('../indexer/string_index.js');

let base_dir = process.argv[2];
let query = process.argv[3];
if (i_fs.existsSync(query)) {
   query = i_fs.readFileSync(query).toString();
}
let index_dir = i_path.join(base_dir, '.lazac', 'string_index');

let map_filename = i_path.join(base_dir, '.lazac', 'map.json');
let token_filename_map = JSON.parse(i_fs.readFileSync(map_filename));

function get_string(doc, map) {
   let filename = doc.meta.filename;
   let token_filename = i_path.join(base_dir, map[filename]);
   if (!i_fs.existsSync(token_filename)) return;
   let tokens = JSON.parse(i_fs.readFileSync(token_filename));
   doc.meta.value = tokens[doc.meta.index].token;
}

function lcs(a, b) {
   if (!a || !b) return 0;
   if (a.length > b.length) {
      let tmp = a;
      a = b;
      b = tmp;
   }
   let t1 = [], t2 = [0];
   for (let i = b.length; i >= 0; i--) {
      t1.push(0);
   }
   for (let i = 0, n = a.length; i < n; i++) {
      for (let j = 0, m = b.length; j < m; j++) {
         if (a.charAt(i) === b.charAt(j)) {
            t2.push(t1[j+1]+1);
         } else {
            let v1 = t2[j], v2 = t1[j+1];
            t2.push(v1>v2?v1:v2);
         }
      }
      t1 = t2;
      t2 = [0];
   }
   return t1[t1.length-1];
}

function search_line(engine, line, topN) {
   let tokens = i_string_index.tokenize(line);
   let doc_set = i_string_index.search(engine, tokens);
   i_string_index.score(engine, tokens, doc_set);
   doc_set = Object.keys(doc_set).map((doc_id) => {
      return {
         id: doc_id,
         score: doc_set[doc_id],
         meta: engine.document[doc_id].meta
      };
   }).sort((x, y) => y.score - x.score).slice(0, topN);

   doc_set.forEach((doc) => {
      // if string not stored in doc meta
      // get_string(doc, token_filename_map);
      let rate = 0;
      // lcs(value, query) / query * ( query / value )
      if (line && doc.meta.value) {
         rate = lcs(doc.meta.value, line) / (line.length + doc.meta.value.length);
         /*
         // assume one line mapping to one string
         if (line.length > doc.meta.value.length) {
            rate *= doc.meta.value.length / line.length;
         } else {
            rate *= line.length / doc.meta.value.length;
         }
         */
      }
      doc.score *= rate;
   });
   doc_set = doc_set.sort((x, y) => y.score - x.score).slice(0, 3);
   let avg = 0;
   if (doc_set.length) avg = doc_set.map((x) => x.score).reduce((x,y) => x+y) / doc_set.length;
   console.log('------------------------------', avg);
   console.log(line);
   console.log(JSON.stringify(doc_set, null, 3));
   console.log('==============================');
}

let engine = i_string_index.readEngine(index_dir);
query.split('\n').forEach((line) => {
   if (line) search_line(engine, line, 50);
});