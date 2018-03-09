const i_common = require('./common');
const i_utils = require('../../utils');

const ruby_decorate_feature = {
   'require': [decorate_import],
   'require_relative': [decorate_import]
};

function decorate_element(env, token) {
   if (token.tag == i_utils.TAG_STRING) {
      if (!env.output.strings) env.output.strings = [];
      env.output.strings.push(env.cursor);
   }
}

function decorate_bracket(env) {
   if (env.endIndex && env.endIndex <= env.cursor) {
      // skip remains, focus on scope
      return env.tokens.length - env.cursor;
   }
   let token = env.tokens[env.cursor];
   decorate_element(env, token);
   if (!token.type) return 0;
   if (!isNaN(env.startIndex) && env.cursor <= env.startIndex) {
      return 0;
   }
   let output = {
      startIndex: token.startIndex,
      endIndex: token.endIndex,
      name: token.name,
      type: token.type
   };
   i_common.decorate_scope({
      output: output,
      tokens: env.tokens,
      cursor: token.startIndex,
      startIndex: token.startIndex,
      endIndex: token.endIndex
   }, ruby_decorate_feature, decorate_bracket);
   if (!env.output.scopes) env.output.scopes = {};
   if (!env.output.scopes[token.name]) env.output.scopes[token.name] = [];
   env.output.scopes[token.name].push(output);
   return token.endIndex + 1 - token.startIndex;
}

function decorate_import(env) {
   let p = env.cursor+1;
   let q = i_utils.search_next(env.tokens, p, {key: 'token', stop: ['\n']});
   let class_name = [];
   for (let i = p; i < q; i++) {
      if (i_common.is_space(env.tokens[i])) continue;
      class_name.push(env.tokens[i].token);
   }
   if (!env.output.module_import) {
      env.output.module_import = [];
   }
   env.output.module_import.push(class_name.join(''));
   return q - env.cursor;
}

function decorate(tokens) {
   let output = {};
   i_common.decorate_scope({
      output: output,
      tokens: tokens,
      cursor: 0
   }, ruby_decorate_feature, decorate_bracket);
   return output;
}

module.exports = {
   decorate
}