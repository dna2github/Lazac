
const common_stops = [
   '~', '`', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')',
   '-', '_', '=', '+', '{', '}', '[', ']', '\\', '|', ':', ';',
   '"', '\'', ',', '.', '<', '>', '/', '?', ' ', '\t', '\r', '\n'
];

const TAG_OTHER = 'other';
const TAG_STRING = 'string';
const TAG_COMMENT = 'comment';
const TAG_REGEX = 'regex';
const TAG_INDENT = 'indent';

const SEARCH_SKIPSPACE = { skip: [' ', '\t'], key: 'token' };
const SEARCH_SKIPSPACEN = { skip: [' ', '\t', '\n', '\r'], key: 'token' };

function act_concat(output, x) {
   let m = last(output);
   m.token += x.token;
}

function act_push_origin (output, x) {
   output.push(x);
}

function act_push_origin_range (output, input, start, end) {
   for (let i = start; i <= end; i++) {
      output.push(input[i]);
   }
   return end - start + 1;
}

function cmp_match_array(longarr, offset, matcharr, key1, key2) {
   let n = offset + matcharr.length;
   if (n > longarr.length) n = longarr.length;
   if (longarr[offset].token === '#') {
   }
   let i = 0, j = offset;
   for (; j < n; i++, j++) {
      let a = longarr[j], b = matcharr[i];
      if (key1) a = a[key1];
      if (key2) b = b[key2];
      if (a === b) continue;
      return false;
   }
   return true;
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
   if (Array.isArray(expect)) {
      for(let i = 0, n = expect.length; i < n; i++) {
         if (expect[i] === input[index].token) return true;
      }
   }
   return expect === input[index].token;
}

function text_cmp_n(expect, input, index, len) {
   if (Array.isArray(expect)) {
      for(let i = 0, n = expect.length; i < n; i++) {
         if (expect[i] === input.slice(
            index, index+len).map((z) => z.token).join('')) return true;
      }
   }
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
         if (!contains(skip, value)) {
            return index;
         }
         index --;
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
            continue;
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

function search_pair_next(array, index, options) {
   if (!options) options = {};
   let key = options.key;
   let n = array.length;
   let left = options.left;
   let right = options.right;
   let deep = 0;
   while (index < n) {
      let value = array[index];
      if (key) value = value[key];
      if (value === left) {
         deep ++;
      } else if (value === right) {
         deep --;
      }
      if (!deep) break;
      index ++;
   }
   if (deep) return -1;
   return index;
}

function search_pair_prev(array, index, options) {
   if (!options) options = {};
   let key = options.key;
   let left = options.left;
   let right = options.right;
   let deep = 0;
   while (index >= 0) {
      let value = array[index];
      if (key) value = value[key];
      if (value === right) {
         deep ++;
      } else if (value === left) {
         deep --;
      }
      if (!deep) break;
      index --;
   }
   if (deep) return -1;
   return index;
}

function contains(array, value) {
   return array.indexOf(value) >= 0;
}

module.exports = {
   TAG_OTHER,
   TAG_STRING,
   TAG_COMMENT,
   TAG_REGEX,
   TAG_INDENT,
   SEARCH_SKIPSPACE,
   SEARCH_SKIPSPACEN,
   common_stops,
   act_concat,
   act_push_origin,
   cmp_match_array,
   factory_text_cmp,
   text_cmp_1,
   text_cmp_n,
   always,
   index: arrindex,
   last,
   next,
   prev,
   search_prev,
   search_next,
   search_pair_prev,
   search_pair_next,
   contains
};