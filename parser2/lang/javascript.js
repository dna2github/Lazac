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

const javascript_keywords = [
   // ref:
   // - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar
   'enum',
   'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
   'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'function', 'if',
   'import', 'in', 'instanceof', 'new', 'return', 'super', 'switch', 'this', 'throw',
   'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
   /* future reserved */
   'implements', 'package', 'public', 'interface', 'private', 'static', 'let', 'protected',
   'await', 'async',
   'abstract', 'float', 'synchronized', 'boolean', 'goto', 'throws', 'byte', 'int',
   'transient', 'char', 'long', 'volatile', 'double', 'native', 'final', 'short',
   'null', 'true', 'false',
];

const javascript_combinations = [
   '**', '++', '--', '+=', '-=', '*=', '/=', '%=', '==', '===',
   '!=', '!==', '>=', '<=', '=>', '&&', '||', '<<', '>>', '>>>',
   '&=', '|=', '^=', '<<=', '>>=', '>>>=', '...',
];

const javascript_decorate_feature = {
   'class': [decorate_class],
   '{': [decorate_function],
   '}': [skip_block_bracket],
   '=>': [decorate_lambda_function],
   // TODO: this.#private_field
};

function skip_block_bracket(env) {
   if (!env.indefable) env.indefable = [];
   env.indefable.pop();
   return 1;
}

function decorate_class(env) {
   if (!env.indefable) env.indefable = [];
   let class_token = env.tokens[env.cursor];
   let st = env.cursor, ed = st;
   let name = [st, st];
   // a.class = 1
   st = i_common.search_prev_skip_spacen(env.tokens, st-1);
   let token = env.tokens[st];
   let inherit = null;
   if (token && token.token === '.') return 0;

   name[0] = i_common.search_next_skip_spacen(env.tokens, name[0]+1);
   ed = name[0];
   token = env.tokens[ed];
   if (!token) return 0;
   if (token.token === '{') {
      name = null;
   } else {
      if (token.token === 'extends') {
         name = null;
      } else {
         name[1] = name[0] + 1;
         ed = i_common.search_next_skip_spacen(env.tokens, ed+1);
         token = env.tokens[ed];
      }
      if (token.token === 'extends') {
         ed = i_common.search_next_skip_spacen(env.tokens, ed+1);
         token = env.tokens[ed];
         inherit = [ed, ed];
         // class A extends {test: class B{} }['test'] {}
         do {
            if (!token) return 0;
            if (token.endIndex) ed = token.endIndex - 1;
            inherit[1] = ed+1;
            ed = i_common.search_next_skip_spacen(env.tokens, ed+1);
            token = env.tokens[ed];
         } while (token.token !== '{');
      }
   }
   if (token.token !== '{') return 0;
   class_token.tag = i_common.TAG_CLASS;
   class_token.startIndex = env.cursor;
   class_token.endIndex = token.endIndex;
   if (name) class_token.name = name;
   if (inherit) class_token.inherit = inherit;
   env.indefable.push('class');
   token.skip_class = true;
   return (name?name[1]:env.cursor) - env.cursor + 1;
}

const keyword_block = ['if', 'for', 'while', 'switch', 'try', 'catch'];
function decorate_function(env) {
   if (!env.indefable) env.indefable = [];
   let st = env.cursor;
   let token = env.tokens[st];
   let skip_key = null;
   if (token && token.skip_class) {
      skip_key = 'skip_class';
   }
   if (skip_key) {
      delete token[skip_key];
      return 1;
   }
   // function () {}
   // function name () {}
   // class A { name () {} }
   st = i_common.search_prev_skip_spacen(env.tokens, st-1);
   token = env.tokens[st];
   if (!token || token.token !== ')') {
      env.indefable.push('{');
      return 0;
   }
   let parameter = [st, st+1];
   st = i_common.search_prev(env.tokens, st-1, (x) => x.endIndex !== st+1);
   parameter[0] = st;
   st = i_common.search_prev_skip_spacen(env.tokens, st-1);
   let name = [st, st+1];
   token = env.tokens[st];
   if (!token) {
      env.indefable.push('{');
      return 0;
   }
   if (keyword_block.indexOf(token.token) >= 0) {
      env.indefable.push('{');
      return 0;
   }
   if (token.token === 'function') {
      name = null;
   } else if (env.indefable[env.indefable.length-1] !== 'class') {
      st = i_common.search_prev_skip_spacen(env.tokens, st-1);
   }
   let function_token = env.tokens[st];
   function_token.tag = i_common.TAG_FUNCTION;
   function_token.startIndex = st;
   function_token.endIndex = env.tokens[env.cursor].endIndex;
   function_token.parameter = parameter;
   if (name) function_token.name = name;
   env.indefable.push('function');
   return 1;
}

const lambda_express_bracket = ['(', '{', '['];
const lambda_express_end = [',', ')', '}', ']', ';'];
const lambda_express_nonend = [
   '+', '-', '&&', '||', '&', '|', '^', '%', '!', '*',
   '**', '?', ':', '<', '<<', '>', '>>', '<=', '>=',
   '==', '===', '!=', '!==', '.', '/', '\n',
];
function decorate_lambda_function(env) {
   let lambda_token = env.tokens[env.cursor];
   let parameter = [0, 0];
   let st = env.cursor, ed = st;
   st = i_common.search_prev_skip_spacen(env.tokens, st-1);
   let token = env.tokens[st];
   if (!token) return 0;
   if (token.token === ')') {
      parameter[0] = i_common.search_prev(env.tokens, st-1, (x) => x.token !== '(');
      parameter[1] = st + 1;
      st = parameter[0];
   } else {
      parameter[0] = st;
      parameter[1] = st + 1;
   }
   ed = i_common.search_next_skip_spacen(env.tokens, ed+1);
   token = env.tokens[ed];
   if (!token) return 0;
   if (token.token === '{') {
      ed = token.endIndex;
   } else {
      let i;
      for (i = ed, ed = -1; i < env.tokens.length; i++) {
         token = env.tokens[i];
         if (lambda_express_bracket.indexOf(token.token) >= 0) {
            i = token.endIndex - 1;
            continue;
         }
         if (token.token === '\n') {
            let before_br = i_common.search_prev_skip_spacen(env.tokens, i-1);
            token = env.tokens[before_br];
            if (lambda_express_nonend.indexOf(token.token) >= 0) {
               continue;
            }
            ed = before_br + 1;
            break;
         }
         if (lambda_express_end.indexOf(token.token) >= 0) {
            ed = i;
            break;
         }
      }
      if (ed < 0) ed = i;
   }
   lambda_token.tag = i_common.TAG_FUNCTION;
   lambda_token.parameter = parameter;
   lambda_token.startIndex = st;
   lambda_token.endIndex = ed;
   return ed - env.cursor + 1;
}

function parse(env) {
   env.cursor = 0;
   i_extractor.extract_tokens(env, es5_extract_feature);
   i_extractor.merge_tokens(env, javascript_combinations);
   merge_$(env);
   i_decorator.decorate_bracket(env);
   i_decorator.decorate_keywords(env, javascript_keywords);
   env.cursor = 0;
   i_decorator.decorate_scope(env, javascript_decorate_feature);
   return env.tokens;
}

const i_fs = require('fs');
let filename = process.argv[2];
let text = i_fs.readFileSync(filename).toString();
let tokens = parse({text: text});
console.log(JSON.stringify(tokens.map((x, i) => { x.id=i; return x; }), null, 3));
