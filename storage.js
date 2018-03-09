const i_fs = require('fs');
const i_path = require('path');

const Storage = {
   list_directories: (dir) => {
      dir = i_path.resolve(dir);
      return i_fs.readdirSync(dir).filter((name) => {
         let subdir = path.join(dir, name);
         let state = i_fs.lstatSync(subdir);
         return state.isDirectory();
      });
   },
   list_files: (dir, filterfn) => {
      dir = i_path.resolve(dir);
      let queue = [dir], list = [];
      while (queue.length > 0) {
         list_dir(queue.shift(), queue, list);
      }
      return list;

      function list_dir(dir, queue, list) {
         i_fs.readdirSync(dir).forEach((name) => {
            let filename = i_path.join(dir, name);
            if (filterfn && !filterfn(name, filename)) {
               return;
            }
            let state = i_fs.lstatSync(filename);
            if (state.isDirectory()) {
               queue.push(filename);
            } else {
               list.push(filename);
            }
         });
      }
   },
   make_directory: (dir) => {
      dir = i_path.resolve(dir);
      let parent_dir = i_path.dirname(dir);
      let state = true;
      if (dir !== parent_dir) {
         if (!i_fs.existsSync(parent_dir)) {
            state = Storage.make_directory(parent_dir);
         } else {
            if (!i_fs.lstatSync(parent_dir).isDirectory()) {
               state = false;
            }
         }
         if (!state) {
            return null;
         }
      }
      if (!i_fs.existsSync(dir)) {
         i_fs.mkdirSync(dir);
         return dir;
      } else if (!i_fs.lstatSync(dir).isDirectory()) {
         return null;
      } else {
         return dir;
      }
   },
   remove_directory: (dir) => {
      if (dir.length < Storage.work_dir.length) {
         return false;
      }
      if (dir.indexOf(Storage.work_dir) !== 0) {
         return false;
      }
      if (!fs.existsSync(dir)) {
         return false;
      }
      fs.readdirSync(dir).forEach(function(file, index){
         var curPath = i_path.join(dir, file);
         if (i_fs.lstatSync(curPath).isDirectory()) {
            // recurse
            Storage.rmtree(curPath);
         } else { // delete file
            i_fs.unlinkSync(curPath);
         }
      });
      i_fs.rmdirSync(dir);
      return true;
   }
};


module.exports = Storage;