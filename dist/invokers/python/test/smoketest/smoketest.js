var chai = require('chai');
var expect = chai.expect;
var fs = require('fs-extra');
var path = require('path');
var async = require('async');
var util = require('any2api-util');

var timeout = 1000 * 60 * 15; // 15 minutes

var invokerPath = path.join(__dirname, '..', '..');
var specPathScript = path.join(__dirname, 'apispec_copy.json');

var apiSpecScript = JSON.parse(fs.readFileSync(path.join(__dirname, 'apispec.json'), 'utf8'));
apiSpecScript.apispec_path = specPathScript;

var instanceScript = {
  parameters: {
    input_file: 'some input through a file',
    input_env: 'some more input through env',
    cmd: 'python script.py foo=bar',
    invoker_config: {
      env: {
        FOO: 'some input through env'
      },
      stdin: 'hello world',
      requirements: 'requests==2.5.0\nPyYAML==3.11\n',
      access: 'local'
    }
  }
};



var cleanup = function(done) {
  async.series([
    async.apply(fs.remove, specPathScript),
    async.apply(fs.remove, path.join(invokerPath, 'node_modules'))
  ], done);
};



describe('script.py', function() {
  this.timeout(timeout);

  before(cleanup);

  before(function(done) {
    fs.writeFile(specPathScript, JSON.stringify(apiSpecScript), 'utf8', done);
  });

  it('prepare buildtime', function(done) {
    util.prepareBuildtime({ apiSpec: apiSpecScript,
                            executable_name: 'script' }, function(err) {
                              if (err) throw err;
                              
                              done();
                            });
  });

  it('prepare executable', function(done) {
    util.prepareExecutable({ apiSpec: apiSpecScript,
                             executable_name: 'script' }, function(err, updatedSpec) {
                               if (err) throw err;

                               apiSpecScript = updatedSpec;

                               expect(updatedSpec.executables.script.prepared).to.be.true;

                               done();
                             });
  });

  it('prepare runtime', function(done) {
    util.prepareRuntime({ apiSpec: apiSpecScript,
                          executable_name: 'script' }, function(err) {
                            if (err) throw err;
                            
                            done();
                          });
  });

  it('invoke executable', function(done) {
    util.invokeExecutable({ apiSpec: apiSpecScript,
                            executable_name: 'script',
                            instance: instanceScript }, function(err, instance) {
                              if (err) throw err;

                              expect(instance.finished).to.exist;

                              console.log(instance);

                              done();
                            });
  });

  after(cleanup);
});
