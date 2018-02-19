const i_common = require('./common');

/* env = { text, cursor, tokens, ... } */

function extract_symbol(env) {
   let st = env.cursor, ed = st;
   let n = env.text.length;
   let ch;
   while (ed < n) {
      ch = env.text.charAt(ed);
      if (i_common.stops.indexOf(ch) >= 0) break;
      ed ++;
   }
   if (st === ed) {
      // operator
      return {
         token: env.text.substring(st, ed+1)
      };
   } else {
      // symbol
      return {
         token: env.text.substring(st, ed)
      };
   }
}

function extract_comment(env, start, end) {
   let st = env.cursor;
   if (env.text.substring(st, st+start.length) !== start) return null;
   let ed = env.text.indexOf(end, st + start.length);
   if (ed < 0) ed = env.text.length; else ed += end.length;
   return {
      tag: i_common.TAG_COMMENT,
      token: env.text.substring(st, ed)
   };
}

function extract_string(env, start, end, escape_on) {
   let st = env.cursor;
   if (env.text.substring(st, st+start.length) !== start) return null;
   let ed = env.text.indexOf(end, st + start.length);
   if (escape_on) {
      let ed_len = end.length, es_len = escape_on.length;
      while (ed >= 0) {
         ed = env.text.indexOf(end, ed);
         if (env.text.substring(ed-es_len, ed) !== escape_on) break;
         ed += ed_len;
      }
   }
   if (ed < 0) ed = env.text.length; else ed += end.length;
   return {
      tag: i_common.TAG_STRING,
      token: env.text.substring(st, ed)
   };
}

function extract_regex(env) {
   // e.g. /^test$/gi
   return null;
}

function extract_feature(env, features) {
   if (!features) return null;
   let i, n, r;
   for (i = 0, n = features.length; i < n; i++) {
      r = features[i](env);
      if (r) return r;
   }
   return null;
}

function extract_tokens_feature_generator(f, args) {
   return (env) => {
      return f(env, ...args);
   };
}

function extract_tokens(env, feature_map) {
   let extract_others = feature_map.default || extract_symbol;
   let n, r, output;
   output = [];
   env.tokens = output;
   n = env.text.length;
   while (env.cursor < n) {
      r = extract_feature(env, feature_map[env.text.charAt(env.cursor)]);
      if (!r) r = extract_others(env);
      if (!r) { /* not belong to any feature; should not be here */ }
      output.push(r);
      env.cursor += r.token.length;
      if (r.tag === i_common.TAG_COMMENT) {
         r.comment = r.token;
         r.token = '';
      }
   }
   return output;
}

//console.log(extract_comment({text: 'aa//"test\\"test" test', cursor: 2}, '//', '\n'));
//console.log(extract_string({text: 'aa"test\\"test" test', cursor: 2}, '"', '"', '\\'));

module.exports = {
   extract_symbol,
   extract_comment,
   extract_string,
   extract_feature,
   extract_tokens_feature_generator,
   extract_tokens
};