const common_left_bracket  = ['(', '{', '['];
const common_right_bracket = [')', '}', ']'];
const common_left_right_bracket_map = {
   '(': ')', '{': '}', '[': ']', '<': '>'
};

/* env = { tokens, cursor, ...} */

function decorate_bracket(env) {
   let stack = [];
   let i, n, ch;
   for (i = 0, n = env.tokens.length; i < n; i++) {
      ch = env.tokens[i].token;
      if (common_left_bracket.indexOf(ch) >= 0) {
         stack.push({i: i, ch: common_left_right_bracket_map[ch]});
         env.tokens[i].startIndex = i;
      } else if (common_right_bracket.indexOf(ch) >= 0) {
         let pair = stack.pop();
         if (pair.ch !== ch) { /* bracket not match; should not be here */ }
         env.tokens[pair.i].endIndex = i;
      }
   }
   return 0;
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

function decorate_scope(env, feature_map, feature_default) {
   let decorate_others = feature_default;
   let n, r;
   n = env.tokens.length;
   if (decorate_others) {
      while (env.cursor < n) {
         r = decorate_feature(env, feature_map[env.tokens[env.cursor].token]);
         if (!r) r = decorate_others(env);
         if (!r) r = 1;
         env.cursor += r;
      }
   } else {
      while (env.cursor < n) {
         r = decorate_feature(env, feature_map[env.tokens[env.cursor].token]);
         if (!r) r = 1;
         env.cursor += r;
      }
   }
   return env.tokens;
}

module.exports = {
   decorate_bracket,
   decorate_scope
};