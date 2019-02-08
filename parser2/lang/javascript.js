const i_common = require('../common');
const i_extractor = require('../extractor');
const i_decorator = require('../decorator');

const es5_extract_feature = {
   '"': [extract_string],
   '`': [extract_raw_string],
   '\'': [extract_char],
   '/': [extract_line_comment, extract_multiline_comment, extract_regex_generator()]
};

function extract_string(env) {
   return i_extractor.extract_string(env, '"', '"', '\\');
}

function extract_raw_string(env) {
   return i_extractor.extract_string(env, '`', '`', '\\');
}

function extract_char(env) {
   return i_extractor.extract_string(env, '\'', '\'', '\\');
}

function extract_line_comment(env) {
   return i_extractor.extract_comment(env, '//', '\n');
}

function extract_multiline_comment(env) {
   return i_extractor.extract_comment(env, '/*', '*/');
}

function extract_regex_generator() {
   return i_extractor.extract_tokens_feature_generator(
      // e.g. return /test/.test(string);
      i_extractor.extract_regex, [['return']]
   );
}

const javascript_combinations = [
   '**', '++', '--', '+=', '-=', '*=', '/=', '%=', '==', '===',
   '!=', '!==', '>=', '<=', '=>', '&&', '||', '<<', '>>', '>>>',
   '&=', '|=', '^=', '<<=', '>>=', '>>>=', '...',
];

function merge_$(env) {
   let result = [];
   let i = 0, n = env.tokens.length;
   for (; i < n; i ++) {
      let x = env.tokens[i];
      if (x.token !== '$') {
         result.push(x);
         continue;
      }
      let mod = x;
      let group = [];
      let j = i+1;
      for (;j < n; j++) {
         let y = env.tokens[j];
         if (y.token !== '$' && i_common.stops.indexOf(y.token) >= 0) {
            break;
         }
         if (y.tag) break;
         group.push(y);
      }
      if (i > 0) {
         let y = env.tokens[i-1];
         if (i_common.stops.indexOf(y.token) < 0 && !y.tag) {
            group.unshift(x);
            mod = y;
         }
      }
      mod.token += group.map((x) => x.token).join('');
      if (mod === x) {
         result.push(x);
      }
      i = j - 1;
   }
   env.tokens = result;
   return result;
}

function parse(env) {
   env.cursor = 0;
   i_extractor.extract_tokens(env, es5_extract_feature);
   i_extractor.merge_tokens(env, javascript_combinations);
   merge_$(env);
   i_decorator.decorate_bracket(env);
   return env.tokens;
}

const i_fs = require('fs');
let filename = process.argv[2];
let text = i_fs.readFileSync(filename).toString();
let tokens = parse({text: text});
console.log(JSON.stringify(tokens, null, 3));
