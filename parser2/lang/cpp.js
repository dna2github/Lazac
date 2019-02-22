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
   '&=', '|=', '^=', '<<=', '>>=', ['#', 'include'],
   ['#', 'if'], ['#', 'ifdef'], ['#', 'ifndef'],
   ['#', 'else'], ['#', 'elif'], ['#', 'endif'],
   ['#', 'pragma'], ['#', 'error'], ['#', 'define'],
   ['#', 'undef'], ['#', 'line'],
];

const cpp_decorate_feature = {};

function parse(env) {
   env.cursor = 0;
   i_extractor.extract_tokens(env, cpp_extract_feature);
   i_extractor.merge_tokens(env, cpp_combinations);
   // TODO: skip #define A {  #defin B }... to avoid bracket not pairing
   // TODO: simulate preprocess
   i_decorator.decorate_bracket(env);
   i_decorator.decorate_keywords(env, cpp_keywords);
   i_decorator.decorate_scope(env, cpp_decorate_feature);
   return env.tokens;
}

const i_fs = require('fs');
let filename = process.argv[2];
let text = i_fs.readFileSync(filename).toString();
let tokens = parse({text: text});
console.log(JSON.stringify(tokens.map((x, i) => { x.id=i; return x; }), null, 3));
