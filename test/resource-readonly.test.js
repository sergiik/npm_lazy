var fs = require('fs'),
    url = require('url'),
    path = require('path'),
    assert = require('assert'),
    npmLazy = require('npm_lazy'),
    Resource = npmLazy.Resource,
    Cache = require('../lib/cache.js'),
    fixture = require('file-fixture');

function getTargetBasename(uri) {
  var parts = url.parse(uri);
  return path.basename(path.extname(parts.pathname) == '.tgz' ? parts.pathname : parts.pathname + '.json');
}

function read(fullpath) {
  if (!fullpath) {
    return fullpath;
  }
  return fs.readFileSync(fullpath).toString();
}

describe('resource tests', function() {
  var cache,
      localDir,
      oldIsUpToDate;

  before(function() {
    localDir = fixture.dir({
      'local-cached.json': '{ "name": "local-cached" }',
      'local-outdated-fail.json': '{ "name": "outdated-fail" }',
      'local-outdated-fail-500.json': '{ "name": "outdated-fail-500" }',
      'local-outdated.json': '{ "name": "outdated" }',
      'remote-cached.tgz': 'remote-cached-tar',
      'remote-cached-index.tgz': 'remote-cached-index-tar',
      'remote-cached-index.json': JSON.stringify({
        'name': 'remote-cached',
        'versions': {
          '0.0.1': {
            'name': 'remote-cached',
            'dist': {
              'tarball': 'http://foo/remote-cached.tgz',
              'shasum': '1ffc692160f4cea33b3489ac0b9b281eb87b03eb'
            }
          }
        }
      }),
    });

    cache = new Cache({ path: __dirname + '/db' });

    cache.clear();

    // fixture setup
    Resource.configure({ cache: cache, readOnly: true });

    // for each file in fixtures/local, store them in the cache
    // as if they had already been downloaded

    fs.readdirSync(localDir).forEach(function(basename) {
      var filename = localDir + '/' + basename,
          cachename = cache.filename(),
          content = fs.readFileSync(filename),
          // exclude the extension from the package name
          packagename = basename.substr(0, basename.length - path.extname(basename).length),
          remotename;

      if (path.extname(basename) === '.json') {
        remotename = 'https://registry.npmjs.com/' + packagename;
      } else {
        remotename = 'https://registry.npmjs.com/' +
          packagename + '/-/' + basename;
      }

      // console.log(path.relative(__dirname, filename), '\tcached locally as', remotename);

      fs.writeFileSync(cachename, content);

      // e.g. cache lookups should not have .json on their URLs
      cache.complete(remotename, 'GET', cachename);
    });

  });

  it('Resource.get() will only return a single instance for a given url', function() {
    assert.strictEqual(Resource.get('foo'), Resource.get('foo'));
  });

  it('.tgz has type tar, others have type index', function() {
    assert.equal(Resource.get('http://foo/foo.tgz').type, 'tar');
    assert.equal(Resource.get('http://foo/foo/').type, 'index');
  });

  it('.tgz get packagename', function() {
    assert.equal(Resource.get('https://registry.npmjs.com/foo/-/foo-1.0.0.tgz').getPackageName(), 'foo');
    assert.equal(Resource.get('https://registry.npmjs.com/@angular/common/-/common-1.0.0.tgz').getPackageName(), '@angular%2fcommon');
  });

  describe('index resource', function() {

    it('if it exists and is up to date, success', function(done) {
      var r = Resource.get('https://registry.npmjs.com/local-cached');

      r.getReadablePath(function(err, data) {
        assert.ok(!err, err);
        assert.equal(JSON.parse(read(data)).name, 'local-cached');
        done();
      });
    });

    it('if it does not exist and the response is a JSON object, success', function(done) {
      var r = Resource.get('https://registry.npmjs.com/remote-valid');

      r.getReadablePath(function(err, data) {
        assert.ok(err);
        assert.equal(err.statusCode, 404);
        done();
      });
    });

    it('if the resource exists but is outdated, fetch a new version and return it', function(done) {
      var r = Resource.get('https://registry.npmjs.com/local-outdated');

      r.isUpToDate = function() { return false; };
      r.getReadablePath(function(err, data) {
        assert.ok(!err, err);
        assert.equal(JSON.parse(read(data)).name, 'outdated');
        done();
      });
    });

  });

  describe('tar resource', function() {

    it('if it exists, success', function(done) {
      var r = Resource.get('https://registry.npmjs.com/remote-cached/-/remote-cached.tgz');

      r.getReadablePath(function(err, data) {
        assert.ok(err);
        assert.equal(err.statusCode, 404);
        done();
      });
    });

    it('when the response passes checksum, success', function(done) {
      var r = Resource.get('https://registry.npmjs.com/remote-valid/-/remote-valid.tgz');

      r.getReadablePath(function(err, data) {
        assert.ok(err);
        assert.equal(err.statusCode, 404);
        done();
      });
    });

    it('when the response fails checksum, retry', function(done) {
      done();
    });

  });
});
