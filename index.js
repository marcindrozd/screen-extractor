var AWS = require('aws-sdk');
var fs = require('fs-extra');
var uuidv4 = require('uuid/v4');
var childProcess = require('child_process');
var archiver = require('archiver');
var async = require('async');

// Creating AWS client
var s3 = new AWS.S3();

exports.handler = (event, context, callback) => {
  var saveFolder = uuidv4();
  var folderPath = "./tmp/" + saveFolder;

  function makeDirectory(callback) {
    fs.mkdir(folderPath, function(error) {
      if (error) throw error;
      callback(null, saveFolder);
    })
  }

  function getVideo(saveFolder, callback) {
    s3.getObject({
      Bucket: 'qkvideo-dev-videos',
      Key: '2820/asset-b216d618-3ac0-4131-8292-3056dd1c1a7f/video.mp4'
    }, function(error, data) {
      if (error) throw error;
      callback(null, saveFolder, data)
    });
  }

  function saveFile(saveFolder, data, callback) {
    fs.writeFile(folderPath + '/video.mp4', data.Body, function(error) {
      if (error) throw error;
      callback()
    });
  }

  function prepareFramesToExtract(callback) {
    var framesToExtract = event.framesToExtract.map(
      function(frame) {
        timeframe = parseInt(frame).toString()
        return timeframe.length === 1 ? "0" + timeframe : timeframe
      }
    );
    callback(null, framesToExtract)
  }

  function extractFrames(framesToExtract, callback) {
    framesToExtract.forEach(function(frame) {
      childProcess.execSync("ffmpeg -i " + folderPath + "/video.mp4 -ss 00:00:" + frame + " -vframes 1 -f image2 '" + folderPath + "/image" + Date.now() + ".jpg'");
    });

    callback();
  }

  function zipFiles(callback) {
    var output = fs.createWriteStream(folderPath + '/video.zip');
    var archive = archiver('zip');

    output.on('close', function() {
      console.log(archive.pointer() + ' total bytes');
      console.log('archiver has been finalized and the output file descriptor has closed.');
      callback(null);
    });

    archive.on('error', function(err) {
      throw err;
    });

    archive.pipe(output);

    fs.readdirSync(folderPath).forEach(file => {
      if (file === 'video.zip') { return }
      console.log('Archiving', file);
      archive.append(fs.createReadStream(folderPath + '/' + file), { name: file })
    });

    archive.finalize()
  }

  function uploadFile(callback) {
    console.log('Uploading...', folderPath + '/video.zip')
    var readStream = fs.createReadStream(folderPath + '/video.zip');

    s3.upload({
      Bucket: 'qkvideo-dev-videos',
      Key: '2820/asset-b216d618-3ac0-4131-8292-3056dd1c1a7f/video.zip',
      ContentType: 'application/zip',
      Body: readStream,
    })
    .send(function (error, result) {
      readStream.close();
      if (error) { throw error }
      console.log('upload completed.');
      callback(null, result);
    });
  }

  function pingEndpointWithUrl(response, callback) {
    console.log('File url:', response.Location)

    callback(null)
  }

  async.waterfall([
    makeDirectory,
    getVideo,
    saveFile,
    prepareFramesToExtract,
    extractFrames,
    zipFiles,
    uploadFile,
    pingEndpointWithUrl,
  ], function(error, result) {
    if (error) { throw error }
    console.log('Removing directory')
    fs.removeSync(folderPath)
    console.log('All done!');
  });

  context.succeed("Yay :)");
}
