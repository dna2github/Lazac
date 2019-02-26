const i_common = require('../common');
const i_extractor = require('../extractor');
const i_decorator = require('../decorator');

const cpp_extract_feature = {
   '"': [extract_string],
   '\'': [extract_char],
   '/': [extract_line_comment, extract_multiline_comment]
};

function extract_string(env) {
   return i_extractor.extract_string(env, '"', '"', '\\');
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

const cpp_keywords = [
   // ref:
   // - https://en.cppreference.com/w/cpp/keyword
   'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do', 'double',
   'else', 'enum', 'extern', 'float', 'for', 'goto', 'if', 'int', 'long', 'register',
   'return', 'short', 'signed', 'sizeof', 'static', 'struct', 'switch', 'typedef',
   'union', 'unsigned', 'void', 'volatile', 'while',
   /* C99 */ '_Bool', '_Complex', '_Imaginary', 'inline', 'restrict', '_Pragma',
   /* C11 */ '_Alignas', '_Alignof', '_Atomic', '_Generic', '_Noreturn', '_Static_assert',
   '_Thread_local',
   /* C extension */ 'asm', 'fortran',
   /* C++ */ 'and', 'and_eq', 'bitand', 'bitor', 'bool', 'break', 'catch', 'char8_t',
   'char16_t', 'char32_t', 'class', 'compl', 'const_cast', 'delete', 'dynamic_cast',
   'explicit', 'export', 'false', 'friend', 'mutable', 'namespace', 'new', 'not', 'not_eq',
   'operator', 'or', 'or_eq', 'private', 'public', 'protected', 'reinterpret_cast',
   'static_cast', 'template', 'this', 'throw', 'true', 'try', 'typeid', 'typename',
   'using', 'virtual', 'wchar_t', 'xor', 'xor_eq', 'finally',
   /* C++ 11 */ 'alignas', 'alignof', 'constexpr', 'decltype', 'noexcept', 'nullptr',
   'static_assert', 'thread_local', /* 'override', 'final' */
   /* C++ 17 */
   /* C++ 20 */ 'concept', 'consteval', 'requires', /* 'audit', 'axiom' */
   /* C++ TS */ 'atomic_cancel', 'atomic_commit', 'atomic_noexcept',
   'co_await', 'co_return', 'co_yield', 'import', 'module', 'reflexpr', 'synchronized',
   /* 'transaction_safe', 'transaction_safe_dynamic' */
   '#if', '#ifdef', '#ifndef', '#else', '#elif', '#endif', '#pragma', '#error',
   '#define', '#undef', '#line', 'defined', '#include',
];

const cpp_combinations = [
   '++', '--', '+=', '-=', '*=', '/=', '%=', '==',
   '!=', '>=', '<=', '->', '&&', '||', '<<', '>>',
   '&=', '|=', '^=', '<<=', '>>=', '::', ['#', 'include'],
   ['#', 'if'], ['#', 'ifdef'], ['#', 'ifndef'],
   ['#', 'else'], ['#', 'elif'], ['#', 'endif'],
   ['#', 'pragma'], ['#', 'error'], ['#', 'define'],
   ['#', 'undef'], ['#', 'line'], ['\\', '\n'],
];

const cpp_decorate_precompile_feature = {
   '#include': [decorate_include],
   '#if': [decorate_precompile],
   '#ifdef': [decorate_precompile],
   '#ifndef': [decorate_precompile],
   '#elif': [decorate_precompile],
   '#else': [decorate_precompile],
   '#endif': [decorate_precompile],
   '#pragma': [decorate_precompile],
   '#error': [decorate_precompile],
   '#define': [decorate_precompile],
   '#undef': [decorate_precompile],
   '#line': [decorate_precompile],
   '{': [decorate_bracket],
   '[': [decorate_bracket],
   '(': [decorate_bracket],
   '}': [decorate_bracket],
   ']': [decorate_bracket],
   ')': [decorate_bracket],
   '\\\n': [decorate_combline],
};

const cpp_decorate_feature = {
   '#include': [skip_precompile],
   '#if': [skip_precompile],
   '#ifdef': [skip_precompile],
   '#ifndef': [skip_precompile],
   '#elif': [skip_precompile],
   '#else': [skip_precompile],
   '#endif': [skip_precompile],
   '#pragma': [skip_precompile],
   '#error': [skip_precompile],
   '#define': [skip_precompile],
   '#undef': [skip_precompile],
   '#line': [skip_precompile],
   'using': [decorate_import],
   'namespace': [decorate_module],
   'class': [decorate_class],
   'struct': [decorate_struct],
   'template': [decorate_generic],
   '{': [decorate_function, decorate_lambda_function, decorate_enum, decorate_union],
   '}': [skip_block_bracket],
   ';': [decorate_function],
};

function skip_block_bracket(env) {
   if (env.indefine_able) {
      env.indefine_able.pop();
   }
   return 1;
}

function decorate_combline(env) {
   let token = env.tokens[env.cursor];
   token._token = token.token;
   token.token = '';
   return 1;
}

function decorate_generic(env) {
   // http://www.cplusplus.com/doc/oldtutorial/templates/
}

function decorate_lambda_function(env) {
   // https://docs.microsoft.com/en-us/cpp/cpp/lambda-expressions-in-cpp?view=vs-2017
}

function decorate_import(env) {
   // https://en.cppreference.com/w/cpp/language/namespace
   // https://en.cppreference.com/w/cpp/language/using_declaration
   // https://en.cppreference.com/w/cpp/language/type_alias
   let using_token = env.tokens[env.cursor];
   let name = [0, 0];
   name[0] = i_common.search_next_skip_spacen(env.tokens, env.cursor+1);
   let token = env.tokens[name[0]];
   if (token.token === 'inline') {
      name[0] = i_common.search_next_skip_spacen(env.tokens, name[0]+1);
      token = env.tokens[name[0]];
   }
   if (token.token === 'typename' || token.token === 'namespace') {
      name[0] = i_common.search_next_skip_spacen(env.tokens, name[0]+1);
   }
   name[1] = i_common.search_next(env.tokens, name[0], (x) => x.token !== ';');
   name[1] = i_common.search_prev_skip_spacen(env.tokens, name[1]-1)+1;
   using_token.name = name;
   return name[1] - env.cursor;
}

function decorate_module(env) {
   let st = env.cursor, ed = st;
   let namespace_token = env.tokens[st];
   let name = [0, 0];
   name[0] = i_common.search_next_skip_spacen(env.tokens, st+1);
   ed = i_common.search_next(env.tokens, name[0]+1, (x) => x.token !== '{');
   name[1] = i_common.search_prev_skip_spacen(env.tokens, ed-1)+1;
   // TODO: search prev for modifiers
   let token = env.tokens[ed];
   token.skip_module = true;
   namespace_token.tag = i_common.TAG_MODULE;
   namespace_token.name = name;
   namespace_token.startIndex = st;
   namespace_token.endIndex = token.endIndex;
   if (!env.indefine_able) env.indefine_able = [];
   env.indefine_able.push('namespace');
   return ed - st + 1;
}

function validate_basic_name(tokens, st, ed) {
   if (ed - st <= 1) return true;
   let xs = tokens.slice(st, ed).filter((x) => !!x.token.trim());
   let i = 0;
   if (xs.length % 2 === 1) i = 1;
   // class   ::Y1 {}
   // class X1::Y1 {}
   for(; i < xs.length; i += 2) {
      if (xs[i].token !== '::') return false;
   }
   return true;
}

function decorate_struct(env) {
   let st = env.cursor, ed = st;
   let class_token = env.tokens[st];
   let name = [0, 0];
   // struct X1::Y1::Z {}
   name[0] = i_common.search_next_skip_spacen(env.tokens, st+1);
   ed = i_common.search_next(
      env.tokens, name[0]+1, (x) => (
         x.token !== ':' && x.token !== '{' && x.token !== ';'
      )
   );
   name[1] = i_common.search_prev_skip_spacen(env.tokens, ed-1)+1;
   if (!validate_basic_name(env.tokens, name[0], name[1])) {
      return 0;
   }
   let token = env.tokens[ed];
   let inherit = [];
   if (token.token === ':') {
      do {
         let ist = i_common.search_next_skip_spacen(env.tokens, ed+1);
         ed = i_common.search_next(
            env.tokens, ist+1, (x) => (
               x.token !== ',' && x.token !== '{' && x.token !== ';'
            )
         );
         let ied = i_common.search_prev_skip_spacen(env.tokens, ed-1);
         inherit.push([ist, ied+1]);
         token = env.tokens[ed];
      } while (token.token === ',');
   }
   if (token.token !== ';' && token.token !== '{') return 0;
   if (token.token === '{') {
      token.skip_class = true;
   } else {
      ed ++;
   }
   // TODO: search prev for modifiers, e.g. public, static
   class_token.tag = i_common.TAG_CLASS;
   class_token.name = name;
   class_token.inherit = inherit;
   class_token.startIndex = st;
   class_token.endIndex = token.endIndex || ed;
   if (!env.indefine_able) env.indefine_able = [];
   env.indefine_able.push('struct');
   return ed - st + 1;
}

function decorate_class(env) {
   let st = env.cursor, ed = st;
   let class_token = env.tokens[st];
   let name = [0, 0];
   name[0] = i_common.search_next_skip_spacen(env.tokens, st+1);
   ed = i_common.search_next(
      env.tokens, name[0]+1, (x) => (
         x.token !== ':' && x.token !== '{' && x.token !== ';'
      )
   );
   name[1] = i_common.search_prev_skip_spacen(env.tokens, ed-1)+1;
   if (!validate_basic_name(env.tokens, name[0], name[1])) {
      return 0;
   }
   let token = env.tokens[ed];
   let inherit = [];
   if (token.token === ':') {
      do {
         let ist = i_common.search_next_skip_spacen(env.tokens, ed+1);
         ed = i_common.search_next(
            env.tokens, ist+1, (x) => (
               x.token !== ',' && x.token !== '{' && x.token !== ';'
            )
         );
         let ied = i_common.search_prev_skip_spacen(env.tokens, ed-1);
         inherit.push([ist, ied+1]);
         token = env.tokens[ed];
      } while (token.token === ',');
   }
   if (token.token !== ';' && token.token !== '{') return 0;
   if (token.token === '{') {
      token.skip_class = true;
   } else {
      ed ++;
   }
   // TODO: search prev for modifiers, e.g. public, static
   class_token.tag = i_common.TAG_CLASS;
   class_token.name = name;
   class_token.inherit = inherit;
   class_token.startIndex = st;
   class_token.endIndex = token.endIndex || ed;
   if (!env.indefine_able) env.indefine_able = [];
   env.indefine_able.push('class');
   return ed - st + 1;
}

function detect_prev_basic_name(tokens, index) {
   let token = tokens[index];
   let position = {
      startIndex: index,
      endIndex: index+1
   };
   let ch;
   if (token.token === '::') {
      index = i_common.search_prev_skip_spacen(tokens, index-1);
      token = tokens[index];
      if (!token) return position;
      ch = token.token.charAt(0);
      if (i_common.stops.indexOf(ch) >= 0) return position;
   }
   do {
      position.startIndex = index;
      index = i_common.search_prev_skip_spacen(tokens, index-1);
      token = tokens[index];
      if (!token) break;
      if (token.token !== '::') break;
      position.startIndex = index;
      index = i_common.search_prev_skip_spacen(tokens, index-1);
      token = tokens[index];
      if (!token) break;
      if (token.tag === i_common.TAG_KEYWORD) break;
      ch = token.token.charAt(0);
      if (i_common.stops.indexOf(ch) >= 0) break;
   } while (true);
   return position;
}

const return_type_prefix = ['class', 'struct', 'enum', 'union'];
function decorate_function(env) {
   if (!env.indefine_able) env.indefine_able = [];
   let st = env.cursor;
   let token = env.tokens[st];
   let skip_key = null;
   if (token.skip_module) {
      skip_key = 'skip_module';
   } else if (token.skip_class) {
      skip_key = 'skip_class';
   }
   if (skip_key) {
      delete env[skip_key];
      return 1;
   }
   let container = env.indefine_able[env.indefine_able.length-1];
   if (container === '{') {
      // cannot define function in non-container block
      return 0;
   }
   // int main() {}
   // int main() ;
   // operator == (...) {...}
   let ed = token.endIndex || env.cursor;
   let parameter = [];
   st = i_common.search_prev_skip_spacen(env.tokens, st-1);
   token = env.tokens[st];
   if (token.token !== ')') return 0;
   parameter.push(st);
   st = i_common.search_prev(env.tokens, st-1, (x) => x.endIndex !== st+1);
   parameter.unshift(st);
   token = env.tokens[st];
   if (!token) return 0;
   st = i_common.search_prev_skip_spacen(env.tokens, st-1);
   token = env.tokens[st];
   if (!token) return 0;
   if (['if', 'for', 'while', 'switch'].indexOf(token.token) >= 0) {
      // if/for/while/switch (...) {...}
      return 0;
   }
   let is_function_pointer = false;
   let return_type = st;
   if (token.token === ')') {
      // return function pointer
      parameter = [];
      return_type = i_common.search_prev(env.tokens, st-1, (x) => x.endIndex !== st);
      st = i_common.search_prev_skip_spacen(env.tokens, st-1);
      token = env.tokens[st];
      if (!token) return 0;
      if (token.token !== ')') return 0;
      parameter.push(st);
      st = i_common.search_prev(env.tokens, st-1, (x) => x.endIndex !== st+1);
      parameter.unshift(st);
      st = i_common.search_prev_skip_spacen(env.tokens, st-1);
      token = env.tokens[st];
      is_function_pointer = true;
   }
   let name = [st, st+1];
   let ch = token.token.charAt(0);
   if (token.token === 'delete' || token.token === 'new') {
      st = i_common.search_prev_skip_space(env.tokens, st-1);
      token = env.tokens[st];
      if (token.token !== 'operator') return 0;
      name[0] = st;
   } else if (i_common.stops.indexOf(ch) >= 0) {
      do {
         st = i_common.search_prev_skip_spacen(env.tokens, st-1);
         token = env.tokens[st];
         if (!token) return 0;
         ch = token.token.charAt(0);
      } while (i_common.stops.indexOf(ch) >= 0);
      if (token.token !== 'operator') return 0;
      name[0] = st;
   }
   let name_position = detect_prev_basic_name(env.tokens, st);
   name[0] = name_position.startIndex;
   if (!is_function_pointer) {
      st = name[0];
      return_type = st;
   }
   // search for heading type, e.g. int, struct name {int a;}**, class X1::X2::A**
   while (true) {
      return_type = i_common.search_prev_skip_spacen(env.tokens, return_type-1);
      token = env.tokens[return_type];
      if (!token) break;
      if (token.token === '*') continue;
      if (token.token === '}') {
         let backup_return_type = return_type;
         return_type = i_common.search_prev(
            env.tokens, return_type-1, (x) => x.endIndex !== return_type+1
         );
         return_type = i_common.search_prev_skip_spacen(env.tokens, return_type-1);
         token = env.tokens[return_type];
         if (!token) break;
         if (return_type_prefix.indexOf(token.token) < 0) {
            return_type = i_common.search_next_skip_spacen(env.tokens, backup_return_type+1);
         }
      }
      // class X { m0() {} }
      //           m0() {}      m1() {}
      //      void m0() {} void m1() {}
      if (token.token === ')' || token.token === '{') {
         break;
      }
      // name
      if (return_type_prefix.indexOf(token.token) < 0) {
         let return_type_position = detect_prev_basic_name(env.tokens, return_type);
         st = return_type_position.startIndex;
         return_type = st;
         //st = return_type;
         return_type = i_common.search_prev_skip_spacen(env.tokens, return_type-1);
         token = env.tokens[return_type];
         if (token && token.endIndex && return_type_prefix.indexOf(token.token) >= 0) {
            st = return_type;
         }
      } else {
         st = return_type;
      }
      // TODO: search for function attribute, e.g. extern, static
      break;
   }
   token = env.tokens[name[0]];
   token.startIndex = st;
   token.endIndex = ed;
   token.parameter = parameter;
   token.name = name;
   token.tag = i_common.TAG_FUNCTION;
   env.indefine_able.push('{');
}

function decorate_type(env, type) {
   let st = env.cursor;
   let token = env.tokens[st];
   let ed = token.endIndex;
   let name = null;
   st = i_common.search_prev_skip_spacen(env.tokens, st-1);
   token = env.tokens[st];
   if (!token) return 0;
   if (token.token !== type) {
      name = [st, st+1];
      st = i_common.search_prev_skip_spacen(env.tokens, st-1);
   }
   token = env.tokens[st];
   if (!token) return 0;
   if (token.token !== type) {
      return 0;
   }
   token.startIndex = st;
   token.endIndex = ed;
   token.tag = i_common.TAG_CLASS;
   if (name) token.name = name;
   return 1;
}

function decorate_enum(env) {
   return decorate_type(env, 'enum');
}

function decorate_union(env) {
   return decorate_type(env, 'union');
}

function skip_precompile(env) {
   let token = env.tokens[env.cursor];
   return token.endIndex - token.startIndex;
}

function decorate_include(env) {
   let st = env.cursor, ed = st;
   let start_token = env.tokens[st];
   ed = i_common.search_next(env.tokens, st+1, (x) => x.tag !== i_common.TAG_STRING && x.token !== '<');
   let token = env.tokens[ed];
   if (!token) return 1;
   start_token.startIndex = st;
   if (token.tag === i_common.TAG_STRING) {
      start_token.name = [ed, ed+1];
   } else {
      st = ed + 1;
      ed = i_common.search_next(env.tokens, st, (x) => x.token !== '>');
      start_token.name = [st, ed];
   }
   start_token.endIndex = ed + 1;
   return ed - st;
}

function decorate_precompile(env) {
   let st = env.cursor;
   let ed = i_common.search_next(env.tokens, st+1, (x) => x.token !== '\n');
   while (env.tokens[ed-1].token === '\\') {
      ed = i_common.search_next(env.tokens, ed+1, (x) => x.token !== '\n');
   }
   let start_token = env.tokens[st];
   start_token.startIndex = st;
   start_token.endIndex = ed;
   return ed - st;
}

function decorate_bracket(env) {
   if (!env.bracket_stack) {
      env.bracket_stack = [];
   }
   let bracket_token = env.tokens[env.cursor];
   switch (bracket_token.token) {
      case '{': case '[': case '(':
      bracket_token.tag = i_common.TAG_BRACKET[bracket_token.token];
      bracket_token.startIndex = env.cursor;
      env.bracket_stack.push(bracket_token);
      break;
      case '}': case ']': case ')':
      bracket_token = env.bracket_stack.pop();
      // TODO: deal with not pairing bracket
      bracket_token.endIndex = env.cursor + 1;
      break;
   }
   return 1;
}

function parse(env) {
   env.cursor = 0;
   i_extractor.extract_tokens(env, cpp_extract_feature);
   i_extractor.merge_tokens(env, cpp_combinations);
   env.cursor = 0;
   i_decorator.decorate_scope(env, cpp_decorate_precompile_feature);
   // TODO: simulate preprocess
   i_decorator.decorate_keywords(env, cpp_keywords);
   env.cursor = 0;
   i_decorator.decorate_scope(env, cpp_decorate_feature);
   return env.tokens;
}

const i_fs = require('fs');
let filename = process.argv[2];
let text = i_fs.readFileSync(filename).toString();
let tokens = parse({text: text});
console.log(JSON.stringify(tokens.map((x, i) => { x.id=i; return x; }), null, 3));
