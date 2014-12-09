var pkg = require('./package.json');

var debug = require('debug')(pkg.name);
var path = require('path');
var fs = require('fs-extra');
var async = require('async');
var unflatten = require('flat').unflatten;
var _ = require('lodash');
var lockFile = require('lockfile');

var util = require('any2api-util');



util.readInput(null, function(err, apiSpec, params) {
  if (err) throw err;

  if (!params.run_list) {
    console.error('run_list parameter missing');

    process.exit(1);
  }

  var config = params.invoker_config || {};

  config.access = config.access || 'local';
  config.min_runs = config.min_runs || 1;
  config.max_runs = config.max_runs || 3;

  var runParams = params._;
  delete params._;

  //runParams.run_id = runParams.run_id || uuid.v4();
  if (!runParams.run_path) {
    console.error('_.run_path parameter missing');

    process.exit(1);
  }

  var runOutputDir = path.join(runParams.run_path, 'out');
  var baseDir = path.join('/', 'tmp', 'any2api-invoker-chef', runParams.executable_name);

  var executable = apiSpec.executables[runParams.executable_name];

  // Invoker status and remote access (local, SSH, ...)
  var invokerStatusFile = path.resolve(__dirname, 'invoker-status.json');
  var invokerStatus = { hosts: {} };
  var access;
  var host = 'localhost';

  // Lock
  var lockWait = 5000;
  var lockFilePath = path.resolve(__dirname, 'invoker-status.lock');

  // Files and directories
  var origExecDir = path.resolve(apiSpec.apispec_path, '..', executable.path);
  var execDir = path.join(baseDir, 'executable');

  var chefDir = path.join(baseDir, 'chef_data');
  var cookbooksDir = path.join(baseDir, 'chef_data', 'cookbooks');
  var rolesDir = path.join(baseDir, 'chef_data', 'roles');

  var runStatusFile = path.join(baseDir, '.environment_installed');
  var chefConfigFile = path.join(baseDir, 'chef.rb');
  var runListFile = path.join(baseDir, 'run_list.json');

  var chefConfig = [
    'file_cache_path "' + chefDir + '"',
    'cookbook_path [ "' + cookbooksDir + '" ]',
    'role_path "' + rolesDir + '"'
  ].join('\n');

  var commands = {
    install: [
      'sudo apt-get -y update',
      'sudo apt-get -y install curl',
      'sudo yum -y install curl',
      'curl -L https://www.opscode.com/chef/install.sh | sudo bash'
    ].join(' ; '),
    run: 'sudo chef-solo -c ' + chefConfigFile + ' -j ' + runListFile,
  };



  var prepare = function(done) {
    if (config.access === 'local') {
      access = require('any2api-access').Local(config);
    } else if (config.access === 'ssh') {
      access = require('any2api-access').SSH(config);

      host = config.ssh_host;
    } else {
      return done(new Error('access \'' + config.access + '\' not supported'));
    }

    async.series([
      async.apply(lockFile.lock, lockFilePath, { wait: lockWait }),
      function(callback) {
        if (fs.existsSync(invokerStatusFile)) {
          invokerStatus = JSON.parse(fs.readFileSync(invokerStatusFile, 'utf8'));
        }

        if (invokerStatus.hosts[host]) {
          return callback(new Error('Chef invoker already running on ' + host));
        } else {
          invokerStatus.hosts[host] = 'running';
        }

        fs.writeFileSync(invokerStatusFile, JSON.stringify(invokerStatus), 'utf8');

        callback();
      },
      async.apply(lockFile.unlock, lockFilePath)
    ], done);
  };

  var install = function(done) {
    var cookbookName = executable.cookbook_name;

    var metadataPath = path.resolve(origExecDir, 'metadata.json');

    if (!cookbookName && fs.existsSync(metadataPath)) {
      var metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

      if (metadata.name) cookbookName = metadata.name;
    }

    if (!cookbookName) return done(new Error('cookbook name cannot be determined'));

    var cookbookDir = path.join(cookbooksDir, cookbookName);

    executable.dependencies_subdir = executable.dependencies_subdir || 'cookbook_dependencies';

    async.series([
      async.apply(access.mkdir, { path: baseDir }),
      async.apply(access.mkdir, { path: chefDir }),
      //async.apply(access.mkdir, { path: cookbooksDir }),
      async.apply(access.mkdir, { path: rolesDir }),
      async.apply(access.copyDirToRemote, { sourcePath: origExecDir, targetPath: execDir }),
      async.apply(access.writeFile, { path: chefConfigFile, content: chefConfig }),
      async.apply(access.mkdir, { path: path.join(execDir, executable.dependencies_subdir, '..') }),
      async.apply(access.move, { sourcePath: path.join(execDir, executable.dependencies_subdir), targetPath: cookbooksDir }),
      function(callback) {
        access.mkdir({ path: cookbookDir }, callback);
      },
      function(callback) {
        access.copy({ sourcePath: execDir, targetPath: cookbookDir }, callback);
      },
      //function(callback) {
      //  access.remove({ path: path.join(cookbookDir, executable.dependencies_subdir) }, callback);
      //},
      function(callback) {
        access.exec({ command: commands.install }, function(err, stdout, stderr) {
          if (stderr) console.error(stderr);
          if (stdout) console.log(stdout);

          if (err) {
            err.stderr = stderr;
            err.stdout = stdout;

            return callback(err);
          }

          callback();
        });
      },
      async.apply(access.writeFile, { path: runStatusFile, content: 'installed' })
    ], done);
  };

  var run = function(done) {
    var runs = 0;
    var success = false;

    var attributes = unflatten(params, { delimiter: '/' });

    access.writeFile({ path: runListFile, content: JSON.stringify(attributes) }, function(err) {
      async.whilst(function() {
        return !success && runs < config.max_runs;
      }, function(done) {
        runs++;

        access.exec({ command: commands.run }, function(err, stdout, stderr) {
          if (stderr) console.error(stderr);
          if (stdout) console.log(stdout);

          if ((err && runs < config.max_runs) || runs < config.min_runs) {
            return done();
          } else if (err) {
            err.stderr = stderr;
            err.stdout = stdout;

            return done(err);
          } else {
            success = true;

            console.log('Number of runs:', runs);

            var psOutput;

            // Write outputs
            async.series([
              async.apply(fs.mkdirs, runOutputDir),
              async.apply(fs.writeFile, path.resolve(runOutputDir, 'run_list.json'), JSON.stringify(attributes)),
              function(callback) {
                access.exec({ command: 'ps aux' }, function(err, stdout, stderr) {
                  psOutput = stdout;

                  callback(err);
                });
              },
              function(callback) {
                fs.writeFile(path.resolve(runOutputDir, 'ps_aux.txt'), psOutput, callback);
              }
            ], done);
          }
        });
      }, done);
    });
  };



  var skipInstall = false;

  async.series([
    async.apply(prepare),
    function(callback) {
      access.exists({ path: runStatusFile }, function(err, exists) {
        if (exists) skipInstall = true;

        callback(err);
      });
    },
    function(callback) {
      if (skipInstall) return callback();

      install(callback);
    },
    async.apply(run)
  ], function(err) {
    async.series([
      async.apply(access.remove, { path: baseDir }),
      async.apply(access.terminate),
      async.apply(lockFile.lock, lockFilePath, { wait: lockWait }),
      function(callback) {
        invokerStatus = JSON.parse(fs.readFileSync(invokerStatusFile, 'utf8'));

        delete invokerStatus.hosts[host];

        fs.writeFileSync(invokerStatusFile, JSON.stringify(invokerStatus), 'utf8');
      },
      async.apply(lockFile.unlock, lockFilePath)
    ], function(err2) {
      if (err) throw err;

      if (err2) console.error(err2);
    });
  });
});
