const i_common = require('../common');
const i_extractor = require('../extractor');
const i_decorator = require('../decorator');

const csharp_extract_feature = {
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

const csharp_keywords = [
   // ref:
   // - https://docs.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/
   // - https://docs.microsoft.com/en-us/dotnet/csharp/language-reference/preprocessor-directives/
   'abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch',
   'char', 'checked', 'class', 'const', 'continue', 'decimal', 'default', 'delegate',
   'do', 'double', 'else', 'enum', 'event', 'explicit', 'extern', 'false',
   'finally', 'fixed', 'float', 'for', 'foreach', 'goto', 'if', 'implicit',
   'in', 'int', 'interface', 'internal', 'is', 'lock', 'long', 'namespace',
   'new', 'null', 'object', 'operator', 'out', 'override', 'params', 'private',
   'protected', 'public', 'readonly', 'ref', 'return', 'sbyte', 'sealed', 'short',
   'sizeof', 'stackalloc', 'static', 'string', 'struct', 'switch', 'this', 'throw',
   'true', 'try', 'typeof', 'uint', 'ulong', 'unchecked', 'unsafe', 'ushort',
   'using', 'virtual', 'void', 'volatile', 'while',

   'add', 'alias', 'ascending', 'async', 'await', 'by', 'descending', 'dynamic', 'equals',
   'from', 'get', 'global', 'group', 'into', 'join', 'let', 'nameof', 'on',
   'orderby', 'partial', 'remove', 'select', 'set', 'value', 'var', 'when',
   'where', 'yield',

   '#if', '#else', '#elif', '#endif', '#define', '#undef', '#warning', '#error', '#line',
   '#region', '#endregion', '#pragma',
];

const csharp_combinations = [
   '++', '--', '+=', '-=', '*=', '/=', '%=', '==',
   '!=', '>=', '<=', '->', '&&', '||', '<<', '>>',
   '&=', '|=', '^=', '<<=', '>>=', '??', '=>',
   ['#', 'region'], ['#', 'endregion'],
   ['#', 'if'],
   ['#', 'else'], ['#', 'elif'], ['#', 'endif'],
   ['#', 'pragma'], ['#', 'error'], ['#', 'define'],
   ['#', 'undef'], ['#', 'warning'], ['#', 'line'],
];

const csharp_decorate_feature = {
   '#region': [decorate_precompile],
   '#endregion': [decorate_precompile],
   '#if': [decorate_precompile],
   '#else': [decorate_precompile],
   '#elif': [decorate_precompile],
   '#endif': [decorate_precompile],
   '#pragma': [decorate_precompile],
   '#error': [decorate_precompile],
   '#define': [decorate_precompile],
   '#undef': [decorate_precompile],
   '#warning': [decorate_precompile],
   '#line': [decorate_precompile],
   'using': [decorate_import],
   // 'DllImport': [decorate_dll_import], // e.g. [DllImport("User32.dll")]
   'namespace': [decorate_module],
   'class': [decorate_class],
   '{': [decorate_function, enter_block_bracket],
   '}': [leave_block_bracket],
   '=>': [decorate_lambda_function],
};

function decorate_precompile(env) {
   let st = env.cursor, ed = st;
   let precompile_token = env.tokens[st];
   precompile_token.startIndex = st;
   ed = i_common.search_next(env.tokens, st+1, (x) => x.token !== '\n');
   precompile_token.endIndex = ed;
   return ed - st;
}

function is_container_block(env) {
   if (!env.indefable) env.indefable = [];
   if (env.indefable[env.indefable.length-1] === '{') {
      return false;
   }
   return true;
}

function decorate_import(env) {
   // not, e.g. using (Font font1 = new Font("Arial", 10.0f))
   if (!is_container_block(env)) return 0;
   // https://docs.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/using-directive
   let st = env.cursor, ed = st;
   let using_token = env.tokens[st];
   ed = i_common.search_next_skip_spacen(env.tokens, ed+1);
   let token = env.tokens[ed];
   if (!token) return 0;
   let is_static = false;
   if (token.token === 'static') {
      is_static = true;
      ed = i_common.search_next_skip_spacen(env.tokens, ed+1);
      token = env.tokens[ed];
   }
   let name = [ed, ed];
   let alias = null;
   ed = i_common.search_next(
      env.tokens, ed+1, (x) => x.token !== '=' && x.token !== ';'
   );
   token = env.tokens[ed];
   name[1] = i_common.search_prev_skip_spacen(env.tokens, ed-1)+1;
   if (!token) return 0;
   if (token.token === '=') {
      ed = i_common.search_next_skip_spacen(env.tokens, ed+1);
      alias = [ed, ed];
      ed = i_common.search_next(env.tokens, ed+1, (x) => x.token !== ';');
      token = env.tokens[ed];
      if (!token) return 0;
      alias[1] = i_common.search_prev_skip_spacen(env.tokens, ed-1)+1;
   } else if (is_static) {
      alias = name;
      name = null;
   } else {
      alias = [name[0], name[1]];
   }
   using_token.startIndex = st;
   using_token.endIndex = ed;
   using_token.alias = alias;
   if (name) using_token.name = name;
   return ed - st + 1;
}

function detect_basic_name(tokens, index) {
   // Name1.Name2.Name3
   let position = {
      startIndex: index,
      endIndex: index+1
   };
   let token;
   do {
      index = i_common.search_next_skip_spacen(tokens, index+1);
      token = tokens[index];
      if (!token) return position;
      if (token.token !== '.') break;
      index = i_common.search_next_skip_spacen(tokens, index+1);
      token = tokens[index];
      if (!token) break;
      position.endIndex = index+1;
   } while(true);
   return position;
}

function detect_generic(tokens, index) {
   // <T, K>
   let position = {
      startIndex: index,
      endIndex: index+1
   };
   let token = tokens[index];
   let deep = 1;
   while (deep > 0) {
      index = i_common.search_next(
         tokens, index+1, (x) => x.token !== '<' && x.token !== '>'
      );
      token = tokens[index];
      if (!token) return null;
      if (token.token === '<') {
         deep ++;
      } else if (token.token === '>') {
         deep --;
      }
   }
   position.endIndex = index + 1;
   return position;
}

function detect_generic_where(tokens, index) {
   // where T : System.IComparable<T> ;
   // where T : System.ICOmparable<T>, K : string {
   let position = {
      startIndex: index,
      endIndex: index+1
   };
   position.endIndex = i_common.search_next(
      tokens, index+1, (x) => x.token !== '{' && x.token !== ';'
   );
   return position;
}

function enter_block_bracket(env) {
   if (!env.indefable) env.indefable = [];
   env.indefable.push('{');
   return 1;
}

function leave_block_bracket(env) {
   if (!env.indefable) env.indefable = [];
   env.indefable.pop();
   return 1;
}

function decorate_module(env) {
   if (!is_container_block(env)) return 0;
   let st = env.cursor, ed = st;
   let namespace_token = env.tokens[st];
   ed = i_common.search_next_skip_spacen(env.tokens, ed+1);
   let name_position = detect_basic_name(env.tokens, ed);
   ed = i_common.search_next_skip_spacen(env.tokens, name_position.endIndex+1);
   let token = env.tokens[ed];
   if (!token) return 0;
   if (token.token !== '{') return 0;
   namespace_token.tag = i_common.TAG_MODULE;
   namespace_token.startIndex = st;
   namespace_token.endIndex = token.endIndex;
   namespace_token.name = [name_position.startIndex, name_position.endIndex];
   env.indefable.push('namespace');
   return ed - st + 1;
}

function decorate_class(env) {}

function decorate_function(env) {}

function decorate_lambda_function(env) {}

function parse(env) {
   env.cursor = 0;
   i_extractor.extract_tokens(env, csharp_extract_feature);
   i_extractor.merge_tokens(env, csharp_combinations);
   i_decorator.decorate_bracket(env);
   i_decorator.decorate_keywords(env, csharp_keywords);
   env.cursor = 0;
   i_decorator.decorate_scope(env, csharp_decorate_feature);
   return env.tokens;
}

module.exports = {
   parse: (text) => parse({ text })
};
