const i_common = require('./common');

const common_left_bracket  = ['(', '{', '['];
const common_right_bracket = [')', '}', ']'];
const common_left_right_bracket_map = {
   '(': ')', '{': '}', '[': ']', '<': '>'
};

/* env = { tokens, cursor, ...} */

function decorate_skip_current_line(env) {
   let st = env.cursor;
   let ed = i_common.search_next(env.tokens, st+1, (x) => x.token !== '\n');
   return ed - st + 1;
}

function decorate_bracket(env) {
   let stack = [];
   let i, n, ch, token;
   for (i = 0, n = env.tokens.length; i < n; i++) {
      token = env.tokens[i];
      ch = token.token;
      if (common_left_bracket.indexOf(ch) >= 0) {
         stack.push({i: i, ch: common_left_right_bracket_map[ch]});
         token.startIndex = i;
         token.tag = i_common.TAG_BRACKET[ch];
      } else if (common_right_bracket.indexOf(ch) >= 0) {
         let pair = stack.pop();
         if (pair.ch !== ch) { /* bracket not match; should not be here */ }
         env.tokens[pair.i].endIndex = i+1;
      }
   }
   return env.tokens.length;
}

function decorate_keywords(env, keywords) {
   env.tokens.forEach((token) => {
      if (keywords.indexOf(token.token) >= 0) {
         token.tag = i_common.TAG_KEYWORD;
      }
   });
   return env.tokens.length;
}

function decorate_feature(env, features) {
   if (!features) return 0;
   let i, n, r;
   for (i = 0, n = features.length; i < n; i++) {
      r = features[i](env);
      if (r > 0) return r;
   }
   return 0;
}

function decorate_scope(env, feature_map, feature_default_fn) {
   let decorate_others = feature_default_fn;
   let n, r;
   n = env.tokens.length;
   while (env.cursor < n) {
      let name = env.tokens[env.cursor].token;
      let features = feature_map[name];
      if (Array.isArray(features)) {
         // dict['constructor'] may cause error
         r = decorate_feature(env, features);
      } else {
         r = 0;
      }
      if (!r) r = decorate_others && decorate_others(env) || 1;
      env.cursor += r;
   }
   return env.tokens;
}

module.exports = {
   decorate_skip_current_line,
   decorate_bracket,
   decorate_keywords,
   decorate_scope
};