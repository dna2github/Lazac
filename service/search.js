const i_path = require('path');
const i_fs = require('fs');
const i_cure = require('../indexer/cure');
const i_string_index = require('../indexer/string_index');

function lcs_dense(t1, t2, dense) {
   let i, n;
   n = t1.length;

   if (!dense.h) dense.h = 0;
   dense.h ++;

   if (!dense.route) {
      dense.route = [ [0, 0] ];
   }

   for (i = 1; i < n; i++) {
      if (t2[i] > t1[i] && t2[i] > t2[i-1]) {
         if (!dense.route[t2[i]]) {
            dense.route[t2[i]] = [dense.h, i];
         } else {
            let t = dense.route[t2[i]];
            let r1 = t[0]>t[1]?t[1]/t[0]:t[0]/t[1];
            let r2 = dense.h>i?i/dense.h:dense.h/i;
            if (r1 < r2) {
               t[0] = dense.h;
               t[1] = i;
            }
         }
      }
   }
}

function lcs_dense_rate(dense) {
   let sum = 0, count = 0;
   for (let i = 2, n = dense.route.length; i < n; i++) {
      let a = dense.route[i];
      let b = dense.route[i-1];
      sum += (a[0] - b[0]) + (a[1] - b[1]);
      count ++;
   }
   if (count === 0) return 1;
   return 2 * count / sum;
}

function lcs(a, b) {
   if (!a || !b) return 0;
   if (a.length > b.length) {
      let tmp = a;
      a = b;
      b = tmp;
   }
   let t1 = [], t2 = [0], dense = {};
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
      lcs_dense(t1, t2, dense);
      t1 = t2;
      t2 = [0];
   }
   return {
      value: t1[t1.length-1],
      dense: lcs_dense_rate(dense)
   };
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

function search_line(engine, line, topN) {
   let tokens = i_string_index.tokenize(i_cure.cure(line));
   let doc_set = i_string_index.search(engine, tokens);
   score(engine, tokens, doc_set);
   doc_set = Object.keys(doc_set).map((doc_id) => {
      return {
         id: doc_id,
         score: doc_set[doc_id],
         meta: engine.document[doc_id].meta
      };
   }).sort((x, y) => y.score - x.score).slice(0, topN);

   doc_set.forEach((doc) => {
      let rate = {value: 0, dense: 0};
      // lcs(value, query) / query * ( query / value )
      if (line && doc.meta.value) {
         // rate = lcs(doc.meta.value, line) / (line.length + doc.meta.value.length);
         rate = lcs(doc.meta.value, line);
         /*
         // assume one line mapping to one string
         if (line.length > doc.meta.value.length) {
            rate *= doc.meta.value.length / line.length;
         } else {
            rate *= line.length / doc.meta.value.length;
         }
         */
      }
      doc.dense = rate.dense;
      doc.score *= rate.value / (line.length + doc.meta.value.length);
      if (doc.meta.value.indexOf('\n') >= 0) {
         doc.score /= doc.meta.value.split('\n').length;
      }
   });
   doc_set = doc_set.sort((x, y) => y.score - x.score).slice(0, 3);
   let avg = 0;
   if (doc_set.length) avg = doc_set.map((x) => x.score).reduce((x,y) => x+y) / doc_set.length;
   // warning: avg is not used.
   return doc_set;
}

function load_engine_into_memory(base_dir) {
   let index_dir = i_path.join(base_dir, '.lazac', 'string_index');
   let engine = i_string_index.readEngine(index_dir);
   return engine;
}

function query(engine, line) {
   // lines.split('\n');
   return search_line(engine, line, 500);
}

module.exports = {
   load_engine_into_memory,
   query
};