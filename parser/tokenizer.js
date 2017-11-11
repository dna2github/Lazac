const fsm = require('./fsm');

const common_stops = [
   '~', '`', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')',
   '-', '_', '=', '+', '{', '}', '[', ']', '\\', '|', ':', ';',
   '"', '\'', ',', '.', '<', '>', '/', '?', ' ', '\t', '\r', '\n'
];

class WordTokenizer {
   process(text) {
      let output = [];
      let new_word = true;
      text.split('').forEach((ch) => {
         if (common_stops.indexOf(ch) < 0) {
            if (new_word) {
               output.push(ch);
               new_word = false;
            } else {
               output.push(output.pop() + ch);
            }
         } else {
            output.push(ch);
            new_word = true;
         }
      });
      return output.map((x) => {
         return { token: x, tag: null };
      });
   }
}

module.exports = {
   WordTokenizer
};