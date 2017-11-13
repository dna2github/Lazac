
const common_stops = [
   '~', '`', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')',
   '-', '_', '=', '+', '{', '}', '[', ']', '\\', '|', ':', ';',
   '"', '\'', ',', '.', '<', '>', '/', '?', ' ', '\t', '\r', '\n'
];

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

function last(array) {
   return array[array.length - 1];
}

function contains(array, value) {
   return array.indexOf(value) >= 0;
}

module.exports = {
   common_stops,
   act_concat,
   act_push_origin,
   factory_text_cmp,
   text_cmp_1,
   text_cmp_n,
   always,
   last,
   contains
};