const i_common = require('./common');
const i_utils = require('../../utils');

const java_decorate_feature = {
   'package': [decorate_package],
   'import': [decorate_import]
};

function decorate_bracket(env) {
   if (env.endIndex && env.endIndex <= env.cursor) {
      // skip remains, focus on scope
      return env.tokens.length - env.cursor;
   }
   let token = env.tokens[env.cursor];
   if (!token.type) return 0;
   let output = {
      startIndex: token.startIndex,
      endIndex: token.endIndex,
      name: token.name,
      type: token.type,
   };
   i_common.decorate_scope({
      output: output,
      tokens: env.tokens,
      cursor: token.startIndex+1,
      endIndex: token.endIndex
   }, {/* no package and import */}, decorate_bracket);
   if (!env.output.scopes) env.output.scopes = {};
   if (!env.output.scopes[token.name]) env.output.scopes[token.name] = [];
   env.output.scopes[token.name].push(output);
   return token.endIndex + 1 - token.startIndex;
}

function decorate_import(env) {
   let p = env.cursor+1;
   let q = i_utils.search_next(env.tokens, p, {key: 'token', stop: [';']});
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

function decorate_package(env) {
   let p = env.cursor+1;
   let q = i_utils.search_next(env.tokens, p, {key: 'token', stop: [';']});
   let package_name = [];
   for (let i = p; i < q; i++) {
      if (i_common.is_space(env.tokens[i])) continue;
      package_name.push(env.tokens[i].token);
   }
   env.output.package_name = package_name.join('');
   return q - env.cursor;
}

function decorate(tokens) {
   let output = {};
   i_common.decorate_scope({
      output: output,
      tokens: tokens,
      cursor: 0
   }, java_decorate_feature, decorate_bracket);
   return output;
}

module.exports = {
   decorate
}