const i_common = require('../common');
const i_extractor = require('../extractor');
const i_decorator = require('../decorator');

const ruby_feature = {
   '"': [extract_string],
   '\'': [extract_char],
   '`': [extract_cmd_string],
   '#': [extract_line_comment],
   '\n': [extract_end_doc],
   '<': [extract_here_doc],
   '%': [extract_raw_string],
   '=': [extract_block_comment],
   '/': [extract_regex],
};

const regex_suffix = [
   'i', 'm', 'x', 'o'
];
function extract_regex(env) {
   // e.g. /^te\nst$/, /[/]/
   // a = /regex/   /regex/i.match(...)   /1/ =~ '`'    '`' =~ /1/;
   let n = env.text.length;
   let st = env.cursor;
   let ed = st;
   // search before st, should not be a number or a symbol
   //                   but can be a keyword (e.g. return)
   let t;
   let p = i_common.search_prev(
      env.tokens, env.tokens.length-1,
      (t) => i_common.space.indexOf(t.token) >= 0
   );
   if (p >= 0) {
      t = env.tokens[p];
      if (i_common.stops.indexOf(t.token) < 0) {
         if (ruby_keywords.indexOf(t.token) >= 0) {
         } else if (t.token === 'puts') {
            // XXXX: p /test/i.to_f
            //     - v.s.:
            //       p = 1
            //       p /test/i.to_f
         } else {
            return null;
         }
      }
   }
   // search for end position
   for (let i = env.cursor+1; i < n; i++) {
      let ch = env.text.charAt(i);
      if (ch === '\\') {
         i ++;
         continue;
      }
      if (ch === '/') {
         ed = i;
         break;
      }
   }
   while(ed+1 < n) {
      if (regex_suffix.indexOf(env.text.charAt(ed+1)) < 0) {
         break;
      }
      ed ++;
   }
   return {
      tag: i_common.TAG_REGEX,
      token: env.text.substring(st, ed+1)
   };
}

function extract_block_comment(env) {
   let st = env.cursor, ed = st;
   let ch = env.text.substring(st-1, st+7).trim();
   if (ch !== '=begin') return null;
   ed = st + 6;
   while (true) {
      ed = env.text.indexOf('\n=end', ed);
      if (ed < 0) {
         ed = n;
         break;
      } else {
         ch = env.text.substring(ed, ed+6).trim();
         if (ch !== '=end') continue;
         ed = ed + 5;
         break;
      }
   }
   return {
      tag: i_common.TAG_COMMENT,
      token: env.text.substring(st, ed)
   }
}

const raw_string_starter = [
   '`', '~', '!', '@', '#', '$', '%', '^',
   '&', '*', '(', ')', '-', '_', '=', '+',
   '[', ']', '{', '}', '\\', '|', ';', ':',
   '\'', '"', '<', '>', ',', '.', '/', '?'
];
const raw_string_prefix = [
   'q', 'Q', 'w', 'W', 'i', 'I', 'r', 'x', 's'
];
function extract_raw_string(env) {
   let st = env.cursor, ed = st+1, n = env.text.length;
   let ch = env.text.charAt(ed), prefix = null;
   if (raw_string_prefix.indexOf(ch) >= 0) {
      prefix = ch;
      ch = env.text.charAt(++ed);
   }
   if (raw_string_starter.indexOf(ch) < 0) return null;
   let left = ch, right = ch;
   switch (left) {
   case '(': right = ')'; break;
   case '[': right = ']'; break;
   case '{': right = '}'; break;
   case '<': right = '>'; break;
   }
   if (left === '\\') {
      for (let i = ed+1; i < n; i++) {
         if (env.text.charAt(i) === '\\') {
            ed = i + 1;
            break;
         }
      }
   } else if (left === right) {
      for (let i = ed+1; i < n; i++) {
         ch = env.text.charAt(i);
         if (ch === '\\') {
            i ++;
            continue;
         }
         if (ch === right) {
            ed = i + 1;
            break;
         }
      }
   } else {
      let deep = 1;
      for (let i = ed+1; i < n; i++) {
         ch = env.text.charAt(i);
         if (ch === '\\') {
            i ++;
            continue;
         }
         if (ch === left) {
            deep ++;
            continue;
         }
         if (ch === right) {
            deep --;
            if (deep) continue;
            ed = i + 1;
            break;
         }
      }
   }
   let tag = i_common.TAG_STRING;
   if (prefix === 'r') {
      for (let i = ed; i < n; i++) {
         if (regex_suffix.indexOf(env.text.charAt(i)) < 0) {
            ed = i;
            break;
         }
      }
      tag = i_common.TAG_REGEX;
   }
   return { tag, token: env.text.substring(st, ed) };
}

function extract_here_doc(env) {
   let st = env.cursor, ed = st, p;
   let ch = env.text.substring(st, st+3);
   let n = env.text.length;
   let marker = null;
   switch(ch) {
      case '<<-':
      ed = st + 3;
      p = env.text.indexOf('\n', ed);
      if (p < 0) p = n;
      marker = env.text.substring(ed, p);
      if (!marker) return null;
      do {
         ed = p;
         p = env.text.indexOf('\n', ed+1);
         if (p < 0) p = n;
         ch = env.text.substring(ed+1, p).trim();
      } while (marker !== ch && p < n);
      ed = p;
      return {
         tag: i_common.TAG_STRING,
         token: env.text.substring(st, ed)
      };
      case '<<E':
      ch = env.text.substring(st, st+5);
      if (ch !== '<<EOF') return null;
      marker = '\nEOF\n';
      p = env.text.indexOf(marker, p + 1)
      if (p < 0) {
         ed = n;
      } else {
         ed = p + marker.length - 1;
      }
      return {
         tag: i_common.TAG_STRING,
         token: env.text.substring(st, ed)
      }
      case '<<"': case '<<\'': case '<<`':
      ed = st + 3;
      p = env.text.indexOf('\n', ed);
      marker = '\n' + env.text.substring(ed, p-1) + '\n';
      p = env.text.indexOf(marker, p + 1)
      if (p < 0) {
         ed = n;
      } else {
         ed = p + marker.length - 1;
      }
      return {
         tag: i_common.TAG_STRING,
         token: env.text.substring(st, ed)
      }
   }
   return null;
}

function extract_end_doc(env) {
   let st = env.cursor, n = '__END__'.length;
   if (env.text.substring(st-n, st) !== '__END__') return null;
   let i = st - n - 1, ch;
   for (; i >= 0; i--) {
      ch = env.text.charAt(i);
      if (ch === '\n') break;
      if (ch !== ' ' && ch !== '\t') return null;
   }
   return [{
      token: '\n'
   }, {
      tag: i_common.TAG_STRING,
      token: env.text.substring(st+1)
   }];
}

function extract_string(env) {
   return i_extractor.extract_string(env, '"', '"', '\\');
}

function extract_char(env) {
   return i_extractor.extract_string(env, '\'', '\'', '\\');
}

function extract_cmd_string(env) {
   return i_extractor.extract_string(env, '`', '`', '\\');
}

function extract_line_comment(env) {
   return i_extractor.extract_comment(env, '#', '\n');
}

const ruby_keywords = [
   // ref:
   // - https://github.com/ruby/ruby/blob/trunk/defs/keywords
   '__ENCODING__', '__LINE__', '__FILE__', 'BEGIN', 'END', 'alias', 'and',
   'begin', 'break', 'case', 'class', 'def', 'defined?', 'do', 'else', 'elsif',
   'end', 'ensure', 'false', 'for', 'if', 'in', 'module', 'next', 'nil', 'not',
   'or', 'redo', 'rescue', 'retry', 'return', 'self', 'super', 'then', 'true',
   'undef', 'unless', 'until', 'when', 'while', 'yield',
];

const ruby_combinations = [
   '++', '--', '+=', '-=', '*=', '/=', '%=', '==',
   '!=', '>=', '<=', '<<-', '&&', '||', '<<', '>>',
   '&=', '|=', '^=', '<<=', '>>=', '<=>', '&&=',
   '->', '=>', '=~', '!~', '===', '**', '**=', '||=',
   '$\'', '$"', '$~', ['defined', '?'],
];

const ruby_decorate_feature = {
   'require': [decorate_require],
   'require_relative': [decorate_require],
   'class': [decorate_class_start],
   'def': [decorate_function_start],
   'module': [decorate_module_start],
   'end': [decorate_inline_end, decorate_end],
   'if': [decorate_inline_block, decorate_block],
   'until': [decorate_inline_block, decorate_block],
   'unless': [decorate_inline_block, decorate_block],
   'while': [decorate_block],
   'for': [decorate_block],
   'case': [decorate_block],
   'begin': [decorate_block], // begin ... rescue ... else ... ensure ... end
   'do': [decorate_block],
   '->': [decorate_lambda_function],
   'lambda': [decorate_lambda_function],
};

function decorate_require(env) {}

function decorate_lambda_function(env) {}

const container_tag_map = {
   'class': i_common.TAG_CLASS,
   'def': i_common.TAG_FUNCTION,
   'module': i_common.TAG_MODULE,
};
const end_of_class_name = ['\n', '<<', '<', ';'];
function decorate_container(env, type) {
   let st = i_common.search_prev_skip_space(env.tokens, env.cursor-1);
   if (st < 0) return 0;
   let token = env.tokens[st];
   // skip [ '\\', '\n' ]
   while (token.token === '\n') {
      let prev_token = env.tokens[st-1];
      if (prev_token && prev_token.token === '\\') {
         st = i_common.search_prev_skip_space(env.tokens, st-2);
         if (st < 0) break;
         token = env.tokens[st];
         continue;
      }
      break;
   }
   // e.g. puts a.class
   //            ^
   if (token.token === '.') return 0;
   st = i_common.search_next_skip_space(env.tokens, env.cursor+1);
   let name = [st], ed = st-1;
   token = env.tokens[st];
   do {
      ed = i_common.search_next(
         env.tokens, ed+1, (x) => end_of_class_name.indexOf(x.token) < 0
      );
      token = env.tokens[ed-1];
      // skip [ '\\', '\n' ]
   } while (token.token === '\\');
   name.push(i_common.search_prev_skip_spacen(env.tokens, ed-1)+1);
   if (name[0] >= name[1]) name = null;
   token = env.tokens[env.cursor];
   token.tag = container_tag_map[type];
   token.startIndex = env.cursor;
   if (name) token.name = name;
   if (!env.block_stack) env.block_stack = [];
   env.block_stack.push(token);
   // TODO: inherit, e.g. class A? < B, C
   return ed - env.cursor + 1;
}

function decorate_class_start(env) {
   return decorate_container(env, 'class');
}

function decorate_function_start(env) {
   let r = decorate_container(env, 'def');
   let token = env.tokens[env.cursor];
   let name = token.name;
   token = env.tokens[name[1]-1];
   if (name && token && token.token === ')') {
      let parameter = [name[1]-1];
      parameter.unshift(
         i_common.search_prev(env.tokens, name[1]-1, (x) => x.endIndex !== name[1])
      );
      name[1] = i_common.search_prev_skip_spacen(env.tokens, parameter[0]-1) + 1;
      token = env.tokens[env.cursor];
      token.parameter = parameter;
   }
   return r;
}

function decorate_module_start(env) {
   return decorate_container(env, 'module');
}

const end_not_inline = [' ', '\n', '\t', ';'];
function decorate_inline_end(env) {
   let token = env.tokens[env.cursor-1];
   if (!token) return 1;
   if (end_not_inline.indexOf(token.token) >= 0) return 0;
   return 1;
}

function decorate_end(env) {
   let block_token = env.block_stack.pop();
   block_token.endIndex = env.cursor;
   return 1;
}

const block_not_inline = [
   '\n', '(', '{', '<', '>', '+', '-', '!', '&', '|', '^', '=',
   '++', '--', '+=', '-=', '*=', '/=', '%=', '==',
   '!=', '>=', '<=', '&&', '||', '<<', '>>',
   '&=', '|=', '^=', '<<=', '>>=', '<=>', '&&=',
   '->', '=>', '=~', '!~', '===', '**', '**=', '||=',
];
function decorate_inline_block(env) {
   let st = i_common.search_prev_skip_space(env.tokens, env.cursor-1);
   if (st < 0) return 0;
   let token = env.tokens[st];
   // skip [ '\\', '\n' ]
   while (token.token === '\n') {
      let prev_token = env.tokens[st-1];
      if (prev_token && prev_token.token === '\\') {
         st = i_common.search_prev_skip_space(env.tokens, st-2);
         if (st < 0) break;
         token = env.tokens[st];
         continue;
      }
      break;
   }
   if (block_not_inline.indexOf(token.token) >= 0) return 0;
   return 1;
}

function decorate_block(env) {
   let token = env.tokens[env.cursor];
   token.startIndex = env.cursor;
   if (!env.block_stack) env.block_stack = [];
   env.block_stack.push(token);
   return 1;
}

function parse(env) {
   env.cursor = 0;
   i_extractor.extract_tokens(env, ruby_feature);
   i_extractor.merge_tokens(env, ruby_combinations);
   i_decorator.decorate_bracket(env);
   i_decorator.decorate_keywords(env, ruby_keywords);
   env.cursor = 0;
   i_decorator.decorate_scope(env, ruby_decorate_feature);
   return env.tokens;
}

const i_fs = require('fs');
let filename = process.argv[2];
let text = i_fs.readFileSync(filename).toString();
let tokens = parse({text: text});
console.log(JSON.stringify(tokens.map((x, i) => { x.id=i; return x; }), null, 3));
