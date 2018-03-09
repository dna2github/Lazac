const i_fs = require('fs');
const i_path = require('path');

const common_stops = [
   '~', '`', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')',
   '-', '_', '=', '+', '{', '}', '[', ']', '\\', '|', ':', ';',
   '"', '\'', ',', '.', '<', '>', '/', '?', ' ', '\t', '\r', '\n'
];

function tokenize(text, keep_stops) {
   let output = [];
   let n = text.length;
   let last = 0;
   for (let i = 0; i < n; i++) {
      let ch = text.charAt(i);
      if (common_stops.indexOf(ch) >= 0) {
         if (last < i) {
            output.push(text.substring(last, i));
         }
         if (keep_stops) output.push(ch);
         last = i + 1;
      }
   }
   if (last < n) output.push(text.substring(last));
   return output;
}

function createEngine() {
   return {
      term_auto_id: 1,
      doc_auto_id: 1,
      dictionary: {},
      term_id_map: {},
      document: {},
      reverse_index: {}
   }
}

function addDocument(engine, meta, tokens) {
   let docobj = {
      id: engine.doc_auto_id ++,
      meta: meta,
      tf_vector: {}
   };
   tokens.forEach((term) => {
      let termobj = engine.dictionary[engine.term_id_map[term]];
      if (!termobj) {
         // new term
         termobj = {
            id: engine.term_auto_id ++,
            term: term,
            df: 0
         };
         engine.dictionary[termobj.id] = termobj;
         engine.term_id_map[term] = termobj.id;
      }
      if (!docobj.tf_vector[termobj.id]) docobj.tf_vector[termobj.id] = 0;
      docobj.tf_vector[termobj.id] ++;
   });
   Object.keys(docobj.tf_vector).forEach((term_id) => {
      engine.dictionary[term_id].df ++;
      if (!engine.reverse_index[term_id]) engine.reverse_index[term_id] = [];
      engine.reverse_index[term_id].push(docobj.id);
   });
   engine.document[docobj.id] = docobj;
   return docobj;
}

function search(engine, tokens) {
   let doc_set = {};
   tokens.forEach((term) => {
      let term_id = engine.term_id_map[term];
      let doc_subset = engine.reverse_index[term_id];
      if (!doc_subset) return;
      doc_subset.forEach((doc_id) => {
         doc_set[doc_id] = 1;
      });
   });
   return doc_set;
}

function score(engine, tokens, doc_set) {
   tokens = tokens.map((term) => engine.term_id_map[term]).filter((id) => (id > 0));
   let doc_n = Object.keys(engine.document).length;
   let result_max = -Infinity, result_min = Infinity;
   Object.keys(doc_set).forEach((doc_id) => {
      let docobj = engine.document[doc_id];
      let doc_term_n = Object.values(docobj.tf_vector).reduce((x,y) => x+y); /* not used */
      let result = tokens.map((term_id) => {
         if (!docobj.tf_vector[term_id]) return 0;
         let value = (
            (1+Math.log(docobj.tf_vector[term_id])) *
            Math.log(doc_n/engine.dictionary[term_id].df)
         );
         if (value > result_max) result_max = value;
         if (value < result_min) result_min = value;
         return value;
      }).reduce((x,y) => x+y);
      doc_set[doc_id] = result;
   });
   return doc_set;
}

/* {id, term, df} */
function readDictionary(dir) {
   let filename = i_path.join(dir, 'dictionary.json');
   return JSON.parse(i_fs.readFileSync(filename));
}

/* {id, meta, tf_vec} */
function readDocument(dir) {
   let filename = i_path.join(dir, 'document.json');
   return JSON.parse(i_fs.readFileSync(filename));
}

/* {term_id: [doc_id]} */
function readReverseIndex(dir) {
   let filename = i_path.join(dir, 'reverse_index.json');
   return JSON.parse(i_fs.readFileSync(filename));
}

function readEngine(dir) {
   let engine = createEngine();
   engine.dictionary = readDictionary(dir);
   engine.document = readDocument(dir);
   engine.reverse_index = readReverseIndex(dir);
   engine.term_auto_id = 1;
   engine.doc_auto_id = 1;
   engine.term_id_map = {};
   Object.keys(engine.dictionary).forEach((id) => {
      id = parseInt(id);
      engine.term_id_map[engine.dictionary[id].term] = id;
      if (engine.term_auto_id <= id) engine.term_auto_id = id+1;
   });
   Object.keys(engine.document).forEach((id) => {
      id = parseInt(id);
      if (engine.doc_auto_id <= id) engine.doc_auto_id = id+1;
   });
   return engine;
}

function writeDictionary(dir, obj) {
   let filename = i_path.join(dir, 'dictionary.json');
   i_fs.writeFileSync(filename, JSON.stringify(obj));
}

function writeDocument(dir, obj) {
   let filename = i_path.join(dir, 'document.json');
   i_fs.writeFileSync(filename, JSON.stringify(obj));
}

function writeReverseIndex(dir, obj) {
   let filename = i_path.join(dir, 'reverse_index.json');
   i_fs.writeFileSync(filename, JSON.stringify(obj));
}

function writeEngine(dir, engine) {
   writeDictionary(dir, engine.dictionary);
   writeDocument(dir, engine.document);
   writeReverseIndex(dir, engine.reverse_index);
}

module.exports = {
   tokenize,
   addDocument,
   createEngine,
   readEngine,
   writeEngine,
   search,
   score
};