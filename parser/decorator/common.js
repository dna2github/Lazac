const i_utils = require('../../utils');

function is_space(token) {
   if (token.tag === i_utils.TAG_COMMENT) {
      return true;
   }
   if (i_utils.common_space.indexOf(token.token) >= 0) {
      return true;
   }
   return false;
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
   is_space,
   decorate_feature,
   decorate_scope
};