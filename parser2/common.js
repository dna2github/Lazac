const TAG_COMMENT = 'comment';
const TAG_STRING = 'string';
const TAG_REGEX = 'regex';
const TAG_FUNCTION = 'function';
const TAG_CLASS = 'class'; // class, interface, enum, struct
const TAG_MODULE = 'module'; // namespace

const stops = [
   '~', '`', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')',
   '-', /*'_'*/, '=', '+', '{', '}', '[', ']', '\\', '|', ':', ';',
   '"', '\'', ',', '.', '<', '>', '/', '?', ' ', '\t', '\r', '\n'
];

// '' -> TAG_COMMENT
const space = ['', ' ', '\t'];
const spacen = ['', ' ', '\t', '\r', '\n'];

function is_space(ch) {
   return space.indexOf(ch) >= 0;
}

function is_spacen(ch) {
   return spacen.indexOf(ch) >= 0;
}

function is_not_space(ch) {
   return space.indexOf(ch) < 0;
}

function is_not_spacen(ch) {
   return space.indexOf(ch) < 0;
}

function search_prev(tokens, index, fn) {
   while(index >= 0 && fn(tokens[index])) {
      index --;
   }
   return index;
}

function search_next(tokens, index, fn) {
   let n = tokens.length;
   while(index < n && fn(tokens[index])) {
      index ++;
   }
   return index;
}

function search_prev_skip_space(tokens, index) {
   return search_prev(tokens, index, (x) => is_space(x.token));
}

function search_next_skip_space(tokens, index) {
   return search_next(tokens, index, (x) => is_space(x.token));
}

function search_prev_skip_spacen(tokens, index) {
   return search_prev(tokens, index, (x) => is_spacen(x.token));
}

function search_next_skip_spacen(tokens, index) {
   return search_next(tokens, index, (x) => is_spacen(x.token));
}

function search_prev_stop(tokens, index, query_list) {
   return search_prev(tokens, index, (x) => {
      return query_list.indexOf(x.token) < 0;
   });
}

function search_next_stop(tokens, index, query_list) {
   return search_next(tokens, index, (x) => {
      return query_list.indexOf(x.token) < 0;
   });
}

function subtokens(tokens, st, ed, fn) {
   let r = tokens.slice(st, ed).map((x) => x.token);
   if (fn) {
      r = r.filter(fn);
   }
   return r.join('');
}

function clear_token_block(tokens, st, ed) {
   for (let i = st; i <= ed; i++) {
      let token = tokens[i];
      if (token.startIndex === undefined) continue;
      delete token.startIndex;
      delete token.endIndex;
   }
}

const left_bracket  = ['{', '[', '(', '<'];
const right_bracket = ['}', ']', ')', '>'];
const bracket_map = {
   '{': '}', '}': '{', '(': ')', '}': '(',
   '[': ']', ']': '[', '<': '>', '>': '<'
};

function detect_pair(tokens, index) {
   let token = tokens[index], ch = token.token;
   let st, ed, c;
   if (left_bracket.indexOf(ch) >= 0) {
      st = index;
      if (token.endIndex !== undefined) {
         return { startIndex: st, endIndex: token.endIndex };
      }
      ed = st;
      c = 1;
      while (c > 0) {
         ed = search_next_stop(tokens, ed+1, [ch, bracket_map[ch]]);
         token = tokens[ed];
         if (token.token === ch) {
            c ++;
            continue
         }
         c --;
      }
      return { startIndex: st, endIndex: ed };
   } else if (right_bracket.indexOf(ch) >= 0) {
      ed = index;
      if (token.startIndex !== undefined) {
         return { startIndex: token.startIndex, endIndex: ed };
      }
      st = ed;
      c = 1;
      while (c > 0) {
         st = search_prev_stop(tokens, st-1, [ch, bracket_map[ch]]);
         token = tokens[st];
         if (token.token === ch) {
            c ++;
            continue
         }
         c --;
      }
   } else {
      // should not be here
      return null;
   }
}

module.exports = {
   TAG_CLASS,
   TAG_COMMENT,
   TAG_FUNCTION,
   TAG_MODULE,
   TAG_REGEX,
   TAG_STRING,
   stops,
   space,
   spacen,
   is_space,
   is_spacen,
   is_not_space,
   is_not_spacen,
   search_prev,
   search_next,
   search_next_skip_space,
   search_prev_skip_space,
   search_next_skip_spacen,
   search_prev_skip_spacen,
   search_prev_stop,
   search_next_stop,
   subtokens,
   clear_token_block,
   detect_pair
};