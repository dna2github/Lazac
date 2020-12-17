const i_fs = require('fs');
const i_path = require('path');

module.exports = {
   one: (mtime, flag, size, name, path) => {
      if (flag !== 'F') return;
      console.log(name);
      const dir = i_path.join(path, '.lazac', 'files', `${name}.meta`);
      i_fs.mkdirSync(dir, { recursive: true });
   }
};
