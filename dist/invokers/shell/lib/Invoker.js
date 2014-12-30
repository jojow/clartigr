var log = require('verr-log')();
var path = require('path');
var async = require('async');
var _ = require('lodash');
var shortId = require('shortid');

var acc = require('any2api-access');
var util = require('any2api-util');



module.exports = function(spec) {
  var obj = {};

  obj.invoke = function(args, done) {
    args = args || {};

    var apiSpec = args.apiSpec;
    if (!apiSpec) return done(new Error('API spec missing'));

    var params = args.parameters;
    if (!params) return done(new Error('parameters missing'));

    if (!params.cmd) return done(new Error('cmd parameter missing'));

    var config = params.invoker_config || {};

    config.access = config.access || 'local';
    config.stdin = config.stdin || '';
    config.env = config.env || {};

    var runParams = params._;
    delete params._;

    runParams.run_id = runParams.run_id || uuid.v4();

    if (!runParams.run_path) return done(new Error('_.run_path parameter missing'));

    var executable = apiSpec.executables[runParams.executable_name];

    var localExecPath = path.resolve(apiSpec.apispec_path, '..', executable.path);
    var remoteExecPath = path.join('/', 'tmp', shortId.generate());

    // Find parameters that need to be mapped to environment variables
    _.each(util.getMappedParametersSync({
      apiSpec: apiSpec,
      executable_name: runParams.executable_name,
      parameters: params,
      mappingType: 'env'
    }), function(def, name) {
      if (!config.env[name] && def.value) {
        config.env[name] = def.value;
      }
    });

    // Find parameter that need to be mapped to stdin
    _.each(util.getMappedParametersSync({
      apiSpec: apiSpec,
      executable_name: runParams.executable_name,
      parameters: params,
      mappingType: 'stdin'
    }), function(def, name) {
      if (!_.isEmpty(config.stdin) && def.value) {
        config.stdin = def.value;
      }
    });

    var access;

    if (acc[config.access]) {
      access = acc[config.access]();
    } else {
      return done(new Error('access \'' + config.access + '\' not supported'));
    }



    var run = function(done) {
      async.series([
        async.apply(access.remove, { path: remoteExecPath }),
        async.apply(access.mkdir, { path: path.join(remoteExecPath, '..') }),
        async.apply(access.copyDirToRemote, { sourcePath: localExecPath, targetPath: remoteExecPath }),
        async.apply(util.writeParameters, {
          apiSpec: apiSpec,
          executable_name: runParams.executable_name,
          parameters: params,
          remotePath: remoteExecPath,
          access: access
        }),
        function(callback) {
          access.exec({
            command: params.cmd,
            env: config.env,
            stdin: config.stdin,
            path: remoteExecPath
          }, function(err, stdout, stderr) {
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
        async.apply(util.collectResults, {
          apiSpec: apiSpec,
          executable_name: runParams.executable_name,
          localPath: runParams.run_path,
          remotePath: remoteExecPath,
          access: access
        })
      ], done);
    };



    async.series([
      async.apply(run)
    ], function(err) {
      async.series([
        async.apply(access.terminate)
      ], function(err2) {
        if (err2) log.error(err2);

        done(err);
      });
    });
  };

  return obj;
};
