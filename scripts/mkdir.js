const i_fs = require('fs');
const i_path = require('path');

const api = {
   path: (base_dir, relative_path) => {
      const dir = i_path.join(base_dir, '.lazac', 'files', `${relative_path}.meta`);
      return dir;
   }
};

module.exports = {
   api,
   one: (mtime, flag, size, name, path) => {
      if (flag !== 'F') return;
      console.log(name);
      const dir = api.path(path, name);
      i_fs.mkdirSync(dir, { recursive: true });
   },
};
