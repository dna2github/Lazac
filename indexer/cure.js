const i_string_index = require('./string_index');

function cure(line) {
   // let tokens = i_string_index.tokenize(line, true);
   // return tokens.join('');
   line = line.replace(/\d{4}-\d{2}-\d{2}/g, ' '); // cut date
   line = line.replace(/\d{2}:\d{2}:\d{2}([.]\d+)?( [+]\d+)?/g, ' '); // cut time
   line = line.replace(/[\d\w\-_]+([.][\d\w\-_]+){2,}/); // cut host
   line = line.replace(/[\dA-Fa-f]{2,}:?(:[\dA-Fa-f]{2,}){2,}:?/g, ' '); // cut mac
   line = line.replace(/([/][\d\w\-_+.=%]+)+/g, ' '); // cut path
   line = line.replace(/([\w\d_]+-)+[\w\d_]+/g, ' '); // cut name
   line = line.replace(/^\s+:\s+/, ''); // cut head :
   console.log(line);
   return line;
}

module.exports = {
   cure: cure
};
