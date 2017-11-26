
const common_stops = [
   '~', '`', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')',
   '-', '_', '=', '+', '{', '}', '[', ']', '\\', '|', ':', ';',
   '"', '\'', ',', '.', '<', '>', '/', '?', ' ', '\t', '\r', '\n'
];

const TAG_STRING = 'string';
const TAG_COMMENT = 'comment';
const TAG_REGEX = 'regex';
const TAG_INDENT = 'indent';

function act_concat(output, x, env) {
   let m = last(output);
   m.token += x.token;
}

function act_push_origin (output, x, env) {
   output.push(x);
}

function factory_text_cmp(expect, len) {
   if (len === 1) {
      return (x, env) => {
         return text_cmp_1(expect, env.input, env.input_i);
      }
   } else {
      return (x, env) => {
         return text_cmp_n(expect, env.input, env.input_i, len);
      }
   }
}

function text_cmp_1(expect, input, index) {
   return expect === input[index].token;
}

function text_cmp_n(expect, input, index, len) {
   return expect === input.slice(
      index, index + len).map((z) => z.token).join('');
}

function always() {
   return true;
}

function arrindex(array, index, key) {
   let obj = array[index];
   if (!obj) return null;
   if (key) return obj[key];
   return obj;
}

function last(array, key) {
   return arrindex(array, array.length-1, key);
}

function next(array, index, key) {
   return arrindex(array, index+1, key);
}

function prev(array, index, key) {
   return arrindex(array, index-1, key);
}

function search_prev(array, index, options) {
   if (!options) options = {};
   let skip = options.skip;
   let stop = options.stop;
   let key = options.key;
   if (skip) {
      while (index >= 0) {
         let value = array[index];
         if (key) value = value[key];
         if (contains(skip, value)) {
            index --;
         }
         return index;
      }
   } else if(stop) {
      while (index >= 0) {
         let value = array[index];
         if (key) value = value[key];
         if (contains(stop, value)) {
            return index;
         }
         index --;
      }
   }
   return -1;
}

function search_next(array, index, options) {
   if (!options) options = {};
   let skip = options.skip;
   let stop = options.stop;
   let key = options.key;
   let n = array.length;
   if (skip) {
      while (index < n) {
         let value = array[index];
         if (key) value = value[key];
         if (contains(skip, value)) {
            index ++;
         }
         return index;
      }
   } else if(stop) {
      while (index < n) {
         let value = array[index];
         if (key) value = value[key];
         if (contains(stop, value)) {
            return index;
         }
         index ++;
      }
   }
   return -1;
}

function contains(array, value) {
   return array.indexOf(value) >= 0;
}

module.exports = {
   TAG_STRING,
   TAG_COMMENT,
   TAG_REGEX,
   TAG_INDENT,
   common_stops,
   act_concat,
   act_push_origin,
   factory_text_cmp,
   text_cmp_1,
   text_cmp_n,
   always,
   arrindex,
   last,
   next,
   prev,
   search_prev,
   search_next,
   contains
};